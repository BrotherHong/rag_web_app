"""檔案管理相關的 Pydantic Schemas"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime


class FileBase(BaseModel):
    """檔案基礎 Schema"""
    original_filename: str
    description: Optional[str] = None
    category_id: Optional[int] = None


class FileCreate(FileBase):
    """建立檔案（上傳時使用）"""
    filename: str
    file_path: str
    file_size: int
    file_type: str
    mime_type: Optional[str] = None
    department_id: int
    uploader_id: int


class FileUpdate(BaseModel):
    """更新檔案資訊"""
    category_id: Optional[int] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None


class FileUploadResponse(BaseModel):
    """檔案上傳回應"""
    id: int
    filename: str
    original_filename: str
    file_size: int
    status: str
    message: str = "檔案上傳成功，正在處理中..."

    class Config:
        from_attributes = True


class CategoryInfo(BaseModel):
    """分類資訊"""
    id: int
    name: str
    color: str

    class Config:
        from_attributes = True


class UploaderInfo(BaseModel):
    """上傳者資訊"""
    id: int
    username: str
    full_name: str

    class Config:
        from_attributes = True


class DepartmentInfo(BaseModel):
    """處室資訊"""
    id: int
    name: str

    class Config:
        from_attributes = True


class FileSchema(BaseModel):
    """檔案基本資訊 Schema"""
    id: int
    filename: str
    original_filename: str
    file_size: int
    file_type: str
    category: Optional[CategoryInfo] = None
    uploader: UploaderInfo
    status: str
    is_vectorized: bool
    vector_count: Optional[int] = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FileDetailResponse(BaseModel):
    """檔案詳細資訊"""
    id: int
    filename: str
    original_filename: str
    file_size: int
    file_type: str
    mime_type: Optional[str]
    category: Optional[CategoryInfo]
    uploader: UploaderInfo
    department: DepartmentInfo
    status: str
    is_vectorized: bool
    vector_count: Optional[int] = 0
    description: Optional[str]
    tags: Optional[List[str]] = []
    processing_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FileListResponse(BaseModel):
    """檔案列表回應"""
    items: List[FileSchema]
    total: int
    page: int
    pages: int


class FileStatsResponse(BaseModel):
    """檔案統計回應"""
    total_files: int
    total_size: int
    by_status: dict
    by_type: dict
    recent_uploads: List[FileSchema]
