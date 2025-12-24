#!/usr/bin/env python3
"""
向量存儲和檢索系統 - 適配 Web Backend
"""

import os
import json
from typing import List, Dict, Optional, Tuple
from app.services.document_processing import EmbeddingProcessor


class VectorStore:
    """
    管理向量存儲和相似性搜索
    """
    
    def __init__(self, base_path="uploads/1/processed"):
        """
        初始化向量存儲
        
        參數:
            base_path: 處理後文件的基礎路徑 (預設: uploads/1/processed)
        """
        self.base_path = base_path
        self.embeddings_path = os.path.join(base_path, "embeddings")
        self.summaries_path = os.path.join(base_path, "summaries")
        self.embedding_processor = EmbeddingProcessor()
        
        # 緩存數據
        self._embeddings_cache = None
        self._documents_cache = None
    
    def load_embeddings(self) -> Tuple[List[List[float]], List[Dict]]:
        """
        加載embeddings和對應的文檔信息（從單一目錄）
        
        返回:
            (embeddings列表, 文檔信息列表)
        """
        # 檢查緩存
        if self._embeddings_cache is not None and self._documents_cache is not None:
            return self._embeddings_cache, self._documents_cache
        
        print(f"正在從 {self.embeddings_path} 加載embeddings...")
        
        embeddings = []
        documents = []
        
        if not os.path.exists(self.embeddings_path):
            print(f"Embeddings目錄不存在: {self.embeddings_path}")
            return embeddings, documents
        
        # 遍歷 embeddings 目錄中的所有文件
        for root, _, files in os.walk(self.embeddings_path):
            for file in files:
                if file.endswith('_embedding.json'):
                    try:
                        file_path = os.path.join(root, file)
                        with open(file_path, 'r', encoding='utf-8') as f:
                            embedding_data = json.load(f)
                        
                        embedding = embedding_data.get('embedding', [])
                        if embedding:
                            embeddings.append(embedding)
                            documents.append({
                                'filename': embedding_data.get('filename', ''),
                                'original_filename': embedding_data.get('original_filename', embedding_data.get('filename', '')),  # ✅ 新增：原始檔名
                                'original_path': embedding_data.get('original_path', ''),
                                'summary_length': embedding_data.get('summary_length', 0),
                                'embedding_file': file_path,
                                'source_link': embedding_data.get('source_link', ''),
                                'download_link': embedding_data.get('download_link', '')
                            })
                    except Exception as e:
                        print(f"加載embedding文件失敗 {file}: {str(e)}")
        
        # 緩存結果
        self._embeddings_cache = embeddings
        self._documents_cache = documents
        
        print(f"成功加載 {len(embeddings)} 個embeddings")
        return embeddings, documents
    
    def search_similar(self, query_text: str, top_k: int = 5, similarity_threshold: float = 0.1, allowed_filenames: set = None) -> List[Dict]:
        """
        搜索與查詢文本最相似的文檔
        
        參數:
            query_text: 查詢文本
            top_k: 返回前K個最相似的結果
            similarity_threshold: 相似度閾值
            allowed_filenames: 允許的檔案名稱集合，None 表示不過濾
            
        返回:
            相似文檔列表，每個包含文檔信息和相似度分數
        """
        # 生成查詢的embedding
        print(f"正在為查詢生成embedding: '{query_text}'")
        if allowed_filenames:
            print(f"  檔案過濾: 只檢索 {len(allowed_filenames)} 個允許的檔案")
        query_embedding = self.embedding_processor.generate_embedding(query_text)
        
        if not query_embedding:
            print("查詢embedding生成失敗")
            return []
        
        # 載入所有 embeddings
        embeddings, documents = self.load_embeddings()
        
        if not embeddings:
            print("沒有可搜索的embeddings")
            return []
        
        # 計算相似度
        similarities = []
        for i, doc_embedding in enumerate(embeddings):
            # 檢查檔案是否在允許清單中
            doc_filename = documents[i].get('original_filename') or documents[i].get('filename')
            if allowed_filenames is not None and doc_filename not in allowed_filenames:
                continue  # 跳過不在允許清單中的檔案
            
            similarity = self.embedding_processor.cosine_similarity(query_embedding, doc_embedding)
            
            # 檢查相似度閾值
            if similarity >= similarity_threshold:
                similarities.append({
                    'document': documents[i],
                    'similarity': similarity
                })
        
        # 按相似度排序並返回top_k
        similarities.sort(key=lambda x: x['similarity'], reverse=True)
        results = similarities[:top_k]
        
        print(f"找到 {len(results)} 個相似文檔 (閾值: {similarity_threshold})")
        for i, result in enumerate(results[:10], 1):
            print(f"  {i}. {result['document']['filename']} (相似度: {result['similarity']:.4f})")
        
        return results
    
    def get_document_summary(self, filename: str) -> Optional[str]:
        """
        根據文件名獲取文檔摘要
        
        參數:
            filename: 文檔文件名
            
        返回:
            文檔摘要或None
        """
        # 在summaries目錄中搜索對應的摘要
        for root, _, files in os.walk(self.summaries_path):
            for file in files:
                if file.endswith('_summary.json'):
                    try:
                        file_path = os.path.join(root, file)
                        with open(file_path, 'r', encoding='utf-8') as f:
                            summary_data = json.load(f)
                        
                        if summary_data.get('filename') == filename:
                            return summary_data.get('summary', '')
                    except Exception as e:
                        print(f"讀取摘要文件失敗 {file}: {str(e)}")
        
        return None
    
    def get_document_content(self, filename: str) -> Optional[Dict]:
        """
        根據文件名獲取文檔完整內容和路徑
        
        參數:
            filename: 文檔文件名
            
        返回:
            包含 original_content 和 original_path 的字典，或None
        """
        # 在summaries目錄中搜索對應的摘要文件
        for root, _, files in os.walk(self.summaries_path):
            for file in files:
                if file.endswith('_summary.json'):
                    try:
                        file_path = os.path.join(root, file)
                        with open(file_path, 'r', encoding='utf-8') as f:
                            summary_data = json.load(f)
                        
                        if summary_data.get('filename') == filename:
                            return {
                                'original_content': summary_data.get('original_content', ''),
                                'original_path': summary_data.get('original_path', ''),
                                'source_link': summary_data.get('source_link', ''),
                                'download_link': summary_data.get('download_link', ''),
                                'doc_type': summary_data.get('doc_type', '')
                            }
                    except Exception as e:
                        print(f"讀取文檔內容失敗 {file}: {str(e)}")
        
        return None
    
    def refresh_cache(self):
        """
        清除緩存，強制重新加載數據
        """
        self._embeddings_cache = None
        self._documents_cache = None
        print("向量緩存已清除")
    
    def preload_all_caches(self):
        """
        預先載入所有緩存
        """
        print("預先載入緩存...")
        self.load_embeddings()
        print("緩存載入完成")
    
    def get_stats(self) -> Dict:
        """
        獲取向量存儲統計信息
        
        返回:
            統計信息字典
        """
        embeddings, documents = self.load_embeddings()
        
        if not embeddings:
            return {
                'total_documents': 0,
                'embedding_dimension': 0,
                'storage_path': self.embeddings_path
            }
        
        return {
            'total_documents': len(embeddings),
            'embedding_dimension': len(embeddings[0]) if embeddings else 0,
            'storage_path': self.embeddings_path
        }
