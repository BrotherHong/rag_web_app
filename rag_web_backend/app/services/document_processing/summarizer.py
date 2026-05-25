"""
文檔摘要處理器 - 基於main/utils/summarizer.py的邏輯
"""

import json
import re
from pathlib import Path
from typing import Optional, List, Tuple
from app.services.llm.litellm_client import LiteLLMClient
from app.services.llm.prompts import (
    RAG_DOCUMENT_SUMMARY,
    DOCUMENT_CLASSIFICATION,
    FORM_DOCUMENT_SUMMARY
)


class SummaryProcessor:
    """
    處理文檔以生成摘要 - 與main版本保持一致
    """
    
    def __init__(self, litellm_client: Optional[LiteLLMClient] = None):
        """
        初始化摘要處理器
        
        參數:
            litellm_client: LiteLLMClient 實例
        """
        self.client = litellm_client or LiteLLMClient()
    
    async def process_markdown_file(
        self,
        md_file_path: Path,
        output_json_path: Path
    ) -> bool:
        """
        處理單一 markdown 檔案生成摘要
        
        參數:
            md_file_path: Markdown 檔案路徑
            output_json_path: 輸出 JSON 路徑
            
        返回:
            bool: 是否成功
        """
        try:
            # 讀取檔案內容
            with open(md_file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            if not content.strip():
                print(f"⚠️ 檔案內容為空: {md_file_path.name}")
                return False
            
            filename = md_file_path.name
            
            # 生成摘要 (使用與main一致的邏輯)
            summary, doc_type, chunk_content = await self._generate_summary(
                content, filename, output_dir=output_json_path.parent
            )
            
            if not summary or summary.startswith('錯誤:'):
                print(f"❌ 摘要生成失敗: {summary}")
                return False
            
            # 建立主摘要資料
            summary_data = {
                'filename': filename,
                'summary': summary,
                'summary_length': len(summary),
                'doc_type': doc_type,
                'original_content': chunk_content
            }
            
            # 儲存為 JSON
            output_json_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_json_path, 'w', encoding='utf-8') as f:
                json.dump(summary_data, f, ensure_ascii=False, indent=2)
            
            print(f"✅ 摘要生成成功 ({len(summary)} 字)")
            return True
            
        except Exception as e:
            print(f"❌ 處理失敗: {e}")
            return False
    
    async def _generate_summary(
        self, 
        content: str, 
        filename: str = "", 
        output_dir: Path = None
    ) -> Tuple[str, str, str]:
        """
        使用 Ollama 生成摘要 - 與main版本完全一致
        
        參數:
            content: 文檔內容
            filename: 文檔文件名
            output_dir: 輸出目錄（用於保存分塊摘要）
            
        返回:
            (生成的摘要, 文檔類型, chunk內容) tuple
        """
        # 去除 HTML 標籤，只保留文字（避免標籤佔用 chunk 空間且干擾 LLM）
        content = re.sub(r'<[^>]+>', ' ', content)
        content = re.sub(r'\s{2,}', ' ', content).strip()

        # 先判斷文檔類型
        doc_type = await self._classify_document(content)
        print(f"  文檔分類: {doc_type}")
        
        if doc_type == "Form Mode":
            # 表單類文檔
            if len(content) > 1500:
                # 長表單：使用分塊處理
                return await self._generate_chunked_summary(
                    content, filename, output_dir, doc_type="Form Mode"
                )
            else:
                # 短表單：直接生成簡化摘要
                prompt = FORM_DOCUMENT_SUMMARY.format(text=content, filename=filename)
                response = await self.client.generate(prompt)
                summary = self._extract_final_summary(response)

                # 放寬字數限制至 400 字
                if len(summary) > 400:
                    print(f"  警告: Form Mode 摘要較長 ({len(summary)}字)")
                
                return (summary, doc_type, content)
        else:
            # 資訊類文檔使用詳細摘要
            if len(content) > 1500:
                # 返回 (摘要, 類型, 第一塊內容)
                return await self._generate_chunked_summary(
                    content, filename, output_dir, doc_type="Info Mode"
                )
            else:
                prompt = RAG_DOCUMENT_SUMMARY.format(filename=filename, text=content)
                response = await self.client.generate(prompt)
                summary = self._extract_final_summary(response)
                return (summary, doc_type, content)
    
    async def _classify_document(self, content: str) -> str:
        """
        分類文檔類型
        
        參數:
            content: 文檔內容
            
        返回:
            "Form Mode" 或 "Info Mode"
        """
        # 取前2000字進行分類判斷
        classification_content = content[:2000]
        prompt = DOCUMENT_CLASSIFICATION.format(text=classification_content)
        response = (await self.client.generate(prompt)).strip()
        
        # 清理思考標籤，只取最終答案
        clean_response = self._extract_final_summary(response)
        print(f"  分類回應: {clean_response}")
        
        # 確保回應格式正確
        if "Form Mode" in clean_response:
            return "Form Mode"
        elif "Info Mode" in clean_response:
            return "Info Mode"
        else:
            # 默認為資訊模式
            print(f"⚠️ 無法確定文檔類型，預設為 Info Mode")
            return "Info Mode"
    
    async def _generate_chunked_summary(
        self, 
        content: str, 
        filename: str, 
        output_dir: Path,
        doc_type: str = "Info Mode"
    ) -> Tuple[str, str, str]:
        """
        為長文檔生成分塊摘要 - 與main版本完全一致
        
        參數:
            content: 文檔內容
            filename: 文檔文件名
            output_dir: 輸出目錄
            doc_type: 文檔類型（"Info Mode" 或 "Form Mode"）
            
        返回:
            (總體摘要或第一塊摘要, 文檔類型, 第一塊內容) tuple
        """
        print(f"  文檔長度超過1500字，開始分塊處理...")
        
        # 使用與main一致的分塊參數
        chunks = self._split_content(content, chunk_size=950, overlap=150)
        print(f"  分為 {len(chunks)} 個塊 (chunk_size=950, overlap=150)")
        
        # 根據文檔類型選擇 prompt
        if doc_type == "Form Mode":
            prompt_template = FORM_DOCUMENT_SUMMARY
        else:
            prompt_template = RAG_DOCUMENT_SUMMARY
        
        summaries = []
        for i, chunk in enumerate(chunks, 1):
            print(f"  處理第 {i}/{len(chunks)} 塊...")
            
            if doc_type == "Form Mode":
                prompt = prompt_template.format(text=chunk, filename=filename)
            else:
                prompt = prompt_template.format(filename=filename, text=chunk)
            
            response = await self.client.generate(prompt)
            chunk_summary = self._extract_final_summary(response)
            summaries.append(chunk_summary)
            
            # 保存每個塊的摘要為獨立文件 (從第2塊開始)
            if i > 1 and output_dir:
                chunk_filename = filename.replace('.md', f'_part{i}.md')
                chunk_summary_file = output_dir / f"{Path(filename).stem}_part{i}_summary.json"
                
                chunk_summary_data = {
                    'filename': chunk_filename,
                    'summary': chunk_summary,
                    'summary_length': len(chunk_summary),
                    'doc_type': doc_type,
                    'chunk_info': f"第 {i} 塊，共 {len(chunks)} 塊",
                    'original_content': chunk
                }
                
                try:
                    with open(chunk_summary_file, 'w', encoding='utf-8') as f:
                        json.dump(chunk_summary_data, f, ensure_ascii=False, indent=2)
                    print(f"  ✅ 已保存第 {i} 塊摘要: {chunk_summary_file.name}")
                except Exception as e:
                    print(f"  ⚠️ 保存第 {i} 塊摘要失敗: {e}")
        
        # 在第一塊摘要中添加分塊信息
        first_summary_with_info = summaries[0]
        if len(chunks) > 1:
            print(f"  📄 長文檔分為 {len(chunks)} 個塊，已生成所有分塊摘要")
        
        # 返回第一塊的摘要、文檔類型和第一塊內容
        return (first_summary_with_info, doc_type, chunks[0])
    
    def _split_content(self, content: str, chunk_size: int = 950, overlap: int = 150) -> List[str]:
        """
        將內容分塊，保持重疊 - 與main版本完全一致
        
        參數:
            content: 要分塊的內容
            chunk_size: 每塊大小 (默認950，與main一致)
            overlap: 重疊字數 (默認150，與main一致)
            
        返回:
            分塊後的內容列表
        """
        if len(content) <= chunk_size:
            return [content]
        
        chunks = []
        start = 0
        
        while start < len(content):
            end = start + chunk_size
            
            if end >= len(content):
                # 最後一塊
                chunks.append(content[start:])
                break
            
            # 尋找適當的分割點（優先在段落或句子結尾）
            chunk_text = content[start:end]
            
            # 向前尋找段落分割點
            last_paragraph = chunk_text.rfind('\n\n')
            last_sentence = chunk_text.rfind('。')
            
            if last_paragraph > chunk_size - 200:  # 如果段落分割點不太遠
                actual_end = start + last_paragraph + 2
            elif last_sentence > chunk_size - 100:  # 如果句子分割點不太遠
                actual_end = start + last_sentence + 1
            else:
                actual_end = end
            
            chunks.append(content[start:actual_end])
            start = actual_end - overlap  # 保持重疊
        
        return chunks
    
    def _extract_final_summary(self, response: str) -> str:
        """
        從回應中提取最終摘要，若存在則移除思考標籤 - 與main版本完全一致
        
        參數:
            response: 模型的原始回應
            
        返回:
            乾淨的摘要內容
        """
        if not response:
            return response
        
        # 檢查回應是否包含思考標籤
        if '</think>' in response:
            # 找到最後一個思考標籤的結尾
            think_end = response.rfind('</think>')
            if think_end != -1:
                # 提取思考標籤後的內容
                summary = response[think_end + 8:].strip()
                return summary if summary else response
        
        return response

