"""RAG 查詢相關的 Pydantic Schema"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class QueryRequest(BaseModel):
    """RAG 查詢請求"""
    
    query: str = Field(..., min_length=1, max_length=1000, description="查詢問題")
    scope_ids: Optional[List[int]] = Field(default=None, description="範圍限定 ID（第一個元素為 department_id）")
    category_ids: Optional[List[int]] = Field(default=None, description="分類 ID 列表（會自動包含「其他」分類）")
    
    class Config:
        json_schema_extra = {
            "example": {
                "query": "人事室的聯絡方式是什麼？",
                "scope_ids": [1],
                "category_ids": [1, 2, 3]
            }
        }


class DocumentSource(BaseModel):
    """文檔來源"""
    
    file_id: Optional[int] = Field(default=None, description="檔案 ID（用於下載）")
    file_name: str = Field(..., description="檔案名稱")
    source_link: str = Field(default="", description="原始連結")
    download_link: str = Field(default="", description="下載連結")
    
    class Config:
        json_schema_extra = {
            "example": {
                "file_id": 123,
                "file_name": "系統操作手冊.pdf",
                "source_link": "https://example.com/doc",
                "download_link": "/api/files/123/download"
            }
        }


class QueryResponse(BaseModel):
    """RAG 查詢回應"""
    
    query: str = Field(..., description="原始查詢")
    answer: str = Field(..., description="生成的答案")
    sources: List[DocumentSource] = Field(..., description="來源文檔")
    
    class Config:
        json_schema_extra = {
            "example": {
                "query": "什麼是資料隔離原則？",
                "answer": "根據系統文檔，資料隔離原則是指每個處室的資料必須完全隔離...",
                "sources": [
                    {
                        "file_name": "系統操作手冊.pdf",
                        "source_link": "https://example.com/doc",
                        "download_link": "https://example.com/download/doc.pdf"
                    }
                ]
            }
        }



