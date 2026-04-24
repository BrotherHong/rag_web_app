"""上傳管理 API 路由 - 處理批次上傳和進度追蹤"""

import asyncio
import threading
from typing import List, Dict, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import User

router = APIRouter(prefix="/upload", tags=["上傳管理"])

# 上傳任務暫存（完成任務保留30分鐘後清理）
upload_tasks: Dict[str, dict] = {}
TASK_RETENTION_SECONDS = 30 * 60

async def cleanup_old_tasks():
    """清理舊的已完成任務"""
    current_time = datetime.now(timezone.utc)
    tasks_to_remove = []
    
    for task_id, task in upload_tasks.items():
        if task.get("status") in ["completed", "failed", "partial"]:
            completed_time = task.get("completed_at")
            if completed_time and (current_time - completed_time).total_seconds() > TASK_RETENTION_SECONDS:
                tasks_to_remove.append(task_id)
    
    for task_id in tasks_to_remove:
        del upload_tasks[task_id]
        print(f"🗑️ 清理過期任務: {task_id}")

def start_cleanup_timer():
    def run_cleanup():
        try:
            asyncio.run(cleanup_old_tasks())
        except Exception as e:
            print(f"任務清理錯誤: {e}")
        # 5分鐘後再次執行
        threading.Timer(300, run_cleanup).start()
    
    threading.Timer(300, run_cleanup).start()

# 啟動清理定時器
start_cleanup_timer()


# Pydantic Models
class CheckDuplicatesRequest(BaseModel):
    """檢查重複檔案的請求模型"""
    filenames: List[str]


@router.post("/batch", summary="批次上傳檔案")
async def batch_upload(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    categories: str = Form("{}"),  # JSON 字串格式的分類對應
    user_group_ids: Optional[str] = Form(None),  # 身分組 ID 列表
    startProcessing: str = Form("false"),  # 是否立即開始處理
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    批次上傳多個檔案
    
    前端發送格式:
    - files: 檔案列表
    - categories: JSON 字串 {"filename1.pdf": "分類名稱1", ...}
    - user_group_ids: JSON 字串 [1, 2, 3, ...]
    
    返回格式:
    {
      success: true,
      taskId: "uuid",
      message: "上傳任務已建立"
    }
    """
    import uuid
    import json
    import os
    from app.models import File as FileModel, Category
    from app.models.user_group import FileUserGroupPermission
    from app.services.file_storage import file_storage
    from app.services.activity import activity_service
    
    # Debug: 輸出接收到的參數
    print(f"\n{'='*60}")
    print(f"📤 收到上傳請求")
    print(f"檔案數量: {len(files)}")
    print(f"user_group_ids: {user_group_ids}")
    print(f"startProcessing 參數: {startProcessing}")
    print(f"{'='*60}\n")
    
    # 解析參數
    try:
        category_map = json.loads(categories)
        group_ids = json.loads(user_group_ids) if user_group_ids else []
    except:
        category_map = {}
        group_ids = []
    
    # 生成任務 ID
    task_id = str(uuid.uuid4())
    
    # 初始化任務記錄（用於前端輪詢）
    file_list = []
    for file in files:
        file_list.append({
            "name": file.filename,
            "status": "pending",
            "progress": 0,
            "error": None
        })
    
    task = {
        "task_id": task_id,
        "user_id": current_user.id,
        "status": "processing",
        "totalFiles": len(files),
        "processedFiles": 0,
        "successFiles": 0,
        "failedFiles": 0,
        "deletedFiles": 0,
        "files": file_list,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }
    upload_tasks[task_id] = task
    
    # 3. 處理新檔案上傳
    success_count = 0
    
    for idx, file in enumerate(files):
        # 更新當前檔案狀態為處理中
        task["files"][idx]["status"] = "processing"
        task["files"][idx]["progress"] = 50
        task["updated_at"] = datetime.now().isoformat()
        
        try:
            # 驗證檔案
            is_valid, error_msg = await file_storage.validate_file(file, db)
            if not is_valid:
                task["files"][idx]["status"] = "failed"
                task["files"][idx]["error"] = error_msg
                task["failedFiles"] += 1
                continue
            
            # 取得分類
            category_name = category_map.get(file.filename)
            category_id = None
            if category_name:
                category_query = select(Category).where(
                    Category.name == category_name,
                    Category.department_id == current_user.department_id
                )
                category_result = await db.execute(category_query)
                category = category_result.scalar_one_or_none()
                if category:
                    category_id = category.id
            
            # 儲存檔案（檢查資料庫重複）
            try:
                unique_filename, file_path, file_size = await file_storage.save_upload_file(
                    file,
                    current_user.department_id,
                    db=db,
                    original_filename=file.filename
                )
            except ValueError as e:
                # 檔案已存在
                task["files"][idx]["status"] = "failed"
                task["files"][idx]["error"] = str(e)
                task["failedFiles"] += 1
                continue
            
            # 建立資料庫記錄
            ext = os.path.splitext(file.filename)[1].lower()
            db_file = FileModel(
                filename=unique_filename,
                original_filename=file.filename,
                file_path=file_path,
                file_size=file_size,
                file_type=ext[1:] if ext else "unknown",
                mime_type=file.content_type,
                category_id=category_id,
                department_id=current_user.department_id,
                uploader_id=current_user.id,
                admin_group_id=current_user.admin_group_id,
                status="completed"  # 使用 FileStatus.COMPLETED
            )
            
            db.add(db_file)
            await db.flush()
            
            # 處理身分組權限
            if group_ids:
                for group_id in group_ids:
                    permission = FileUserGroupPermission(
                        file_id=db_file.id,
                        user_group_id=group_id
                    )
                    db.add(permission)

            # 每檔案獨立提交，避免單檔失敗污染整個 session
            await db.commit()
            
            # 更新檔案狀態為完成
            task["files"][idx]["status"] = "completed"
            task["files"][idx]["progress"] = 100
            task["successFiles"] += 1
            success_count += 1
            
        except IntegrityError:
            await db.rollback()
            task["files"][idx]["status"] = "failed"
            task["files"][idx]["error"] = "同名檔案已有舊紀錄，請重新上傳一次或更改檔名"
            task["failedFiles"] += 1
        except Exception as e:
            await db.rollback()
            task["files"][idx]["status"] = "failed"
            task["files"][idx]["error"] = str(e)
            task["failedFiles"] += 1
        
        # 更新已處理檔案數
        task["processedFiles"] = idx + 1
        task["updated_at"] = datetime.now().isoformat()
    
    await db.commit()
    
    # 記錄活動（包含檔案名稱列表）
    if success_count > 0:
        # 收集成功上傳的檔案名稱
        success_files = [f["name"] for f in task["files"] if f["status"] == "completed"]
        file_list_str = "、".join(success_files[:5])  # 最多顯示 5 個檔案名
        if len(success_files) > 5:
            file_list_str += f" 等 {len(success_files)} 個檔案"
        
        await activity_service.log_activity(
            db=db,
            user_id=current_user.id,
            activity_type="UPLOAD",
            description=f"批次上傳檔案: {file_list_str}",
            department_id=current_user.department_id
        )
        await db.commit()  # 提交活動記錄
    
    # 更新任務最終狀態
    task["status"] = "completed" if task["failedFiles"] == 0 else "partial"
    task["completed_at"] = datetime.now(timezone.utc)  # 添加完成時間
    task["updated_at"] = datetime.now().isoformat()
    
    # 如果需要開始處理，觸發背景任務
    should_process = startProcessing.lower() == "true"
    
    print(f"\n{'='*60}")
    print(f"🔍 檢查是否需要觸發處理")
    print(f"startProcessing: '{startProcessing}'")
    print(f"should_process: {should_process}")
    print(f"success_count: {success_count}")
    print(f"{'='*60}\n")
    
    if should_process and success_count > 0:
        # 收集成功上傳的檔案 ID
        uploaded_file_ids = []
        for idx, file in enumerate(files):
            if task["files"][idx]["status"] == "completed":
                # 從資料庫查詢檔案 ID
                result = await db.execute(
                    select(FileModel).where(
                        FileModel.original_filename == file.filename,
                        FileModel.department_id == current_user.department_id
                    ).order_by(FileModel.id.desc()).limit(1)
                )
                file_record = result.scalar_one_or_none()
                if file_record:
                    uploaded_file_ids.append(file_record.id)

        if uploaded_file_ids:
            from app.models.upload_batch import (
                UploadBatch,
                UploadBatchItem,
                UploadBatchStatus,
                UploadBatchItemStatus,
            )
            from app.tasks.file_pipeline import process_single_file_task

            print(f"🚀 使用 Celery 啟動檔案處理任務，檔案 IDs: {uploaded_file_ids}")

            batch = UploadBatch(
                id=task_id,
                department_id=current_user.department_id,
                created_by_user_id=current_user.id,
                status=UploadBatchStatus.PROCESSING,
                total_files=len(uploaded_file_ids),
                processed_files=0,
                success_files=0,
                failed_files=0,
            )
            db.add(batch)
            await db.flush()

            batch_items = []
            for file_id in uploaded_file_ids:
                batch_item = UploadBatchItem(
                    batch_id=task_id,
                    file_id=file_id,
                    status=UploadBatchItemStatus.QUEUED,
                    processing_step="pending",
                    processing_progress=0,
                )
                db.add(batch_item)
                batch_items.append(batch_item)

            await db.commit()

            for batch_item in batch_items:
                async_result = process_single_file_task.delay(batch_item.file_id, task_id)
                batch_item.celery_task_id = async_result.id

            await db.commit()

            task["status"] = "processing"
            task["message"] = "檔案上傳完成，Celery 任務排程中..."
    
    return {
        "success": True,
        "taskId": task_id,
        "batchId": task_id,
        "message": f"成功上傳 {success_count} 個檔案" + (" (處理中...)" if should_process and success_count > 0 else "")
    }


@router.get("/progress/{task_id}", summary="查詢上傳進度")
async def get_upload_progress(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    查詢批次上傳的進度
    
    返回格式:
    {
      task_id: string,
      status: "processing" | "completed" | "failed" | "partial",
      total_files: number,
      completed_files: number,
      failed_files: number,
      progress: number (0-100),
      results: [{filename, success, error}]
    }
    """
    # 查找任務
    task = upload_tasks.get(task_id)

    # 若記憶體中仍是 processing，查 DB 取得 Celery 更新後的真實狀態
    if task and task.get("status") == "processing":
        from app.models.upload_batch import UploadBatch, UploadBatchItem
        from app.models import File as FileModel
        batch = await db.get(UploadBatch, task_id)
        if batch and batch.status.value != "processing":
            items_result = await db.execute(
                select(UploadBatchItem).where(UploadBatchItem.batch_id == task_id)
            )
            items = items_result.scalars().all()
            file_ids = [item.file_id for item in items]
            file_names = {}
            if file_ids:
                file_result = await db.execute(select(FileModel).where(FileModel.id.in_(file_ids)))
                file_names = {f.id: f.original_filename for f in file_result.scalars().all()}

            task["status"] = batch.status.value
            task["processedFiles"] = batch.processed_files
            task["successFiles"] = batch.success_files
            task["failedFiles"] = batch.failed_files
            task["updated_at"] = batch.updated_at.isoformat() if batch.updated_at else task["updated_at"]
            task["files"] = [
                {
                    "name": file_names.get(item.file_id, f"file-{item.file_id}"),
                    "status": item.status.value,
                    "progress": item.processing_progress,
                    "error": item.error_message,
                }
                for item in items
            ]
            if batch.status.value in ("completed", "failed", "partial"):
                task["completed_at"] = datetime.now(timezone.utc)

    if not task:
        from app.models.upload_batch import UploadBatch, UploadBatchItem
        from app.models.user import UserRole
        from app.models import File as FileModel

        batch = await db.get(UploadBatch, task_id)
        if not batch:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error": "上傳任務不存在",
                    "reason": "任務可能已完成並清理，或任務 ID 無效",
                    "suggestion": "停止輪詢此任務，刷新頁面查看檔案狀態",
                    "task_id": task_id
                }
            )

        if batch.created_by_user_id != current_user.id and current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="無權限查看此任務"
            )

        items_result = await db.execute(
            select(UploadBatchItem).where(UploadBatchItem.batch_id == task_id)
        )
        items = items_result.scalars().all()

        file_ids = [item.file_id for item in items]
        file_names = {}
        if file_ids:
            file_result = await db.execute(select(FileModel).where(FileModel.id.in_(file_ids)))
            file_records = file_result.scalars().all()
            file_names = {file.id: file.original_filename for file in file_records}

        canceled_files = sum(1 for item in items if item.status.value == "canceled")

        return {
            "success": True,
            "data": {
                "taskId": task_id,
                "batchId": task_id,
                "status": batch.status.value,
                "totalFiles": batch.total_files,
                "processedFiles": batch.processed_files,
                "successFiles": batch.success_files,
                "failedFiles": batch.failed_files,
                "canceledFiles": canceled_files,
                "deletedFiles": 0,
                "files": [
                    {
                        "name": file_names.get(item.file_id, f"file-{item.file_id}"),
                        "status": item.status.value,
                        "progress": item.processing_progress,
                        "error": item.error_message
                    }
                    for item in items
                ],
                "updatedAt": batch.updated_at.isoformat() if batch.updated_at else None
            }
        }
    
    # 權限檢查
    if task["user_id"] != current_user.id:
        from app.models.user import UserRole
        if current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="無權限查看此任務"
            )
    
    # 返回格式匹配前端期待
    return {
        "success": True,
        "data": {
            "taskId": task_id,
            "status": task["status"],
            "totalFiles": task["totalFiles"],
            "processedFiles": task["processedFiles"],
            "successFiles": task["successFiles"],
            "failedFiles": task["failedFiles"],
            "deletedFiles": task.get("deletedFiles", 0),
            "files": task["files"],
            "updatedAt": task["updated_at"]
        }
    }


@router.get("/tasks", summary="取得使用者的上傳任務列表")
async def get_user_upload_tasks(
    current_user: User = Depends(get_current_user)
):
    """
    取得當前使用者的所有上傳任務
    
    前端期望格式:
    {
      items: [{
        task_id: string,
        total_files: number,
        completed_files: number,
        status: string,
        created_at: string
      }]
    }
    """
    # 篩選使用者的任務
    user_tasks = [
        {
            "task_id": task_id,
            "total_files": task["totalFiles"],
            "completed_files": task["successFiles"],
            "failed_files": task["failedFiles"],
            "status": task["status"],
            "created_at": task["created_at"],
            "updated_at": task["updated_at"]
        }
        for task_id, task in upload_tasks.items()
        if task["user_id"] == current_user.id
    ]
    
    # 按建立時間排序（最新的在前）
    user_tasks.sort(key=lambda x: x["created_at"], reverse=True)
    
    return {
        "success": True,
        "items": user_tasks,
        "total": len(user_tasks)
    }


@router.delete("/tasks/{task_id}", summary="刪除上傳任務")
async def delete_upload_task(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    刪除指定的上傳任務記錄
    
    只能刪除已完成或失敗的任務
    """
    # 查找任務
    task = upload_tasks.get(task_id)
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="上傳任務不存在"
        )
    
    # 權限檢查
    if task["user_id"] != current_user.id and current_user.role.value != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="無權限刪除此任務"
        )
    
    # 檢查任務狀態
    if task["status"] == "processing":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="無法刪除處理中的任務"
        )
    
    # 刪除任務
    del upload_tasks[task_id]
    
    return {
        "success": True,
        "message": "上傳任務已刪除"
    }


@router.post("/check-duplicates", summary="檢查檔案重複")
async def check_duplicates(
    request: CheckDuplicatesRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    檢查檔案是否已存在並找出相關檔案
    
    前端期望格式:
    Request: { filenames: ["file1.pdf", "file2.docx"] }
    Response: {
      results: [
        {
          fileName: "file1.pdf",
          isDuplicate: true,
          duplicateFile: { id, name, size, uploadDate, category },
          relatedFiles: [],
          suggestReplace: true
        },
        {
          fileName: "file2.docx",
          isDuplicate: false,
          duplicateFile: null,
          relatedFiles: [{ id, name, size, uploadDate, category }],
          suggestReplace: false
        }
      ]
    }
    """
    from app.models import File as FileModel
    from app.models.file import FileStatus
    from sqlalchemy.orm import joinedload
    
    results = []
    
    for filename in request.filenames:
        # 取得檔名基礎（不含副檔名）
        base_name = filename.rsplit('.', 1)[0]  # "Q&A"
        
        # 檢查是否已有相同檔名基礎的檔案（不管副檔名）
        conflict_query = select(FileModel).options(
            joinedload(FileModel.category)
        ).where(
            FileModel.department_id == current_user.department_id,
            FileModel.original_filename.like(f"{base_name}.%"),  # Q&A.pdf, Q&A.docx, Q&A.txt
            FileModel.status == FileStatus.COMPLETED,
            FileModel.is_vectorized.is_(True),
        )
        result = await db.execute(conflict_query)
        conflict_file = result.scalars().first()
        
        # 構建回應
        file_result = {
            "fileName": filename,
            "isDuplicate": conflict_file is not None,
            "duplicateFile": None,
            "relatedFiles": [],
            "suggestReplace": conflict_file is not None
        }
        
        if conflict_file:
            from app.models.user import UserRole
            if current_user.role == UserRole.SUPER_ADMIN:
                can_delete = True
            elif current_user.admin_group_id is None:
                can_delete = conflict_file.admin_group_id is None
            else:
                can_delete = conflict_file.admin_group_id == current_user.admin_group_id

            file_result["duplicateFile"] = {
                "id": conflict_file.id,
                "name": conflict_file.original_filename,
                "size": f"{conflict_file.file_size / 1024:.1f} KB" if conflict_file.file_size else "未知",
                "uploadDate": conflict_file.created_at.strftime("%Y-%m-%d %H:%M"),
                "category": conflict_file.category.name if conflict_file.category else "其他",
                "canDelete": can_delete
            }
        
        results.append(file_result)
    
    return {
        "success": True,
        "results": results
    }
