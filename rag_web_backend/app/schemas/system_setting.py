"""系統設定 Schemas"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class SystemSettingBase(BaseModel):
    """系統設定基礎欄位"""
    key: str = Field(..., min_length=1, max_length=100, description="設定鍵")
    value: dict[str, Any] = Field(..., description="設定值（JSON 格式）")
    category: str = Field(..., min_length=1, max_length=50, description="設定類型")
    display_name: str = Field(..., min_length=1, max_length=200, description="顯示名稱")
    description: Optional[str] = Field(None, description="說明描述")
    is_sensitive: bool = Field(False, description="是否為敏感資訊")
    is_public: bool = Field(False, description="是否可公開訪問")


class SystemSettingCreate(SystemSettingBase):
    """建立系統設定請求"""
    validation_schema: Optional[dict] = Field(None, description="資料驗證 schema（JSON Schema 格式）")


class SystemSettingUpdate(BaseModel):
    """更新系統設定請求"""
    value: Optional[dict[str, Any]] = Field(None, description="設定值")
    display_name: Optional[str] = Field(None, min_length=1, max_length=200, description="顯示名稱")
    description: Optional[str] = Field(None, description="說明描述")
    is_sensitive: Optional[bool] = Field(None, description="是否為敏感資訊")
    is_public: Optional[bool] = Field(None, description="是否可公開訪問")
    validation_schema: Optional[dict] = Field(None, description="資料驗證 schema")


class SystemSettingResponse(SystemSettingBase):
    """系統設定響應"""
    id: int
    validation_schema: Optional[dict] = None
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class SystemSettingListResponse(BaseModel):
    """系統設定列表響應"""
    items: list[SystemSettingResponse]
    total: int
    page: int
    pages: int


class SystemSettingPublicResponse(BaseModel):
    """公開系統設定響應（隱藏敏感資訊）"""
    key: str
    value: dict[str, Any]
    category: str
    display_name: str
    description: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


class SystemSettingBatchUpdate(BaseModel):
    """批次更新系統設定請求"""
    settings: dict[str, dict[str, Any]] = Field(
        ..., 
        description="設定字典，key 為設定鍵，value 為設定值"
    )


# ===== 預定義的設定類型 =====

class AppSettings(BaseModel):
    """應用程式設定"""
    max_file_size: int = Field(52428800, description="最大檔案大小（bytes），預設 50MB")
    allowed_file_types: list[str] = Field(
        [".pdf", ".docx", ".txt"],
        description="允許的檔案類型"
    )
    files_per_page: int = Field(20, description="每頁顯示檔案數")
    maintenance_mode: bool = Field(False, description="維護模式")
    allow_registration: bool = Field(False, description="允許註冊")


class RAGSettings(BaseModel):
    """RAG 模型參數設定"""
    model_name: str = Field("gpt-4", description="LLM 模型名稱")
    temperature: float = Field(0.7, ge=0.0, le=2.0, description="溫度參數")
    max_tokens: int = Field(2000, ge=1, le=4096, description="最大 token 數")
    top_k: int = Field(5, ge=1, le=20, description="檢索文檔數量")
    chunk_size: int = Field(500, ge=100, le=2000, description="文檔分塊大小")
    chunk_overlap: int = Field(50, ge=0, le=500, description="分塊重疊大小")
    embedding_model: str = Field("text-embedding-ada-002", description="嵌入模型")
    tone: str = Field("professional", description="回應風格")
    
    # 可用選項定義（前端下拉選單會用到）- 物件陣列格式
    available_models: list[dict[str, str]] = Field(
        [
            {"value": "gpt-4", "label": "GPT-4"},
            {"value": "gpt-3.5-turbo", "label": "GPT-3.5 Turbo"},
            {"value": "claude-3", "label": "Claude 3"},
            {"value": "llama-2", "label": "Llama 2"}
        ],
        description="可用的 AI 模型選項"
    )
    available_tones: list[dict[str, str]] = Field(
        [
            {"value": "professional", "label": "專業 (Professional)"},
            {"value": "friendly", "label": "友善 (Friendly)"},
            {"value": "casual", "label": "隨意 (Casual)"},
            {"value": "formal", "label": "正式 (Formal)"}
        ],
        description="可用的回應風格選項"
    )
    index_update_frequency: str = Field("realtime", description="索引更新頻率")
    available_index_frequencies: list[dict[str, str]] = Field(
        [
            {"value": "realtime", "label": "即時更新"},
            {"value": "hourly", "label": "每小時"},
            {"value": "daily", "label": "每日"},
            {"value": "weekly", "label": "每週"}
        ],
        description="可用的索引更新頻率選項"
    )


class SecuritySettings(BaseModel):
    """安全設定"""
    session_timeout: int = Field(3600, description="會話超時時間（秒）")
    max_login_attempts: int = Field(5, description="最大登入嘗試次數")
    password_min_length: int = Field(6, description="密碼最小長度")
    require_strong_password: bool = Field(False, description="需要強密碼")
    enable_2fa: bool = Field(False, description="啟用雙因素認證")


class FeatureSettings(BaseModel):
    """功能開關設定"""
    enable_file_upload: bool = Field(True, description="啟用檔案上傳")
    enable_rag_query: bool = Field(True, description="啟用 RAG 查詢")
    enable_activity_log: bool = Field(True, description="啟用活動記錄")
    enable_email_notification: bool = Field(False, description="啟用郵件通知")
    enable_websocket: bool = Field(False, description="啟用 WebSocket")


class BackupSettings(BaseModel):
    """備份設定"""
    auto_backup: bool = Field(False, description="自動備份")
    backup_frequency: str = Field("daily", description="備份頻率")
    available_backup_frequencies: list[dict[str, str]] = Field(
        [
            {"value": "daily", "label": "每日"},
            {"value": "weekly", "label": "每週"},
            {"value": "monthly", "label": "每月"}
        ],
        description="可用的備份頻率選項"
    )
