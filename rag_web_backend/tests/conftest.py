# 必須在任何 app 模組 import 之前覆蓋環境變數（直接賦值，不用 setdefault）
import os
os.environ["DATABASE_URL"] = "postgresql+asyncpg://postgres:postgres123@postgres:5432/rag_db_test"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-testing-only-32chars!!"
os.environ["DEBUG"] = "True"

import asyncio
import pytest
from typing import AsyncGenerator
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.database import Base
from app.core.security import get_password_hash, create_access_token
from app.models import User, UserRole, Department, Category, FAQ, QueryUser, QueryUserStatus
from app.models.activity import Activity
from app.models.query_history import QueryHistory
from app.models.file import File
from app.models.user_group import UserGroup, FileUserGroupPermission, query_user_groups
from app.models.query_user import FilePermission

TEST_DB_URL = "postgresql+asyncpg://postgres:postgres123@postgres:5432/rag_db_test"


def _new_engine():
    return create_async_engine(TEST_DB_URL, echo=False)


# Sync session fixture — 用 asyncio.run() 在測試 session 開始前建表
@pytest.fixture(scope="session", autouse=True)
def init_test_db():
    async def _create():
        engine = _new_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await engine.dispose()

    asyncio.run(_create())
    yield
    # 不做 drop_all — rag_db_test 是測試專用 DB，表可以保留
    # 需要重置 schema 時手動執行：
    #   docker compose exec postgres psql -U postgres -c "DROP DATABASE rag_db_test; CREATE DATABASE rag_db_test;"


@pytest.fixture(autouse=True)
async def clean_db():
    engine = _new_engine()
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        await session.execute(delete(Activity))
        await session.execute(delete(QueryHistory))
        await session.execute(delete(FileUserGroupPermission))
        await session.execute(query_user_groups.delete())
        await session.execute(delete(FilePermission))
        await session.execute(delete(File))
        await session.execute(delete(FAQ))
        await session.execute(delete(Category))
        await session.execute(delete(UserGroup))
        await session.execute(delete(QueryUser))
        await session.execute(delete(User))
        await session.execute(delete(Department))
        await session.commit()
    await engine.dispose()
    yield


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = _new_engine()
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac


# ── 基礎資料 fixtures ─────────────────────────────────────────────────────────

@pytest.fixture
async def test_department(db_session: AsyncSession) -> Department:
    dept = Department(name="測試部門", slug="test-dept", description="Test", color="#3B82F6")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)
    return dept


@pytest.fixture
async def test_admin(db_session: AsyncSession, test_department: Department) -> User:
    user = User(
        username="test_admin",
        email="test_admin@test.com",
        hashed_password=get_password_hash("testpassword123"),
        full_name="Test Admin",
        role=UserRole.ADMIN,
        is_active=True,
        department_id=test_department.id,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def test_super_admin(db_session: AsyncSession) -> User:
    user = User(
        username="test_superadmin",
        email="test_superadmin@test.com",
        hashed_password=get_password_hash("testpassword123"),
        full_name="Test Super Admin",
        role=UserRole.SUPER_ADMIN,
        is_active=True,
        department_id=None,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def test_query_user(db_session: AsyncSession, test_department: Department) -> QueryUser:
    user = QueryUser(
        username="test_quser",
        email="test_quser@test.com",
        hashed_password=get_password_hash("testpassword123"),
        full_name="Test Query User",
        status=QueryUserStatus.APPROVED,
        is_active=True,
        default_department_id=test_department.id,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


# ── Auth header helpers ───────────────────────────────────────────────────────

@pytest.fixture
def admin_headers(test_admin: User) -> dict:
    token = create_access_token({"sub": str(test_admin.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def super_admin_headers(test_super_admin: User) -> dict:
    token = create_access_token({"sub": str(test_super_admin.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def query_user_headers(test_query_user: QueryUser) -> dict:
    token = create_access_token({"sub": str(test_query_user.id), "type": "query_user"})
    return {"Authorization": f"Bearer {token}"}
