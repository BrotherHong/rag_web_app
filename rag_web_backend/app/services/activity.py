"""活動記錄服務 (Activity Logging Service)"""

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from app.models.activity import Activity, ActivityType


class ActivityService:
    """活動記錄服務"""
    
    async def log_activity(
        self,
        db: AsyncSession,
        user_id: int,
        activity_type: str,
        description: str,
        file_id: Optional[int] = None,
        department_id: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        extra_data: Optional[str] = None
    ) -> Activity:
        """記錄活動
        
        Args:
            db: 資料庫 Session
            user_id: 使用者 ID (實際操作者)
            activity_type: 活動類型 (login, logout, upload, download, delete, etc.)
            description: 描述
            file_id: 關聯檔案 ID
            department_id: 關聯處室 ID (活動發生的處室,用於代理模式)
            ip_address: IP 位址
            user_agent: User Agent
            extra_data: 額外資訊 (JSON 格式)
            
        Returns:
            Activity: 活動記錄物件
        """
        # 轉換字串為 ActivityType enum
        try:
            if isinstance(activity_type, str):
                activity_type_enum = ActivityType(activity_type)
            else:
                activity_type_enum = activity_type
        except ValueError:
            # 如果提供的類型不在 enum 中，使用預設值或拋出錯誤
            print(f"警告：未知的活動類型 '{activity_type}'，將使用 QUERY 作為預設")
            activity_type_enum = ActivityType.QUERY
        
        activity = Activity(
            user_id=user_id,
            activity_type=activity_type_enum,
            description=description,
            file_id=file_id,
            department_id=department_id,
            ip_address=ip_address,
            user_agent=user_agent,
            extra_data=extra_data
        )
        
        db.add(activity)
        # 使用 flush 而非 commit，讓調用者控制事務
        await db.flush()
        
        return activity


# 建立全域活動記錄服務實例
activity_service = ActivityService()
