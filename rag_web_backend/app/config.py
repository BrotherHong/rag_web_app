"""應用程式配置管理"""

from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """應用程式設定"""
    
    # 應用設定
    APP_NAME: str = "RAG Knowledge Base"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api"
    
    # 安全設定
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480
    
    # 資料庫
    DATABASE_URL: str
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 40
    
    # 檔案上傳
    MAX_FILE_SIZE: int = 10485760  # 10MB
    ALLOWED_EXTENSIONS: str = ".pdf,.doc,.docx,.txt,.xls,.xlsx"
    UPLOAD_DIR: str = "/app/uploads"
    
    # CORS
    CORS_ORIGINS: str = "*"
    
    # Ollama 設定
    OLLAMA_BASE_URL: str = ""
    OLLAMA_BASE_URL_2: str = ""
    OLLAMA_BASE_URL_3: str = ""
    OLLAMA_BASE_URL_4: str = ""
    OLLAMA_BASE_URL_5: str = ""
    OLLAMA_SUMMARY_MODEL: str = ""
    OLLAMA_RAG_MODEL: str = ""
    OLLAMA_EMBEDDING_MODEL: str = ""

    # Guard 設定
    GUARD_ENABLED: bool = True          # 是否啟用 llama-guard 安全過濾
    GUARD_MODEL: str = "llama-guard3:8b"  # 安全過濾模型

    # LiteLLM 設定
    LITELLM_ROUTING_STRATEGY: str = "simple-shuffle"
    LITELLM_NUM_RETRIES: int = 3
    LITELLM_TIMEOUT: int = 90
    LITELLM_MAX_HOSTS: int = 5
    LITELLM_ALLOWED_FAILS: int = 1    # 端點失敗幾次後進入冷卻
    LITELLM_COOLDOWN_TIME: int = 60   # 冷卻期間（秒），期間該端點不再被選用

    # 外部 LLM 設定
    OPENAI_DIRECT_MODEL: str = "gpt-5.2"
    OPENAI_ENABLE_WEB_SEARCH: bool = False

    # Google 登入
    GOOGLE_CLIENT_ID: str = ""

    # 成功入口（NCKU ADFS SSO）登入
    PORTAL_CLIENT_ID: str = ""
    PORTAL_CLIENT_SECRET: str = ""
    PORTAL_REDIRECT_URI: str = ""  # 例: http://aidemo.ncku.edu.tw:8888/api/query-auth/portal-callback

    # Reranker 設定
    RERANKER_API_URL: str = "http://localhost:8100"  # Reranker server 位址
    RERANKER_MODEL: str = "BAAI/bge-reranker-v2-m3"
    RERANKER_API_FORMAT: str = "internal"  # internal, tei

    # Celery 設定
    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/1"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )
    
    @property
    def cors_origins_list(self) -> List[str]:
        """將 CORS_ORIGINS 字串轉換為列表"""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    
    @property
    def allowed_extensions_list(self) -> List[str]:
        """將 ALLOWED_EXTENSIONS 字串轉換為列表"""
        return [ext.strip() for ext in self.ALLOWED_EXTENSIONS.split(",")]
    
    @property
    def ollama_base_urls(self) -> List[str]:
        """收集所有配置的 Ollama 主機 URL（自動擴展）"""
        urls = []

        if self.OLLAMA_BASE_URL:
            urls.append(self.OLLAMA_BASE_URL.rstrip("/"))
        
        for i in range(2, self.LITELLM_MAX_HOSTS + 1):
            url = getattr(self, f"OLLAMA_BASE_URL_{i}", None)
            if url:
                urls.append(url.rstrip("/"))
        
        return urls


# 建立全域設定實例
settings = Settings()
