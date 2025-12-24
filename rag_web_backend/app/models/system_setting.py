"""系統設定資料模型"""

from sqlalchemy import JSON, Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin


class SystemSetting(Base, TimestampMixin):
    """系統設定模型
    
    用於儲存系統級別的配置參數，包括：
    - 應用程式設定（上傳限制、檔案類型等）
    - RAG 模型參數（temperature、top_k、max_tokens 等）
    - 功能開關（維護模式、註冊開關等）
    """
    
    __tablename__ = "system_settings"
    
    # 主鍵
    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    
    # 設定鍵（唯一）
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    
    # 設定值（JSON 格式，支援複雜結構）
    value: Mapped[dict] = mapped_column(JSON, nullable=False)
    
    # 設定類型（app, rag, security, feature 等）
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    
    # 顯示名稱
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    
    # 說明描述
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # 是否為敏感資訊（如 API Key）
    is_sensitive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # 是否可公開訪問（不需認證）
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # 資料驗證 schema（JSON Schema 格式）
    validation_schema: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    
    def __repr__(self):
        return f"<SystemSetting(key={self.key}, category={self.category})>"
