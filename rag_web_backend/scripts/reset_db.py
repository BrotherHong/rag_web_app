"""重置並初始化資料庫

此腳本會：
1. 刪除所有表格
2. 重新建立所有表格
3. 初始化預設資料（處室、分類、管理員）
4. 初始化系統設定

執行方式：
    python scripts/reset_db.py
"""

import asyncio
import sys
from pathlib import Path

# 添加專案根目錄到 Python 路徑
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.core.database import AsyncSessionLocal, engine
from app.models import Base
from scripts.init_db import init_departments, init_categories, init_admin_users
from scripts.init_system_settings import init_system_settings


async def drop_all_tables():
    """刪除所有表格"""
    print("🗑️  正在刪除所有表格...")
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    print("✅ 所有表格已刪除\n")


async def create_all_tables():
    """建立所有表格"""
    print("🏗️  正在建立所有表格...")
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    print("✅ 所有表格已建立\n")


async def main():
    """執行重置與初始化"""
    print("=" * 60)
    print("🔄 RAG 知識庫系統 - 資料庫重置與初始化")
    print("=" * 60)
    print()
    
    try:
        # 1. 刪除所有表格
        await drop_all_tables()
        
        # 2. 重新建立所有表格
        await create_all_tables()
        
        # 3. 初始化預設資料
        async with AsyncSessionLocal() as session:
            # 初始化處室
            await init_departments(session)
            
            # 初始化分類（每個處室獨立）
            await init_categories(session)
            
            # 初始化管理員（系統管理員 + 處室管理員）
            await init_admin_users(session)
        
        # 4. 初始化系統設定
        await init_system_settings()
        
        print("=" * 60)
        print("🎉 資料庫重置與初始化完成！")
        print("=" * 60)
        print()
        print("📝 預設帳號資訊：")
        print()
        print("   🔑 系統管理員：")
        print("      帳號：superadmin")
        print("      密碼：admin123")
        print()
        print("   👥 處室管理員：")
        print("      人事室：hr_admin / admin123")
        print("      會計室：acc_admin / admin123")
        print("      總務處：ga_admin / admin123")
        print()
        print("   ⚠️  請登入後立即修改密碼！")
        print()
        
    except Exception as e:
        print(f"\n❌ 重置失敗：{e}")
        import traceback
        traceback.print_exc()
        raise


if __name__ == "__main__":
    # Windows 平台修正
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    asyncio.run(main())
