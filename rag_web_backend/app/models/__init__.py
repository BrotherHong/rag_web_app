"""資料庫模型 (Database Models)"""

from app.core.database import Base
from app.models.user import User, UserRole
from app.models.department import Department
from app.models.file import File, FileStatus
from app.models.category import Category
from app.models.activity import Activity, ActivityType
from app.models.query_history import QueryHistory
from app.models.system_setting import SystemSetting
from app.models.faq import FAQ

__all__ = [
    "Base",
    "User",
    "UserRole",
    "Department",
    "File",
    "FileStatus",
    "Category",
    "Activity",
    "ActivityType",
    "QueryHistory",
    "SystemSetting",
    "FAQ",
]
