"""上傳批次查詢 API"""

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_app import celery_app
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.file import File, FileStatus
from app.models.upload_batch import UploadBatch, UploadBatchItem, UploadBatchItemStatus, UploadBatchStatus
from app.models.user import User, UserRole
from app.services.progress_pubsub import publish_batch_event, subscribe_batch_events


router = APIRouter(prefix="/batches", tags=["批次任務"])


def _cleanup_file_outputs_for_canceled(file_record: File) -> None:
    """清理取消任務的中間產物，保留 unprocessed 原始檔供重試。"""
    candidate_paths = [
        file_record.markdown_path,
        file_record.summary_path,
        file_record.embedding_path,
    ]

    for path_str in candidate_paths:
        if not path_str:
            continue
        try:
            path = Path(path_str)
            if path.exists() and path.is_file():
                path.unlink()
        except Exception:
            pass

    # 若有已生成的 processed 產物，按檔名主幹嘗試清理。
    filename_stem = Path(file_record.filename).stem
    try:
        uploads_index = file_record.file_path.find("/uploads/")
        if uploads_index == -1:
            return

        uploads_root = Path(file_record.file_path[: uploads_index + len("/uploads/")])
        dept_id = str(file_record.department_id)
        processed_root = uploads_root / dept_id / "processed"

        for subdir, pattern in [
            ("output_md", f"{filename_stem}.md"),
            ("summaries", f"{filename_stem}*_summary.json"),
            ("embeddings", f"{filename_stem}*_embedding.json"),
            ("embeddings", f"{filename_stem}*_embeddings.json"),
        ]:
            target_dir = processed_root / subdir
            if not target_dir.exists():
                continue
            for output_path in target_dir.glob(pattern):
                try:
                    if output_path.is_file():
                        output_path.unlink()
                except Exception:
                    pass
    except Exception:
        pass


def _deactivate_file_for_canceled(file_record: File) -> None:
    """取消任務時移除實體與產物，並將檔案標為不可用。"""
    try:
        if file_record.file_path:
            source_path = Path(file_record.file_path)
            if source_path.exists() and source_path.is_file():
                source_path.unlink()
    except Exception:
        pass

    _cleanup_file_outputs_for_canceled(file_record)

    file_record.status = FileStatus.FAILED
    file_record.processing_step = "canceled"
    file_record.error_message = "使用者手動取消任務"
    file_record.is_vectorized = False
    file_record.chunk_count = 0
    file_record.vector_count = 0
    file_record.markdown_path = None
    file_record.summary_path = None
    file_record.embedding_path = None


async def _load_snapshot(batch_id: str, db: AsyncSession) -> dict:
    batch = await db.get(UploadBatch, batch_id)
    items_result = await db.execute(
        select(UploadBatchItem).where(UploadBatchItem.batch_id == batch_id)
    )
    items = items_result.scalars().all()

    file_ids = [item.file_id for item in items]
    filenames = {}
    if file_ids:
        file_result = await db.execute(select(File).where(File.id.in_(file_ids)))
        file_records = file_result.scalars().all()
        filenames = {file.id: file.original_filename for file in file_records}

    total_progress = sum(item.processing_progress for item in items)
    avg_progress = int(total_progress / len(items)) if items else 0
    canceled_files = sum(1 for item in items if item.status == UploadBatchItemStatus.CANCELED)

    return {
        "batch_id": batch.id,
        "status": batch.status.value,
        "total_files": batch.total_files,
        "processed_files": batch.processed_files,
        "success_files": batch.success_files,
        "failed_files": batch.failed_files,
        "canceled_files": canceled_files,
        "progress": avg_progress,
        "error_message": batch.error_message,
        "created_at": batch.created_at,
        "updated_at": batch.updated_at,
        "finished_at": batch.finished_at,
        "items": [
            {
                "id": item.id,
                "file_id": item.file_id,
                "filename": filenames.get(item.file_id, f"file-{item.file_id}"),
                "celery_task_id": item.celery_task_id,
                "status": item.status.value,
                "processing_step": item.processing_step,
                "processing_progress": item.processing_progress,
                "error_message": item.error_message,
                "started_at": item.started_at,
                "finished_at": item.finished_at,
                "updated_at": item.updated_at,
            }
            for item in items
        ],
    }


def _recalculate_batch_from_items(batch: UploadBatch, items: list[UploadBatchItem], now: datetime) -> tuple[int, int, int]:
    """依 item 狀態重新計算批次計數與狀態。"""
    total = len(items)
    success = sum(1 for item in items if item.status == UploadBatchItemStatus.COMPLETED)
    failed = sum(1 for item in items if item.status == UploadBatchItemStatus.FAILED)
    canceled = sum(1 for item in items if item.status == UploadBatchItemStatus.CANCELED)

    batch.total_files = total
    batch.processed_files = success + failed + canceled
    batch.success_files = success
    batch.failed_files = failed

    if batch.processed_files < total:
        batch.status = UploadBatchStatus.PROCESSING
        batch.finished_at = None
    else:
        batch.finished_at = now
        if canceled == total:
            batch.status = UploadBatchStatus.CANCELED
        elif failed == 0 and canceled == 0:
            batch.status = UploadBatchStatus.COMPLETED
        elif success == 0 and canceled == 0:
            batch.status = UploadBatchStatus.FAILED
        else:
            batch.status = UploadBatchStatus.PARTIAL

    return success, failed, canceled


@router.get("/{batch_id}", summary="取得批次處理快照")
async def get_batch_snapshot(
    batch_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    batch = await db.get(UploadBatch, batch_id)

    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="批次任務不存在")

    if batch.department_id != current_user.department_id and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="無權限查看此批次")

    snapshot = await _load_snapshot(batch_id, db)

    return {
        "success": True,
        "data": snapshot,
    }


@router.get("/{batch_id}/events", summary="訂閱批次即時進度 (SSE)")
async def stream_batch_events(
    batch_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    batch = await db.get(UploadBatch, batch_id)

    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="批次任務不存在")

    if batch.department_id != current_user.department_id and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="無權限查看此批次")

    snapshot = await _load_snapshot(batch_id, db)

    async def event_generator():
        yield f"event: snapshot\ndata: {json.dumps(snapshot, ensure_ascii=False, default=str)}\n\n"
        async for message in subscribe_batch_events(batch_id, heartbeat_interval_seconds=15.0):
            if message is None:
                # SSE keepalive comment，避免中間層因閒置中斷連線
                yield ": keepalive\n\n"
                continue

            yield f"event: progress\ndata: {message}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{batch_id}/cancel", summary="取消批次處理任務")
async def cancel_batch(
    batch_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    batch = await db.get(UploadBatch, batch_id)

    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="批次任務不存在")

    if batch.department_id != current_user.department_id and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="無權限取消此批次")

    if batch.status in {UploadBatchStatus.COMPLETED, UploadBatchStatus.FAILED, UploadBatchStatus.CANCELED}:
        snapshot = await _load_snapshot(batch_id, db)
        return {
            "success": True,
            "message": f"批次已是終態：{batch.status.value}",
            "data": snapshot,
        }

    items_result = await db.execute(
        select(UploadBatchItem).where(UploadBatchItem.batch_id == batch_id)
    )
    items = items_result.scalars().all()

    file_ids = [item.file_id for item in items]
    file_map: dict[int, File] = {}
    if file_ids:
        file_result = await db.execute(select(File).where(File.id.in_(file_ids)))
        file_records = file_result.scalars().all()
        file_map = {file.id: file for file in file_records}

    canceled_count = 0
    revoked_task_ids: list[str] = []
    now = datetime.now(timezone.utc)

    for item in items:
        if item.status in {UploadBatchItemStatus.COMPLETED, UploadBatchItemStatus.FAILED, UploadBatchItemStatus.CANCELED}:
            continue

        item.status = UploadBatchItemStatus.CANCELED
        item.processing_step = "canceled"
        item.error_message = "使用者手動取消任務"
        item.finished_at = now
        canceled_count += 1

        if item.celery_task_id:
            revoked_task_ids.append(item.celery_task_id)

        file_record = file_map.get(item.file_id)
        if file_record:
            if file_record.status != FileStatus.COMPLETED:
                _deactivate_file_for_canceled(file_record)

    # 批次狀態與計數重新計算
    success, failed, canceled = _recalculate_batch_from_items(batch, items, now)
    batch.finished_at = now
    batch.error_message = "使用者手動取消任務"

    await db.commit()

    for task_id in revoked_task_ids:
        try:
            celery_app.control.revoke(task_id, terminate=True, signal="SIGTERM")
        except Exception as revoke_error:
            print(f"⚠️ 取消 Celery 任務失敗 ({task_id}): {revoke_error}")

    for item in items:
        if item.status != UploadBatchItemStatus.CANCELED:
            continue
        await publish_batch_event(
            batch_id,
            {
                "type": "file_canceled",
                "batch_id": batch_id,
                "file_id": item.file_id,
                "celery_task_id": item.celery_task_id,
                "step": item.processing_step,
                "progress": item.processing_progress,
                "status": item.status.value,
                "message": item.error_message,
                "updated_at": now.isoformat(),
            },
        )

    await publish_batch_event(
        batch_id,
        {
            "type": "batch_canceled",
            "batch_id": batch_id,
            "status": batch.status.value,
            "total_files": batch.total_files,
            "processed_files": batch.processed_files,
            "success_files": batch.success_files,
            "failed_files": batch.failed_files,
            "canceled_files": canceled,
            "updated_at": now.isoformat(),
            "message": "使用者手動取消任務",
        },
    )

    snapshot = await _load_snapshot(batch_id, db)
    return {
        "success": True,
        "message": f"已取消 {canceled_count} 個處理中的檔案",
        "data": snapshot,
    }


@router.post("/{batch_id}/files/{file_id}/cancel", summary="取消單一檔案處理任務")
async def cancel_batch_file(
    batch_id: str,
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    batch = await db.get(UploadBatch, batch_id)

    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="批次任務不存在")

    if batch.department_id != current_user.department_id and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="無權限取消此批次")

    item_result = await db.execute(
        select(UploadBatchItem).where(
            UploadBatchItem.batch_id == batch_id,
            UploadBatchItem.file_id == file_id,
        )
    )
    item = item_result.scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="批次檔案任務不存在")

    if item.status in {UploadBatchItemStatus.COMPLETED, UploadBatchItemStatus.FAILED, UploadBatchItemStatus.CANCELED}:
        snapshot = await _load_snapshot(batch_id, db)
        return {
            "success": True,
            "message": f"檔案任務已是終態：{item.status.value}",
            "data": snapshot,
        }

    now = datetime.now(timezone.utc)
    item.status = UploadBatchItemStatus.CANCELED
    item.processing_step = "canceled"
    item.error_message = "使用者手動取消任務"
    item.finished_at = now

    file_record = await db.get(File, file_id)
    if file_record and file_record.status != FileStatus.COMPLETED:
        _deactivate_file_for_canceled(file_record)

    if item.celery_task_id:
        try:
            celery_app.control.revoke(item.celery_task_id, terminate=True, signal="SIGTERM")
        except Exception as revoke_error:
            print(f"⚠️ 取消 Celery 任務失敗 ({item.celery_task_id}): {revoke_error}")

    items_result = await db.execute(
        select(UploadBatchItem).where(UploadBatchItem.batch_id == batch_id)
    )
    items = items_result.scalars().all()
    success, failed, canceled = _recalculate_batch_from_items(batch, items, now)
    batch.error_message = "使用者手動取消任務"

    await db.commit()

    await publish_batch_event(
        batch_id,
        {
            "type": "file_canceled",
            "batch_id": batch_id,
            "file_id": item.file_id,
            "celery_task_id": item.celery_task_id,
            "step": item.processing_step,
            "progress": item.processing_progress,
            "status": item.status.value,
            "message": item.error_message,
            "updated_at": now.isoformat(),
        },
    )

    await publish_batch_event(
        batch_id,
        {
            "type": "batch_progress",
            "batch_id": batch_id,
            "status": batch.status.value,
            "total_files": batch.total_files,
            "processed_files": batch.processed_files,
            "success_files": success,
            "failed_files": failed,
            "canceled_files": canceled,
            "updated_at": now.isoformat(),
            "message": "使用者手動取消單一檔案",
        },
    )

    snapshot = await _load_snapshot(batch_id, db)
    return {
        "success": True,
        "message": "已取消單一檔案處理",
        "data": snapshot,
    }
