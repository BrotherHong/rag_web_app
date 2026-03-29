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
    JWT_EXPIRE_MINUTES: int = 1440
    
    # 資料庫
    DATABASE_URL: str
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 40
    
    # 檔案上傳
    MAX_FILE_SIZE: int = 52428800  # 50MB
    ALLOWED_EXTENSIONS: str = ".pdf,.docx,.txt"
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

    # LiteLLM 設定
    LITELLM_ROUTING_STRATEGY: str = "simple-shuffle"
    LITELLM_NUM_RETRIES: int = 1
    LITELLM_TIMEOUT: int = 90
    LITELLM_MAX_HOSTS: int = 5

    # 外部 LLM 設定
    OPENAI_DIRECT_MODEL: str = "gpt-5.2"
    OPENAI_ENABLE_WEB_SEARCH: bool = False

    # Google 登入
    GOOGLE_CLIENT_ID: str = ""
    
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
