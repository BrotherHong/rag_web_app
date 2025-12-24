"""
向量嵌入處理器 - 統一版本
整合文件處理和向量生成功能
"""

import json
import numpy as np
from pathlib import Path
from typing import Optional, List
from app.services.llm.ollama_client import OllamaClient
from app.config import settings


class EmbeddingProcessor:
    """
    處理文檔摘要的向量化
    整合了基礎向量生成和文件處理功能
    """
    
    def __init__(self, 
                 ollama_client: Optional[OllamaClient] = None,
                 base_url: str = None,
                 embedding_model: str = None):
        """
        初始化Embedding處理器
        
        參數:
            ollama_client: OllamaClient 實例（優先使用，如未提供則自動創建）
            base_url: Ollama伺服器地址
            embedding_model: 使用的embedding模型
        """
        self.client = ollama_client or OllamaClient(base_url=base_url or settings.OLLAMA_BASE_URL)
        self.embedding_model = embedding_model or settings.OLLAMA_EMBEDDING_MODEL
    
    def generate_embedding(self, text: str, model: str = None) -> Optional[List[float]]:
        """
        為文本生成embedding向量
        
        參數:
            text: 要向量化的文本
            model: 使用的模型（可選，預設使用初始化時的模型）
            
        返回:
            embedding向量或None(如果失敗)
        """
        try:
            # 使用Ollama的embedding API
            embedding = self.client.generate_embedding(
                text, 
                model=model or self.embedding_model
            )
            return embedding
            
        except Exception as e:
            print(f"生成embedding失敗: {str(e)}")
            return None
    
    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """
        計算兩個向量的余弦相似度
        
        參數:
            vec1, vec2: 要比較的向量
            
        返回:
            余弦相似度值 (0-1)
        """
        try:
            v1 = np.array(vec1)
            v2 = np.array(vec2)
            
            dot_product = np.dot(v1, v2)
            norm1 = np.linalg.norm(v1)
            norm2 = np.linalg.norm(v2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
                
            return float(dot_product / (norm1 * norm2))
        except Exception as e:
            print(f"相似度計算失敗: {str(e)}")
            return 0.0
    
    def process_summary_file(
        self,
        summary_json_path: Path,
        output_json_path: Path,
        original_filename: str = None
    ) -> bool:
        """
        處理摘要檔案生成嵌入
        
        參數:
            summary_json_path: 摘要 JSON 檔案路徑
            output_json_path: 輸出嵌入 JSON 路徑
            original_filename: 原始檔名（例如 "Q&A.pdf"）
            
        返回:
            bool: 是否成功
        """
        try:
            # 讀取摘要
            with open(summary_json_path, 'r', encoding='utf-8') as f:
                summary_data = json.load(f)
            
            summary_text = summary_data.get('summary', '')
            if not summary_text:
                print(f"⚠️ 摘要為空")
                return False
            
            # 生成嵌入
            embedding = self.generate_embedding(summary_text)
            
            if not embedding:
                print(f"❌ 嵌入生成失敗")
                return False
            
            # 建立嵌入資料
            embedding_data = {
                'filename': summary_data.get('filename', ''),
                'original_filename': original_filename or summary_data.get('filename', ''),  # ✅ 新增：原始檔名
                'summary_length': summary_data.get('summary_length', 0),
                'doc_type': summary_data.get('doc_type', 'Info Mode'),
                'embedding': embedding,
                'embedding_dim': len(embedding)
            }
            
            # 儲存
            output_json_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_json_path, 'w', encoding='utf-8') as f:
                json.dump(embedding_data, f, ensure_ascii=False, indent=2)
            
            print(f"✅ 嵌入生成成功 (維度: {len(embedding)})")
            return True
            
        except Exception as e:
            print(f"❌ 處理失敗: {e}")
            return False
