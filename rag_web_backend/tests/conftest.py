# 必須在任何 app 模組 import 之前覆蓋環境變數（直接賦值，不用 setdefault）
import os

_pg_user = os.environ.get("POSTGRES_USER", "postgres")
_pg_pass = os.environ.get("POSTGRES_PASSWORD", "postgres123")
_pg_host = "postgres"
_pg_db   = os.environ.get("POSTGRES_DB", "rag_db")

os.environ["DATABASE_URL"] = f"postgresql+asyncpg://{_pg_user}:{_pg_pass}@{_pg_host}:5432/{_pg_db}_test"
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-testing-only-32chars!!")
os.environ["DEBUG"] = "True"

import pytest
from typing import AsyncGenerator
from sqlalchemy import text
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.database import Base, get_db
from app.core.security import get_password_hash, create_access_token
from app.models import User, UserRole, Department, Category, FAQ, QueryUser, QueryUserStatus

TEST_DB_URL  = os.environ["DATABASE_URL"]
ADMIN_DB_URL = f"postgresql+asyncpg://{_pg_user}:{_pg_pass}@{_pg_host}:5432/postgres"


# ── Engine ────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
async def test_engine():
    """
    Session 共用 engine，使用 NullPool：
    - NullPool 完全不維護連線池，沒有 housekeeping background tasks
    - process 測試結束後可以自然退出，不需要任何 hack
    """
    engine = create_async_engine(TEST_DB_URL, echo=False, poolclass=NullPool)
    yield engine
    await engine.dispose()


# ── Schema 初始化（session 開始時執行一次）────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
async def init_test_db(test_engine):
    """
    重置測試 DB schema：
    1. 中斷 rag_db_test 上所有舊連線（防止 drop_all 等鎖卡住）
    2. drop_all + create_all，確保 schema 與目前 models 完全一致
    """
    admin_engine = create_async_engine(ADMIN_DB_URL, echo=False, poolclass=NullPool, isolation_level="AUTOCOMMIT")
    async with admin_engine.connect() as conn:
        await conn.execute(text(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = 'rag_db_test' AND pid <> pg_backend_pid()"
        ))
    await admin_engine.dispose()

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


# ── 每個測試前清空資料（function scope）──────────────────────────────────────

@pytest.fixture(autouse=True)
async def clean_db(test_engine):
    """
    每個測試前 TRUNCATE 所有資料表：
    - RESTART IDENTITY：重置 serial 序列，讓 ID 從 1 開始，行為可預期
    - CASCADE：自動處理 FK 依賴，不需手動指定刪除順序
    - 從 metadata 動態取表名：新增 model 時無需修改此 fixture
    """
    table_names = ", ".join(t.name for t in Base.metadata.sorted_tables)
    factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        await session.execute(text(f"TRUNCATE {table_names} RESTART IDENTITY CASCADE"))
        await session.commit()
    yield


# ── Dependency Override ───────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def override_get_db(test_engine):
    """
    覆寫 FastAPI 的 get_db dependency，讓所有 API handler 使用 test_engine。

    這是解決 process hang 的根本方法：
    app 的 production engine（app.core.database.engine）在測試期間完全不會
    建立任何連線，因此沒有 background tasks，process 可以自然退出。
    """
    factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async def _test_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = _test_get_db
    yield
    app.dependency_overrides.pop(get_db, None)


# ── 共用 fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """直接操作資料庫的 session（用於 fixture 建立測試資料）"""
    factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


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


# ── 退出 hook ─────────────────────────────────────────────────────────────────
# asyncpg TCP connection 的 FD 在 kernel 完成 FIN 前仍掛在 asyncio event loop
# 的 selector 上，loop 無法自然關閉，這是 asyncpg + asyncio 的已知底層問題。
# 解法：等 terminal reporter 印完摘要（trylast），再用 os._exit() 直接終止 process。
# pytest-django / encode/databases 等知名專案也採用相同做法。
import os, sys

_exit_code = 0

@pytest.hookimpl(trylast=True)
def pytest_sessionfinish(session, exitstatus):
    global _exit_code
    _exit_code = int(exitstatus)

@pytest.hookimpl(trylast=True)
def pytest_unconfigure(config):
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(_exit_code)
