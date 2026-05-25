#!/usr/bin/env python3
"""
RAG引擎 - 整合檢索和生成（Web Backend版本）
"""

import logging
import re
from typing import List, Dict
from app.services.llm.litellm_client import LiteLLMClient
from app.services.llm.prompts.rag import RAG_USER_TEMPLATE, RAG_NO_RESULTS_PROMPT, build_rag_system_prompt
from app.config import settings
from .vector_store import VectorStore

logger = logging.getLogger(__name__)


class RAGEngine:
    """
    檢索增強生成引擎
    """
    
    def __init__(self, 
                 base_path="uploads/1/processed",
                 similarity_threshold=0.1,
                 max_context_docs=3,
                 debug_mode=False):
        """
        初始化RAG引擎
        
        參數:
            base_path: 處理後文件的基礎路徑
            similarity_threshold: 相似度閾值
            max_context_docs: 用於上下文的最大文檔數
            debug_mode: 是否輸出 debug log
        """
        # 使用 LiteLLM Client（支持多主機負載均衡）
        self.client = LiteLLMClient()
        self.vector_store = VectorStore(base_path=base_path)
        self.similarity_threshold = similarity_threshold
        self.max_context_docs = max_context_docs
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
                    'all_chunks': [doc]
                }
            else:
                file_to_docs[filename]['all_chunks'].append(doc)
        
        return list(file_to_docs.values())
    
    async def query(self, question: str, 
              top_k: int = 250, 
              include_similarity_scores: bool = False,
              allowed_filenames: set = None,
              assistant_name: str = None,
              assistant_style: str = None,
              include_citations: bool = True) -> Dict:
        """
        異步執行RAG查詢
        
        參數:
            question: 用戶問題
            top_k: 檢索文檔數量
            include_similarity_scores: 是否在結果中包含相似度分數
            allowed_filenames: 允許的檔案名稱集合，None 表示不過濾
            
        返回:
            查詢結果字典
        """
        logger.info("\n=== RAG查詢 ===")
        logger.info(f"問題: {question}")
        if allowed_filenames:
            logger.info(f"分類過濾: 限制在 {len(allowed_filenames)} 個檔案內")
        
        # 1. 檢索相關文檔（異步）
        similar_docs = await self.vector_store.search_similar(
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
        
        # 2. 直接使用向量相似度排序的結果構建上下文
        logger.info(f"\n=== 相似度結果 (Top {min(3, len(similar_docs))}) ===")
        for i, doc in enumerate(similar_docs[:3], 1):
            filename = doc['document'].get('original_filename') or doc['document']['filename']
            logger.info(f"  {i}. {filename} (Similarity: {doc['similarity']:.4f})")

        top_docs = similar_docs[:self.max_context_docs]
        
        # 2.5 去重合併相同檔案的多個 chunks
        deduplicated_docs = self._deduplicate_docs_by_file(top_docs)
        
        # 3. 生成詳細回答
        context = self._build_context(deduplicated_docs)
        system_prompt = build_rag_system_prompt(
            assistant_name=assistant_name,
            assistant_style=assistant_style,
            include_citations=include_citations,
        )
        user_prompt = RAG_USER_TEMPLATE.format(query=question, context=context)
        
        if self.debug_mode:
            logger.info(f"\n[DEBUG] System Prompt:")
            logger.info(system_prompt)
            logger.info(f"\n[DEBUG] User Prompt:")
            logger.info(user_prompt)
            logger.info("-" * 80)
        
        # 異步調用 LLM
        response = await self.client.generate(system=system_prompt, user=user_prompt)
        
        if self.debug_mode:
            logger.info(f"\n[DEBUG] 模型原始輸出:")
            logger.info(response)
            logger.info("=" * 80)
        
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
            sources.append(source)
        
        result = {
            'question': question,
            'answer': response,
            'sources': sources,
            'retrieved_docs': len(similar_docs),
            'used_for_answer': len(top_docs)
        }
        
        # 顯示結果
        logger.info(f"\n=== 回答結果 ===")
        logger.info(f"檢索 {len(similar_docs)} 個文檔，使用 Top {len(top_docs)} 生成回答")
        logger.info(f"\n來源文檔:")
        for i, source in enumerate(sources, 1):
            if include_similarity_scores:
                logger.info(f"  {i}. {source['filename']} (相似度: {source['similarity']:.4f})")
            else:
                logger.info(f"  {i}. {source['filename']}")
        
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
            source_link = ''
            
            for chunk in all_chunks:
                chunk_filename = chunk['document']['filename']
                doc_content = self.vector_store.get_document_content(chunk_filename)
                if doc_content:
                    if not source_link:
                        source_link = doc_content.get('source_link', '') or doc_content.get('download_link', '')
                    if doc_content.get('original_content'):
                        content = doc_content['original_content']
                        # 還原 MarkItDown 對 URL 底線的跳脫（\_ → _）
                        content = re.sub(r'https?://\S+', lambda m: m.group(0).replace('\\_', '_'), content)
                        combined_content.append(content)
            
            # 合併所有 chunks 的內容
            full_content = "\n\n".join(combined_content) if combined_content else ""
            link_text = f"\n來源連結：{source_link}" if source_link else ""
            context_parts.append(f"文檔{i}（{original_filename}）：{link_text}\n{full_content}\n")
        
        return "\n".join(context_parts)
    
    def get_system_stats(self) -> Dict:
        """
        獲取系統統計信息
        
        返回:
            系統統計字典
        """
        vector_stats = self.vector_store.get_stats()
        
        return {
            'model': settings.OLLAMA_RAG_MODEL,
            'similarity_threshold': self.similarity_threshold,
            'max_context_docs': self.max_context_docs,
            'vector_store_stats': vector_stats,
            'load_balancing': self.client.get_load_balancing_stats()
        }
