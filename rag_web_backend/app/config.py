"""應用程式配置管理"""

from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """應用程式設定"""
    
    # 應用設定
    APP_NAME: str = "RAG Knowledge Base"
    DEBUG: bool = False  # 設為 False 關閉 SQL 日誌
    API_V1_PREFIX: str = "/api"
    
    # 安全設定
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 hours
    
    # 資料庫
    DATABASE_URL: str
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 40
    
    # 檔案上傳（預設值，實際使用資料庫系統設定）
    MAX_FILE_SIZE: int = 52428800  # 50MB - 作為預設值/備援
    ALLOWED_EXTENSIONS: str = ".pdf,.docx,.txt"  # 作為預設值/備援
    UPLOAD_DIR: str = "/app/uploads"  # Docker 絕對路徑，本地開發可設為 "./uploads"
    
    # CORS
    CORS_ORIGINS: str = "*"  # Docker 環境使用，本地開發可設為 "http://localhost:5173,http://localhost:5174"
    
    # ==================== Ollama 設定 ====================
    # 所有 Ollama 服務統一使用此 URL（包含摘要生成、向量嵌入、RAG 回答生成）
    OLLAMA_BASE_URL: str = "https://your-ollama-server-url"
    
    # LLM 模型設定（用於文字生成任務）
    OLLAMA_SUMMARY_MODEL: str = "qwen2.5:14b"  # 用於文件摘要生成（SummaryProcessor）
    OLLAMA_RAG_MODEL: str = "qwen2.5:32b"      # 用於 RAG 回答生成（RAGEngine）
    
    # Embedding 模型設定（用於向量嵌入）
    OLLAMA_EMBEDDING_MODEL: str = "bge-m3"     # 用於文件向量化和查詢向量化（EmbeddingProcessor）
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"  # 忽略額外的環境變數（向後兼容）
    )
    
    @property
    def cors_origins_list(self) -> List[str]:
        """將 CORS_ORIGINS 字串轉換為列表"""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    
    @property
    def allowed_extensions_list(self) -> List[str]:
        """將 ALLOWED_EXTENSIONS 字串轉換為列表"""
        return [ext.strip() for ext in self.ALLOWED_EXTENSIONS.split(",")]


# 建立全域設定實例
settings = Settings()
