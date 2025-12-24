"""統計與系統資訊 API 路由"""

import os
import shutil
import platform
from urllib.parse import urlparse
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, desc, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models import Activity, File, User, UserRole, Category, QueryHistory
from app.config import settings

router = APIRouter(tags=["統計與系統"])


def _format_bytes(num: int) -> str:
    if num is None:
        return "未知"
    if num == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    idx = min(len(units) - 1, int((num).bit_length() / 10))
    value = num / (1024 ** idx)
    return f"{value:.2f} {units[idx]}"


@router.get("/statistics", summary="取得系統統計資料")
async def get_statistics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    取得系統整體統計資料
    
    前端期望格式:
    {
      totalFiles: number,
      filesByCategory: [{name, count, color}],
      monthlyQueries: number,
      systemStatus: "正常",
      storageUsed: string,
      storageTotal: string
    }
    """
    # # 根據使用者權限過濾資料
    # if current_user.role == UserRole.SUPER_ADMIN:
    #     # 系統管理員可以看到所有資料
    #     department_filter = None
    # else:
    #     # 處室管理員只能看自己處室
    #     department_filter = current_user.department_id
    # 上述註解是為了解決在super admin角色下進入各處室儀表板後顯示出資料加總數為全域不為各處室的問題
    # 若要拿到加總資料則須再增加判斷邏輯讓department_filter = None即可拿到全域資料

    department_filter = current_user.department_id
    # 全部都要帶有處室id才能正確顯示各處室的統計數據

    # 1. 總檔案數
    file_query = select(func.count(File.id))
    if department_filter:
        file_query = file_query.where(File.department_id == department_filter)
    total_files = await db.scalar(file_query) or 0
    
    # 2. 依分類統計檔案
    category_query = select(
        Category.name,
        Category.color,
        func.count(File.id).label('count')
    ).select_from(Category).outerjoin(
        File, Category.id == File.category_id
    )
    if department_filter:
        category_query = category_query.where(File.department_id == department_filter)
    category_query = category_query.group_by(Category.id, Category.name, Category.color)
    
    category_result = await db.execute(category_query)
    files_by_category = [
        {
            "name": row.name,
            "count": row.count,
            "color": row.color or "gray"
        }
        for row in category_result
    ]
    
    # 3. 本月查詢數
    month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    query_count_query = select(func.count(QueryHistory.id)).where(
        QueryHistory.created_at >= month_start
    )
    if department_filter:
        query_count_query = query_count_query.where(QueryHistory.department_id == department_filter)
    monthly_queries = await db.scalar(query_count_query) or 0
    
    # 3.5 查詢類別統計（從 QueryHistory 的 extra_data 中提取 category_ids）
    queries_by_category = []
    try:
        # 取得該處室所有查詢記錄
        history_query = select(QueryHistory.extra_data).where(
            QueryHistory.created_at >= month_start
        )
        if department_filter:
            history_query = history_query.where(QueryHistory.department_id == department_filter)
        
        history_result = await db.execute(history_query)
        category_count = {}
        no_category_count = 0  # 統計未選擇類別的查詢
        
        # 統計每個類別被使用的次數
        for row in history_result:
            extra_data = row[0] or {}
            category_ids = extra_data.get('category_ids', [])
            
            if not category_ids or len(category_ids) == 0:
                # 未選擇類別
                no_category_count += 1
            else:
                for cat_id in category_ids:
                    category_count[cat_id] = category_count.get(cat_id, 0) + 1
        
        # 取得類別名稱和顏色
        if category_count:
            category_ids_list = list(category_count.keys())
            cat_info_query = select(Category.id, Category.name, Category.color).where(
                Category.id.in_(category_ids_list)
            )
            cat_info_result = await db.execute(cat_info_query)
            
            queries_by_category = [
                {
                    "categoryId": row.id,
                    "categoryName": row.name,
                    "color": row.color or "#6b7280",
                    "queryCount": category_count[row.id]
                }
                for row in cat_info_result
            ]
        
        # 如果有未選擇類別的查詢，加入統計
        if no_category_count > 0:
            queries_by_category.append({
                "categoryId": None,
                "categoryName": "全部類別",
                "color": "#9ca3af",  # 灰色
                "queryCount": no_category_count
            })
        
        # 按查詢次數降序排序
        queries_by_category.sort(key=lambda x: x['queryCount'], reverse=True)
    except Exception as e:
        print(f"查詢類別統計失敗: {e}")
        queries_by_category = []
    
    # 4. 儲存空間使用情況
    upload_dir = settings.UPLOAD_DIR
    if os.path.exists(upload_dir):
        total_size = sum(
            os.path.getsize(os.path.join(dirpath, filename))
            for dirpath, _, filenames in os.walk(upload_dir)
            for filename in filenames
        )
        storage_used = f"{total_size / (1024**3):.2f} GB"
    else:
        storage_used = "0 GB"
    
    # 5. 磁碟總容量
    try:
        # 使用 shutil.disk_usage 替代 psutil（Python 內建）
        disk_usage = shutil.disk_usage(os.path.dirname(upload_dir) if os.path.exists(upload_dir) else ".")
        storage_total = f"{disk_usage.total / (1024**3):.2f} GB"
    except:
        storage_total = "N/A"
    
    # 6. 系統狀態
    system_status = {
        "status": "running",
        "message": "系統運行正常"
    }
    
    return {
        "totalFiles": total_files,
        "filesByCategory": files_by_category,
        "monthlyQueries": monthly_queries,
        "queriesByCategory": queries_by_category,
        "systemStatus": system_status,
        "storageUsed": storage_used,
        "storageTotal": storage_total
    }


@router.get("/system/info", summary="取得系統資訊")
async def get_system_info(
    current_user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db)
):
    """
    取得系統詳細資訊（僅管理員）
    
    返回格式:
    {
      version: string,
      platform: string,
      databaseSize: string,
      totalFiles: number,
      totalUsers: number,
      totalActivities: number,
      storage: { used, total, usedBytes, totalBytes, percentage }
    }
    """
    # 1. 儲存空間（使用 Python 內建的 shutil，跨平台支援）
    upload_dir = settings.UPLOAD_DIR
    try:
        # 確保目錄存在
        if os.path.exists(upload_dir):
            disk_path = upload_dir
        else:
            disk_path = "."
        
        disk_usage = shutil.disk_usage(disk_path)
        used_bytes = disk_usage.used
        total_bytes = disk_usage.total
        used_gb = used_bytes / (1024**3)
        total_gb = total_bytes / (1024**3)
        percentage = (used_bytes / total_bytes * 100) if total_bytes > 0 else 0
        
        storage = {
            "used": f"{used_gb:.2f} GB",
            "total": f"{total_gb:.2f} GB",
            "usedBytes": used_bytes,
            "totalBytes": total_bytes,
            "percentage": round(percentage, 1)
        }
    except Exception as e:
        storage = {
            "used": "N/A",
            "total": "N/A",
            "usedBytes": 0,
            "totalBytes": 0,
            "percentage": 0
        }
    
    # 2. 資料庫統計
    total_files = await db.scalar(select(func.count(File.id))) or 0
    total_users = await db.scalar(select(func.count(User.id))) or 0
    total_activities = await db.scalar(select(func.count(Activity.id))) or 0

    # 資料庫大小（盡可能取精確值）+ uploads 目錄大小
    database_size_bytes = None
    parsed = urlparse(settings.DATABASE_URL)

    if parsed.scheme.startswith("sqlite"):
        # sqlite 路徑格式: sqlite+aiosqlite:///absolute/path/to/db.sqlite
        db_path = parsed.path
        if db_path and not db_path.startswith("/"):
            db_path = os.path.join(os.getcwd(), db_path)
        if db_path and os.path.exists(db_path):
            database_size_bytes = os.path.getsize(db_path)
    elif parsed.scheme.startswith("postgres"):
        try:
            result = await db.execute(text("SELECT pg_database_size(current_database())"))
            database_size_bytes = result.scalar() or 0
        except Exception:
            database_size_bytes = None
    elif parsed.scheme.startswith("mysql"):
        try:
            result = await db.execute(text("SELECT SUM(DATA_LENGTH + INDEX_LENGTH) FROM information_schema.tables WHERE table_schema = DATABASE()"))
            database_size_bytes = result.scalar()
        except Exception:
            database_size_bytes = None

    if database_size_bytes is None:
        # 回退估算，以免回傳空值
        database_size_bytes = int((total_files * 0.01 + total_activities * 0.001) * 1024 * 1024)

    # 加上 uploads 目錄大小
    uploads_size = 0
    upload_dir = settings.UPLOAD_DIR
    if os.path.exists(upload_dir):
        try:
            for dirpath, dirnames, filenames in os.walk(upload_dir):
                for filename in filenames:
                    filepath = os.path.join(dirpath, filename)
                    try:
                        uploads_size += os.path.getsize(filepath)
                    except (OSError, FileNotFoundError):
                        continue
        except Exception:
            pass
    
    # 總大小 = 資料庫 + uploads
    total_data_size_bytes = database_size_bytes + uploads_size
    database_size = _format_bytes(total_data_size_bytes)
    
    # 3. 系統平台與資源資訊
    try:
        platform_info = f"{platform.system()} {platform.release()}"
        python_version = platform.python_version()
        platform_full = f"{platform_info} (Python {python_version})"
    except:
        platform_full = "Unknown Platform"

    # CPU / Memory：盡量提供數值，若無法取得則給 None
    cpu_usage = None
    memory_usage = None
    try:
        if hasattr(os, "getloadavg") and os.cpu_count():
            load1, _, _ = os.getloadavg()
            cpu_usage = round(load1 / os.cpu_count() * 100, 1)
    except Exception:
        cpu_usage = None

    try:
        import psutil  # type: ignore
        memory = psutil.virtual_memory()
        memory_usage = round(memory.percent, 1)
        if cpu_usage is None:
            cpu_usage = round(psutil.cpu_percent(interval=0.1), 1)
    except Exception:
        memory_usage = memory_usage or None
        cpu_usage = cpu_usage or None

    # 4. API 請求量（以 QueryHistory 計數為簡易替代，若不存在則回傳 0）
    try:
        api_requests = await db.scalar(select(func.count(QueryHistory.id))) or 0
    except Exception:
        api_requests = 0

    # 5. 查詢統計資料
    query_stats = {
        "totalQueries": 0,
        "queriesByDepartment": [],
        "averageResponseTime": None,
        "visitsByDepartment": []
    }
    
    try:
        from app.models import Department
        
        # 總查詢次數
        total_queries = await db.scalar(select(func.count(QueryHistory.id))) or 0
        query_stats["totalQueries"] = total_queries
        
        # 各處室查詢次數
        dept_query = select(
            Department.id,
            Department.name,
            func.count(QueryHistory.id).label('query_count')
        ).select_from(QueryHistory).join(
            Department, QueryHistory.department_id == Department.id
        ).group_by(Department.id, Department.name).order_by(desc('query_count'))
        
        dept_result = await db.execute(dept_query)
        queries_by_dept = [
            {
                "departmentId": row.id,
                "departmentName": row.name,
                "queryCount": row.query_count
            }
            for row in dept_result
        ]
        query_stats["queriesByDepartment"] = queries_by_dept
        
        # 平均回應時間（秒）
        avg_time = await db.scalar(select(func.avg(QueryHistory.processing_time)))
        if avg_time is not None:
            query_stats["averageResponseTime"] = round(float(avg_time), 2)
        
        # 處室造訪人次（使用不同使用者的查詢次數統計）
        visit_query = select(
            Department.id,
            Department.name,
            func.count(func.distinct(QueryHistory.user_id)).label('visits')
        ).select_from(QueryHistory).join(
            Department, QueryHistory.department_id == Department.id
        ).group_by(Department.id, Department.name).order_by(desc('visits'))
        
        visit_result = await db.execute(visit_query)
        visits_by_dept = [
            {
                "departmentId": row.id,
                "departmentName": row.name,
                "visits": row.visits
            }
            for row in visit_result
        ]
        query_stats["visitsByDepartment"] = visits_by_dept
        
    except Exception as e:
        # 若查詢統計失敗，回傳空資料
        pass
    
    payload = {
        "version": "1.0.0",
        "platform": platform_full,
        "databaseSize": database_size,
        "totalFiles": total_files,
        "totalUsers": total_users,
        "totalActivities": total_activities,
        "storage": storage,
        "databaseSizeBytes": total_data_size_bytes,
        "cpuUsage": cpu_usage,
        "memoryUsage": memory_usage,
        "apiRequests": api_requests,
        "updatedAt": datetime.utcnow().isoformat() + "Z",
        "queryStats": query_stats,
    }

    # 禁用快取，確保每次都拿到最新數據
    return JSONResponse(
        content=payload,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )
