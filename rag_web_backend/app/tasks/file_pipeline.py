"""檔案處理 Celery 任務"""

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, TypeVar

from celery import states
import redis.asyncio as redis
from sqlalchemy import select

from app.celery_app import celery_app
from app.config import settings
from app.core.database import AsyncSessionLocal
from app.models.file import File
from app.models.upload_batch import (
    UploadBatch,
    UploadBatchItem,
    UploadBatchItemStatus,
    UploadBatchStatus,
)
from app.services.file_processor import FileProcessingService
from app.services.progress_pubsub import publish_batch_event


T = TypeVar("T")
_PROCESS_EVENT_LOOP: asyncio.AbstractEventLoop | None = None


def _run_in_process_event_loop(coro: Awaitable[T]) -> T:
    """在 Celery worker process 內重用單一 event loop，避免跨 loop 連線錯誤。"""
    global _PROCESS_EVENT_LOOP

    if _PROCESS_EVENT_LOOP is None or _PROCESS_EVENT_LOOP.is_closed():
        _PROCESS_EVENT_LOOP = asyncio.new_event_loop()
        asyncio.set_event_loop(_PROCESS_EVENT_LOOP)

    return _PROCESS_EVENT_LOOP.run_until_complete(coro)


def _is_file_vectorized_and_ready(file_record: File) -> bool:
    """檢查檔案是否已完成向量化且主要產物存在"""
    if not file_record:
        return False

    required_paths = [
        file_record.file_path,
        file_record.markdown_path,
        file_record.summary_path,
        file_record.embedding_path,
    ]

    if not file_record.is_vectorized:
        return False

    return all(path and Path(path).exists() for path in required_paths)


async def _refresh_batch_counters(batch_id: str, db) -> UploadBatch | None:
    batch = await db.get(UploadBatch, batch_id)
    if not batch:
        return None

    result = await db.execute(
        select(UploadBatchItem).where(UploadBatchItem.batch_id == batch_id)
    )
    items = result.scalars().all()

    total = len(items)
    success = sum(1 for item in items if item.status == UploadBatchItemStatus.COMPLETED)
    failed = sum(1 for item in items if item.status == UploadBatchItemStatus.FAILED)
    canceled = sum(1 for item in items if item.status == UploadBatchItemStatus.CANCELED)
    processed = success + failed + canceled

    batch.total_files = total
    batch.processed_files = processed
    batch.success_files = success
    batch.failed_files = failed

    if processed < total:
        batch.status = UploadBatchStatus.PROCESSING
    else:
        batch.finished_at = datetime.now(timezone.utc)
        if canceled == total:
            batch.status = UploadBatchStatus.CANCELED
        elif failed == 0 and canceled == 0:
            batch.status = UploadBatchStatus.COMPLETED
        elif success == 0 and canceled == 0:
            batch.status = UploadBatchStatus.FAILED
        else:
            batch.status = UploadBatchStatus.PARTIAL

    return batch


async def _mark_item_failed(batch_id: str, file_id: int, error_message: str, celery_task_id: str | None = None) -> None:
    """在最終失敗時，強制回寫批次項目狀態，避免前端長時間顯示等待中"""
    async with AsyncSessionLocal() as db:
        item_result = await db.execute(
            select(UploadBatchItem).where(
                UploadBatchItem.batch_id == batch_id,
                UploadBatchItem.file_id == file_id,
            )
        )
        item = item_result.scalar_one_or_none()

        if not item:
            return

        if item.status == UploadBatchItemStatus.CANCELED:
            return

        item.status = UploadBatchItemStatus.FAILED
        item.processing_step = "failed"
        item.error_message = error_message
        item.celery_task_id = celery_task_id or item.celery_task_id
        item.started_at = item.started_at or datetime.now(timezone.utc)
        item.finished_at = datetime.now(timezone.utc)

        refreshed_batch = await _refresh_batch_counters(batch_id, db)
        await db.commit()

        await publish_batch_event(
            batch_id,
            {
                "type": "file_failed",
                "batch_id": batch_id,
                "file_id": file_id,
                "celery_task_id": item.celery_task_id,
                "step": item.processing_step,
                "progress": item.processing_progress,
                "status": item.status.value,
                "message": error_message,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )

        if refreshed_batch:
            await publish_batch_event(
                batch_id,
                {
                    "type": "batch_progress",
                    "batch_id": batch_id,
                    "status": refreshed_batch.status.value,
                    "total_files": refreshed_batch.total_files,
                    "processed_files": refreshed_batch.processed_files,
                    "success_files": refreshed_batch.success_files,
                    "failed_files": refreshed_batch.failed_files,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
            )


@celery_app.task(
    bind=True,
    name="app.tasks.file_pipeline.process_single_file_task",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 2},
)
def process_single_file_task(self, file_id: int, batch_id: str) -> dict:
    """處理單一檔案並更新批次狀態"""

    return _run_in_process_event_loop(_process_single_file_task_async(self, file_id, batch_id))


async def _process_single_file_task_async(self, file_id: int, batch_id: str) -> dict:
    redis_client = redis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)
    file_lock = redis_client.lock(f"lock:file-processing:{file_id}", timeout=1800)
    lock_acquired = await file_lock.acquire(blocking=False)

    if not lock_acquired:
        if self.request.retries >= self.max_retries:
            error_message = f"檔案 {file_id} 取得處理鎖失敗，重試已用盡"
            await _mark_item_failed(batch_id, file_id, error_message, self.request.id)
            await redis_client.close()
            return {
                "file_id": file_id,
                "batch_id": batch_id,
                "success": False,
                "error": error_message,
            }

        await redis_client.close()
        raise self.retry(countdown=10, exc=RuntimeError(f"檔案 {file_id} 目前處理中"))

    async with AsyncSessionLocal() as db:
        try:
            item_result = await db.execute(
                select(UploadBatchItem).where(
                    UploadBatchItem.batch_id == batch_id,
                    UploadBatchItem.file_id == file_id,
                )
            )
            item = item_result.scalar_one_or_none()
            batch = await db.get(UploadBatch, batch_id)

            if not item or not batch:
                return {
                    "file_id": file_id,
                    "batch_id": batch_id,
                    "success": False,
                    "error": "批次或項目不存在",
                }

            if item.status == UploadBatchItemStatus.CANCELED or batch.status == UploadBatchStatus.CANCELED:
                return {
                    "file_id": file_id,
                    "batch_id": batch_id,
                    "success": False,
                    "error": "任務已取消",
                    "canceled": True,
                }

            file_record = await db.get(File, file_id)
            if _is_file_vectorized_and_ready(file_record):
                item.status = UploadBatchItemStatus.COMPLETED
                item.processing_step = "completed"
                item.processing_progress = 100
                item.error_message = None
                item.started_at = item.started_at or datetime.now(timezone.utc)
                item.finished_at = datetime.now(timezone.utc)
                await _refresh_batch_counters(batch_id, db)
                await db.commit()

                await publish_batch_event(
                    batch_id,
                    {
                        "type": "file_completed",
                        "batch_id": batch_id,
                        "file_id": file_id,
                        "celery_task_id": item.celery_task_id,
                        "step": "completed",
                        "progress": 100,
                        "status": UploadBatchItemStatus.COMPLETED.value,
                        "message": "檔案已向量化，略過重複處理",
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    },
                )

                return {
                    "file_id": file_id,
                    "batch_id": batch_id,
                    "success": True,
                    "error": None,
                    "skipped": True,
                }

            item.celery_task_id = self.request.id
            item.status = UploadBatchItemStatus.PROCESSING
            item.processing_step = "classify"
            item.processing_progress = 0
            item.started_at = datetime.now(timezone.utc)
            batch.status = UploadBatchStatus.PROCESSING
            await db.commit()

            await publish_batch_event(
                batch_id,
                {
                    "type": "file_progress",
                    "batch_id": batch_id,
                    "file_id": file_id,
                    "celery_task_id": self.request.id,
                    "step": "classify",
                    "progress": 0,
                    "status": UploadBatchItemStatus.PROCESSING.value,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
            )

            async def progress_callback(callback_file_id: int, step: str, progress: int, message: str = None):
                callback_item_result = await db.execute(
                    select(UploadBatchItem).where(
                        UploadBatchItem.batch_id == batch_id,
                        UploadBatchItem.file_id == callback_file_id,
                    )
                )
                callback_item = callback_item_result.scalar_one_or_none()
                if not callback_item:
                    return

                if callback_item.status == UploadBatchItemStatus.CANCELED:
                    return

                callback_item.status = UploadBatchItemStatus.PROCESSING
                callback_item.processing_step = step
                callback_item.processing_progress = progress
                if message:
                    callback_item.error_message = message

                refreshed_batch = await _refresh_batch_counters(batch_id, db)
                await db.commit()

                await publish_batch_event(
                    batch_id,
                    {
                        "type": "file_progress",
                        "batch_id": batch_id,
                        "file_id": callback_file_id,
                        "celery_task_id": callback_item.celery_task_id,
                        "step": step,
                        "progress": progress,
                        "status": callback_item.status.value,
                        "message": message,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    },
                )

                if refreshed_batch:
                    await publish_batch_event(
                        batch_id,
                        {
                            "type": "batch_progress",
                            "batch_id": batch_id,
                            "status": refreshed_batch.status.value,
                            "total_files": refreshed_batch.total_files,
                            "processed_files": refreshed_batch.processed_files,
                            "success_files": refreshed_batch.success_files,
                            "failed_files": refreshed_batch.failed_files,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        },
                    )

            processor = FileProcessingService()
            results = await processor.process_files_batch(
                file_ids=[file_id],
                task_id=batch_id,
                db=db,
                progress_callback=progress_callback,
                delete_record_on_failure=True,
            )

            await db.refresh(item)
            await db.refresh(batch)
            if item.status == UploadBatchItemStatus.CANCELED or batch.status == UploadBatchStatus.CANCELED:
                await _refresh_batch_counters(batch_id, db)
                await db.commit()

                await publish_batch_event(
                    batch_id,
                    {
                        "type": "file_canceled",
                        "batch_id": batch_id,
                        "file_id": file_id,
                        "celery_task_id": item.celery_task_id,
                        "step": item.processing_step,
                        "progress": item.processing_progress,
                        "status": item.status.value,
                        "message": item.error_message,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    },
                )

                return {
                    "file_id": file_id,
                    "batch_id": batch_id,
                    "success": False,
                    "error": item.error_message,
                    "canceled": True,
                }

            file_record = await db.get(File, file_id)
            file_result = results.get("file_results", [{}])[0] if results.get("file_results") else {}

            if results.get("success", 0) > 0:
                item.status = UploadBatchItemStatus.COMPLETED
                item.processing_step = "completed"
                item.processing_progress = 100
                item.error_message = None
                success = True
                error_message = None
            else:
                item.status = UploadBatchItemStatus.FAILED
                item.processing_step = "failed"
                item.processing_progress = file_record.processing_progress if file_record else item.processing_progress
                error_message = file_result.get("error") or (results.get("errors", [None])[0])
                item.error_message = error_message
                success = False

            if file_record:
                item.processing_step = file_record.processing_step or item.processing_step
                item.processing_progress = file_record.processing_progress

            item.finished_at = datetime.now(timezone.utc)

            await _refresh_batch_counters(batch_id, db)
            await db.commit()

            await publish_batch_event(
                batch_id,
                {
                    "type": "file_completed" if success else "file_failed",
                    "batch_id": batch_id,
                    "file_id": file_id,
                    "celery_task_id": self.request.id,
                    "step": item.processing_step,
                    "progress": item.processing_progress,
                    "status": item.status.value,
                    "message": error_message,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
            )

            if success and file_record:
                try:
                    from app.api.rag import invalidate_dept_rag_engine

                    invalidate_dept_rag_engine(file_record.department_id)
                    await publish_batch_event(
                        batch_id,
                        {
                            "type": "vector_store_refreshed",
                            "batch_id": batch_id,
                            "file_id": file_id,
                            "department_id": file_record.department_id,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        },
                    )
                except Exception as cache_error:
                    print(f"⚠️ 刷新 RAG cache 失敗 (dept={file_record.department_id}): {cache_error}")

            if not success:
                self.update_state(
                    state=states.FAILURE,
                    meta={
                        "exc_type": "FileProcessingError",
                        "exc_message": [error_message or "unknown error"],
                        "file_id": file_id,
                    },
                )

            return {
                "file_id": file_id,
                "batch_id": batch_id,
                "success": success,
                "error": error_message,
            }
        except Exception as exc:
            if self.request.retries >= self.max_retries:
                await _mark_item_failed(
                    batch_id,
                    file_id,
                    f"任務異常中止: {str(exc)}",
                    self.request.id,
                )
                return {
                    "file_id": file_id,
                    "batch_id": batch_id,
                    "success": False,
                    "error": str(exc),
                }

            raise
        finally:
            if lock_acquired:
                try:
                    if await file_lock.locked():
                        await file_lock.release()
                except Exception as lock_error:
                    print(f"⚠️ 釋放檔案鎖失敗 (file_id={file_id}): {lock_error}")
            await redis_client.close()


@celery_app.task(name="app.tasks.file_pipeline.finalize_batch_task")
def finalize_batch_task(batch_id: str) -> dict:
    """重新整理批次統計（可供手動觸發或鏈式回呼）"""

    return _run_in_process_event_loop(_finalize_batch_task_async(batch_id))


async def _finalize_batch_task_async(batch_id: str) -> dict:
    async with AsyncSessionLocal() as db:
        batch = await _refresh_batch_counters(batch_id, db)
        if not batch:
            return {"batch_id": batch_id, "success": False, "error": "批次不存在"}

        await db.commit()

        await publish_batch_event(
            batch_id,
            {
                "type": "batch_completed" if batch.status == UploadBatchStatus.COMPLETED else "batch_failed",
                "batch_id": batch_id,
                "status": batch.status.value,
                "processed_files": batch.processed_files,
                "success_files": batch.success_files,
                "failed_files": batch.failed_files,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )

        return {
            "batch_id": batch_id,
            "success": True,
            "status": batch.status.value,
            "processed_files": batch.processed_files,
            "success_files": batch.success_files,
            "failed_files": batch.failed_files,
        }
