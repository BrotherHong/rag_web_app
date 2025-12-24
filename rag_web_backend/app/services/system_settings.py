"""系統設定服務 (System Settings Service)

提供統一的系統設定存取介面，優先使用資料庫設定，
若資料庫無設定則使用環境變數的預設值。
"""

from typing import Optional, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SystemSetting
from app.config import settings


class SystemSettingsService:
    """系統設定服務"""
    
    def __init__(self):
        self._cache = {}
    
    async def get_app_settings(self, db: AsyncSession) -> dict:
        """取得應用程式設定
        
        優先使用資料庫設定，若無則使用環境變數預設值
        """
        # 嘗試從資料庫取得
        result = await db.execute(
            select(SystemSetting).where(SystemSetting.key == "app")
        )
        setting = result.scalar_one_or_none()
        
        if setting:
            return setting.value
        
        # 使用環境變數預設值
        return {
            "max_file_size": settings.MAX_FILE_SIZE,
            "allowed_file_types": settings.allowed_extensions_list,
            "files_per_page": 20,
            "maintenance_mode": False,
            "allow_registration": False,
        }
    
    async def get_max_file_size(self, db: AsyncSession) -> int:
        """取得最大檔案大小限制（bytes）"""
        app_settings = await self.get_app_settings(db)
        return app_settings.get("max_file_size", settings.MAX_FILE_SIZE)
    
    async def get_allowed_file_types(self, db: AsyncSession) -> list[str]:
        """取得允許的檔案類型"""
        app_settings = await self.get_app_settings(db)
        return app_settings.get("allowed_file_types", settings.allowed_extensions_list)


# 全域實例
system_settings_service = SystemSettingsService()
