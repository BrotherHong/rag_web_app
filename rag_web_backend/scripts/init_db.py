"""資料庫預設資料初始化腳本

執行方式：
    python scripts/init_db.py
"""

import asyncio
import os
import sys
from pathlib import Path

# 添加專案根目錄到 Python 路徑
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal
from app.models import Department, User, Category, UserRole
from app.core.security import get_password_hash


async def init_departments(session: AsyncSession):
    """初始化預設處室"""
    print("🏢 正在初始化處室...")
    
    departments_data = [
        {"name": "人事室", "slug": "hr", "description": "負責人事管理、招聘、培訓等業務", "color": "#3B82F6"},
        {"name": "會計室", "slug": "accounting", "description": "負責財務管理、預算編制、會計核算等業務", "color": "#10B981"},
        {"name": "總務處", "slug": "general-affairs", "description": "負責行政總務、資產管理、採購等業務", "color": "#F59E0B"},
    ]
    
    created_count = 0
    for dept_data in departments_data:
        # 檢查是否已存在
        result = await session.execute(
            select(Department).where(Department.name == dept_data["name"])
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            print(f"  ⏭️  處室 '{dept_data['name']}' 已存在，跳過")
        else:
            dept = Department(**dept_data)
            session.add(dept)
            created_count += 1
            print(f"  ✅ 建立處室: {dept_data['name']} (顏色: {dept_data['color']})")
    
    await session.commit()
    print(f"✨ 處室初始化完成！建立 {created_count} 個處室\n")
    
    return departments_data


async def init_categories(session: AsyncSession):
    """初始化預設分類（每個處室獨立的分類）"""
    print("📁 正在初始化分類...")
    
    # 取得所有處室
    result = await session.execute(select(Department))
    departments = result.scalars().all()
    
    if not departments:
        print("  ❌ 錯誤：找不到任何處室，請先執行處室初始化")
        return
    
    # 每個處室的預設分類（不同處室有不同的分類）
    categories_by_dept = {
        "人事室": [
            {"name": "其他", "description": "不屬於以上任一分類的檔案", "color": "#6B7280", "is_default": True},
            {"name": "人事政策", "description": "人事相關政策與規範", "color": "#3B82F6"},
            {"name": "員工資料", "description": "員工基本資料與檔案", "color": "#8B5CF6"},
            {"name": "考勤管理", "description": "出勤記錄與假單", "color": "#EC4899"},
            {"name": "薪資福利", "description": "薪資表與福利制度", "color": "#06B6D4"},
            {"name": "教育訓練", "description": "培訓課程與記錄", "color": "#10B981"},
        ],
        "會計室": [
            {"name": "其他", "description": "不屬於以上任一分類的檔案", "color": "#6B7280", "is_default": True},
            {"name": "財務報表", "description": "財務報告與報表", "color": "#10B981"},
            {"name": "預算管理", "description": "預算編制與執行", "color": "#F59E0B"},
            {"name": "會計憑證", "description": "會計憑證與帳簿", "color": "#EF4444"},
            {"name": "稅務文件", "description": "稅務申報與文件", "color": "#8B5CF6"},
            {"name": "審計資料", "description": "內外部審計資料", "color": "#6366F1"},
        ],
        "總務處": [
            {"name": "其他", "description": "不屬於以上任一分類的檔案", "color": "#6B7280", "is_default": True},
            {"name": "採購文件", "description": "採購申請與合約", "color": "#F59E0B"},
            {"name": "資產管理", "description": "資產清冊與盤點", "color": "#06B6D4"},
            {"name": "設施維護", "description": "設施維修與保養記錄", "color": "#EF4444"},
            {"name": "庶務管理", "description": "日常庶務與行政支援", "color": "#8B5CF6"},
            {"name": "場地租借", "description": "場地申請與管理", "color": "#EC4899"},
        ],
    }
    
    created_count = 0
    for dept in departments:
        dept_categories = categories_by_dept.get(dept.name, [])
        
        if not dept_categories:
            print(f"  ⚠️  處室 '{dept.name}' 沒有預設分類")
            continue
        
        print(f"  📂 處室 '{dept.name}' 的分類：")
        
        for cat_data in dept_categories:
            # 檢查是否已存在（同處室同名稱）
            result = await session.execute(
                select(Category).where(
                    Category.name == cat_data["name"],
                    Category.department_id == dept.id
                )
            )
            existing = result.scalar_one_or_none()
            
            if existing:
                print(f"     ⏭️  分類 '{cat_data['name']}' 已存在，跳過")
            else:
                category = Category(
                    name=cat_data["name"],
                    description=cat_data["description"],
                    color=cat_data["color"],
                    department_id=dept.id
                )
                session.add(category)
                created_count += 1
                print(f"     ✅ 建立分類: {cat_data['name']} (顏色: {cat_data['color']})")
    
    await session.commit()
    print(f"\n✨ 分類初始化完成！建立 {created_count} 個分類\n")


async def init_admin_users(session: AsyncSession):
    """初始化管理員帳號（系統管理員 + 各處室管理員）"""
    print("👤 正在初始化管理員帳號...")
    
    # 從環境變數讀取管理員帳號密碼
    super_admin_username = os.getenv("SUPER_ADMIN_USERNAME", "superadmin")
    super_admin_password = os.getenv("SUPER_ADMIN_PASSWORD", "admin123")
    super_admin_email = os.getenv("SUPER_ADMIN_EMAIL", "superadmin@ncku.edu.tw")
    
    dept_admin_password = os.getenv("DEPT_ADMIN_PASSWORD", "admin123")
    
    # 取得所有處室
    result = await session.execute(select(Department))
    departments = result.scalars().all()
    
    if not departments:
        print("  ❌ 錯誤：找不到任何處室，請先執行處室初始化")
        return
    
    # 建立處室對照表
    dept_map = {dept.name: dept for dept in departments}
    
    # 1. 建立系統管理員（屬於人事室）
    hr_dept = dept_map.get("人事室")
    if not hr_dept:
        print("  ❌ 錯誤：找不到人事室")
        return
    
    print("  🔑 系統管理員：")
    super_admin_data = {
        "username": super_admin_username,
        "email": super_admin_email,
        "full_name": "系統管理員",
        "hashed_password": get_password_hash(super_admin_password),
        "role": UserRole.SUPER_ADMIN,
        "is_active": True,
        "department_id": None,
    }
    
    result = await session.execute(
        select(User).where(User.username == super_admin_data["username"])
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        print(f"     ⏭️  '{super_admin_data['username']}' 已存在，跳過")
    else:
        admin = User(**super_admin_data)
        session.add(admin)
        print(f"     ✅ 建立: {super_admin_data['username']} (系統管理員)")
        print(f"        📧 Email: {super_admin_data['email']}")
        print(f"        🏢 處室: {hr_dept.name}")
        print(f"        🔑 密碼: {super_admin_password}")
    
    # 2. 為每個處室建立處室管理員
    print("\n  👥 處室管理員：")
    
    dept_admins = [
        {
            "username": "hr_admin",
            "email": "hr_admin@ncku.edu.tw",
            "full_name": "人事室管理員",
            "department": "人事室",
        },
        {
            "username": "acc_admin",
            "email": "acc_admin@ncku.edu.tw",
            "full_name": "會計室管理員",
            "department": "會計室",
        },
        {
            "username": "ga_admin",
            "email": "ga_admin@ncku.edu.tw",
            "full_name": "總務處管理員",
            "department": "總務處",
        },
    ]
    
    for admin_data in dept_admins:
        dept = dept_map.get(admin_data["department"])
        if not dept:
            print(f"     ⚠️  找不到處室 '{admin_data['department']}'，跳過")
            continue
        
        # 檢查是否已存在
        result = await session.execute(
            select(User).where(User.username == admin_data["username"])
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            print(f"     ⏭️  '{admin_data['username']}' 已存在，跳過")
        else:
            user = User(
                username=admin_data["username"],
                email=admin_data["email"],
                full_name=admin_data["full_name"],
                hashed_password=get_password_hash(dept_admin_password),
                role=UserRole.ADMIN,
                is_active=True,
                department_id=dept.id,
            )
            session.add(user)
            print(f"     ✅ 建立: {admin_data['username']} (處室管理員)")
            print(f"        📧 Email: {admin_data['email']}")
            print(f"        🏢 處室: {dept.name}")
            print(f"        🔑 密碼: {dept_admin_password}")
    
    await session.commit()
    print(f"\n✨ 管理員初始化完成！\n")


async def main():
    """執行所有初始化"""
    print("=" * 60)
    print("🚀 RAG 知識庫系統 - 資料庫初始化")
    print("=" * 60)
    print()
    
    async with AsyncSessionLocal() as session:
        try:
            # 檢查資料庫是否已初始化（透過檢查是否有處室）
            result = await session.execute(select(Department))
            existing_depts = result.scalars().all()
            
            if existing_depts:
                print("⏭️  資料庫已經初始化過，跳過初始化流程")
                print(f"   目前有 {len(existing_depts)} 個處室：{', '.join([d.name for d in existing_depts])}")
                print()
                print("💡 提示：如需重新初始化，請先清空資料庫")
                return
            
            print("🆕 偵測到空資料庫，開始初始化...\n")
            
            # 1. 初始化處室
            await init_departments(session)
            
            # 2. 初始化分類
            await init_categories(session)
            
            # 3. 初始化管理員
            await init_admin_users(session)
            
            # 讀取環境變數以顯示正確的帳號資訊
            super_admin_username = os.getenv("SUPER_ADMIN_USERNAME", "superadmin")
            super_admin_password = os.getenv("SUPER_ADMIN_PASSWORD", "admin123")
            dept_admin_password = os.getenv("DEPT_ADMIN_PASSWORD", "admin123")
            
            print("=" * 60)
            print("🎉 資料庫初始化完成！")
            print("=" * 60)
            print()
            print("📝 預設帳號資訊：")
            print()
            print("   🔑 系統管理員：")
            print(f"      帳號：{super_admin_username}")
            print(f"      密碼：{super_admin_password}")
            print()
            print("   👥 處室管理員：")
            print(f"      人事室：hr_admin / {dept_admin_password}")
            print(f"      會計室：acc_admin / {dept_admin_password}")
            print(f"      總務處：ga_admin / {dept_admin_password}")
            print()
            print("   ⚠️  請登入後立即修改密碼！")
            print()
            
        except Exception as e:
            print(f"\n❌ 初始化失敗：{e}")
            raise


if __name__ == "__main__":
    # Windows 平台修正
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    asyncio.run(main())
