"""初始化系統設定"""

import asyncio
import sys
from pathlib import Path

# 添加專案根目錄到 Python 路徑
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models import SystemSetting


async def init_system_settings():
    """初始化預設系統設定"""
    
    default_settings = [
        # 應用程式設定
        {
            "key": "app",
            "value": {
                "max_file_size": 52428800,  # 50MB
                "allowed_file_types": [".pdf", ".docx", ".txt", ".doc", ".pptx", ".xlsx"],
                "files_per_page": 20,
                "maintenance_mode": False,
                "allow_registration": False,
            },
            "category": "app",
            "display_name": "應用程式設定",
            "description": "系統應用程式相關設定，包含檔案上傳限制、分頁設定等",
            "is_sensitive": False,
            "is_public": True,
        },
        
        # RAG 模型參數
        {
            "key": "rag",
            "value": {
                "model_name": "gpt-4",
                "temperature": 0.7,
                "max_tokens": 2000,
                "top_k": 5,
                "chunk_size": 500,
                "chunk_overlap": 50,
                "embedding_model": "text-embedding-ada-002",
                "tone": "professional",
                "available_models": [
                    {"value": "gpt-4", "label": "GPT-4"},
                    {"value": "gpt-3.5-turbo", "label": "GPT-3.5 Turbo"},
                    {"value": "claude-3", "label": "Claude 3"},
                    {"value": "llama-2", "label": "Llama 2"}
                ],
                "available_tones": [
                    {"value": "professional", "label": "專業 (Professional)"},
                    {"value": "friendly", "label": "友善 (Friendly)"},
                    {"value": "casual", "label": "隨意 (Casual)"},
                    {"value": "formal", "label": "正式 (Formal)"}
                ],
                "index_update_frequency": "realtime",
                "available_index_frequencies": [
                    {"value": "realtime", "label": "即時更新"},
                    {"value": "hourly", "label": "每小時"},
                    {"value": "daily", "label": "每日"},
                    {"value": "weekly", "label": "每週"}
                ],
            },
            "category": "rag",
            "display_name": "RAG 模型參數",
            "description": "RAG 知識庫檢索與生成的相關參數設定",
            "is_sensitive": False,
            "is_public": False,
        },
        
        # 安全設定
        {
            "key": "security",
            "value": {
                "session_timeout": 3600,  # 1 hour
                "max_login_attempts": 5,
                "password_min_length": 6,
                "require_strong_password": False,
                "enable_2fa": False,
            },
            "category": "security",
            "display_name": "安全設定",
            "description": "系統安全相關設定，包含會話管理、密碼規則等",
            "is_sensitive": False,
            "is_public": False,
        },
        
        # 功能開關
        {
            "key": "feature",
            "value": {
                "enable_file_upload": True,
                "enable_rag_query": True,
                "enable_activity_log": True,
                "enable_email_notification": False,
                "enable_websocket": False,
            },
            "category": "feature",
            "display_name": "功能開關",
            "description": "系統各項功能的啟用開關",
            "is_sensitive": False,
            "is_public": False,
        },
        
        # 備份設定
        {
            "key": "backup",
            "value": {
                "auto_backup": False,
                "backup_frequency": "daily",
                "available_backup_frequencies": [
                    {"value": "daily", "label": "每日"},
                    {"value": "weekly", "label": "每週"},
                    {"value": "monthly", "label": "每月"}
                ],
            },
            "category": "backup",
            "display_name": "備份設定",
            "description": "系統備份相關設定",
            "is_sensitive": False,
            "is_public": False,
        },
    ]
    
    async with AsyncSessionLocal() as db:
        created_count = 0
        skipped_count = 0
        
        for setting_data in default_settings:
            # 檢查設定是否已存在
            result = await db.execute(
                select(SystemSetting).where(SystemSetting.key == setting_data["key"])
            )
            existing_setting = result.scalar_one_or_none()
            
            if existing_setting:
                print(f"⏭️  跳過已存在的設定: {setting_data['key']}")
                skipped_count += 1
                continue
            
            # 建立新設定
            setting = SystemSetting(**setting_data)
            db.add(setting)
            created_count += 1
            print(f"✅ 建立設定: {setting_data['key']}")
        
        await db.commit()
        
        print(f"\n📊 設定初始化完成:")
        print(f"   ✅ 新建: {created_count} 個")
        print(f"   ⏭️  跳過: {skipped_count} 個")
        print(f"   📦 總計: {len(default_settings)} 個預設設定")


if __name__ == "__main__":
    print("=" * 60)
    print("初始化系統設定")
    print("=" * 60)
    asyncio.run(init_system_settings())
