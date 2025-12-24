"""資料庫連線與 Session 管理"""

from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

# 建立異步引擎
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,  # 開發環境顯示 SQL
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_pre_ping=True,  # 連線前檢測是否有效
    pool_recycle=3600,   # 1小時回收連線
)

# 建立 Session Factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


# 建立 Base 類別供所有模型繼承
class Base(DeclarativeBase):
    """所有模型的基礎類別"""
    pass


# 依賴注入：取得資料庫 Session
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    資料庫 Session 依賴注入
    
    使用方式:
        @router.get("/")
        async def get_items(db: AsyncSession = Depends(get_db)):
            result = await db.execute(select(Item))
            return result.scalars().all()
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """初始化資料庫：建立所有資料表"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db():
    """關閉資料庫連線"""
    await engine.dispose()
