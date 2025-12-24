#!/usr/bin/env python3
"""
RAG引擎 - 整合檢索和生成（Web Backend版本）
"""

import os
from typing import List, Dict, Optional
from app.services.llm.ollama_client import OllamaClient
from app.services.llm.prompts.rag import RAG_ANSWER_PROMPT, RAG_NO_RESULTS_PROMPT
from app.config import settings
from .vector_store import VectorStore
from .reranker import Reranker


class RAGEngine:
    """
    檢索增強生成引擎
    """
    
    def __init__(self, 
                 base_path="uploads/1/processed",
                 base_url: str = None,
                 model: str = None,
                 similarity_threshold=0.1,
                 max_context_docs=3,
                 debug_mode=False):
        """
        初始化RAG引擎
        
        參數:
            base_path: 處理後文件的基礎路徑
            base_url: Ollama伺服器地址
            model: 用於生成回答的模型
            similarity_threshold: 相似度閾值
            max_context_docs: 用於上下文的最大文檔數
            debug_mode: 是否輸出 debug log
        """
        # 使用 config 的預設值
        base_url = base_url or settings.OLLAMA_BASE_URL
        model = model or settings.OLLAMA_RAG_MODEL
        
        self.client = OllamaClient(base_url=base_url, model=model)
        self.vector_store = VectorStore(base_path=base_path)
        self.similarity_threshold = similarity_threshold
        self.max_context_docs = max_context_docs
        self.reranker = Reranker()
        self.debug_mode = debug_mode
        
    def _deduplicate_docs_by_file(self, top_docs: List[Dict]) -> List[Dict]:
        """按檔案去重，合併相同檔案的多個chunks"""
        from collections import OrderedDict
        
        file_to_docs = OrderedDict()
        
        for doc in top_docs:
            filename = doc['document'].get('original_filename') or doc['document']['filename']
            
            if filename not in file_to_docs:
                file_to_docs[filename] = {
                    'document': doc['document'],
                    'similarity': doc['similarity'],
                    'score': doc['score'],
                    'all_chunks': [doc]
                }
            else:
                file_to_docs[filename]['all_chunks'].append(doc)
        
        return list(file_to_docs.values())
    
    def query(self, question: str, 
              top_k: int = 250, 
              include_similarity_scores: bool = False,
              allowed_filenames: set = None) -> Dict:
        """
        執行RAG查詢
        
        參數:
            question: 用戶問題
            top_k: 檢索文檔數量
            include_similarity_scores: 是否在結果中包含相似度分數
            allowed_filenames: 允許的檔案名稱集合，None 表示不過濾
            
        返回:
            查詢結果字典
        """
        print(f"\n=== RAG查詢 ===")
        print(f"問題: {question}")
        if allowed_filenames:
            print(f"分類過濾: 限制在 {len(allowed_filenames)} 個檔案內")
        
        # 1. 檢索相關文檔
        similar_docs = self.vector_store.search_similar(
            query_text=question,
            top_k=top_k,
            similarity_threshold=self.similarity_threshold,
            allowed_filenames=allowed_filenames
        )
        
        if not similar_docs:
            # 沒有找到相關文檔
            return {
                'question': question,
                'answer': RAG_NO_RESULTS_PROMPT,
                'sources': [],
                'retrieved_docs': 0
            }
        
        # 準備候選文檔並進行 rerank
        candidates = [{
            'document': doc['document'],
            'similarity': doc['similarity'],
            'summary': self.vector_store.get_document_summary(doc['document']['filename']) or ''
        } for doc in similar_docs]
        reranked_docs = self.reranker.rerank(question, candidates)
        
        # 顯示 Rerank 後的 Top 3
        print(f"\n=== Rerank 結果 (Top {min(3, len(reranked_docs))}) ===")
        for i, doc in enumerate(reranked_docs[:3], 1):
            filename = doc['document'].get('original_filename') or doc['document']['filename']
            print(f"  {i}. {filename} (Similarity: {doc['similarity']:.4f}, Rerank Score: {doc['score']:.4f})")
        
        # 2. 使用 top N 文檔構建上下文
        top_docs = reranked_docs[:self.max_context_docs]
        
        # 2.5 去重合併相同檔案的多個 chunks
        deduplicated_docs = self._deduplicate_docs_by_file(top_docs)
        
        # 3. 生成詳細回答
        context = self._build_context(deduplicated_docs)
        prompt = RAG_ANSWER_PROMPT.format(query=question, context=context)
        
        if self.debug_mode:
            print(f"\n[DEBUG] 模型輸入 Prompt:")
            print(prompt)
            print("-" * 80)
        
        response = self.client.generate(prompt)
        
        if self.debug_mode:
            print(f"\n[DEBUG] 模型原始輸出:")
            print(response)
            print("=" * 80)
        
        # 4. 整理結果（使用去重後的文檔）
        sources = []
        for doc_result in deduplicated_docs:
            doc_info = doc_result['document']
            filename = doc_info['filename']
            original_filename = doc_info.get('original_filename', filename)  # ✅ 優先使用 original_filename
            
            # 動態載入路徑資訊
            doc_content = self.vector_store.get_document_content(filename)
            original_path = doc_content['original_path'] if doc_content else ''
            source_link = doc_content['source_link'] if doc_content else ''
            download_link = doc_content['download_link'] if doc_content else ''
            
            source = {
                'filename': original_filename,  # ✅ 使用原始檔名
                'original_path': original_path,
                'source_link': source_link,
                'download_link': download_link
            }
            if include_similarity_scores:
                source['similarity'] = doc_result['similarity']
                source['score'] = doc_result['score']
            sources.append(source)
        
        result = {
            'question': question,
            'answer': response,
            'sources': sources,
            'retrieved_docs': len(similar_docs),
            'used_for_answer': len(top_docs)
        }
        
        # 顯示結果
        print(f"\n=== 回答結果 ===")
        print(f"檢索 {len(similar_docs)} 個文檔，使用 Top {len(top_docs)} 生成回答")
        print(f"\n來源文檔:")
        for i, source in enumerate(sources, 1):
            if include_similarity_scores:
                print(f"  {i}. {source['filename']} (相似度: {source['similarity']:.4f}, Rerank: {source['score']:.4f})")
            else:
                print(f"  {i}. {source['filename']}")
        
        return result
    
    def _build_context(self, deduplicated_docs):
        """建立上下文字串（合併相同檔案的所有 chunks）"""
        context_parts = []
        for i, doc_group in enumerate(deduplicated_docs, 1):
            document = doc_group['document']
            filename = document['filename']
            original_filename = document.get('original_filename', filename)
            
            # 收集所有相關 chunks 的內容並合併
            all_chunks = doc_group.get('all_chunks', [])
            combined_content = []
            
            for chunk in all_chunks:
                chunk_filename = chunk['document']['filename']
                doc_content = self.vector_store.get_document_content(chunk_filename)
                if doc_content and doc_content.get('original_content'):
                    combined_content.append(doc_content['original_content'])
            
            # 合併所有 chunks 的內容
            full_content = "\n\n".join(combined_content) if combined_content else ""
            context_parts.append(f"文檔{i}（{original_filename}）：\n{full_content}\n")
        
        return "\n".join(context_parts)
    
    def get_system_stats(self) -> Dict:
        """
        獲取系統統計信息
        
        返回:
            系統統計字典
        """
        vector_stats = self.vector_store.get_stats()
        
        return {
            'model': self.client.model,
            'similarity_threshold': self.similarity_threshold,
            'max_context_docs': self.max_context_docs,
            'vector_store_stats': vector_stats
        }
