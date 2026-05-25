"""
檔案處理服務 - 處理上傳檔案的完整流程
"""

import asyncio
import os
import shutil
from pathlib import Path
from typing import Dict, List
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import File, FileStatus
from app.services.file_storage import file_storage
from app.services.document_processing import (
    DocumentConverter,
    SummaryProcessor,
    EmbeddingProcessor
)
from app.services.llm.litellm_client import LiteLLMClient


class FileProcessingService:
    """檔案處理服務 - 負責完整的處理流程"""
    
    def __init__(self):
        self.converter = DocumentConverter()
        self.litellm_client = LiteLLMClient()
        self.summarizer = SummaryProcessor(self.litellm_client)
        self.embedder = EmbeddingProcessor(self.litellm_client)
        self.last_temp_dir = None  # 保存最近一次的暫存目錄路徑

    async def _report_progress(self, progress_callback, file_id: int, step: str, progress: int, message: str = None):
        """統一進度回報入口，避免 callback 異常中斷主流程"""
        if not progress_callback:
            return
        try:
            await progress_callback(file_id, step, progress, message)
        except Exception as e:
            print(f"⚠️ 進度回報失敗: {e}")
    
    async def process_files_batch(
        self,
        file_ids: List[int],
        task_id: str,
        db: AsyncSession,
        progress_callback = None,
        delete_record_on_failure: bool = True,
    ) -> Dict:
        """
        批次處理檔案
        
        參數:
            file_ids: 檔案 ID 列表
            task_id: 任務 ID（用於更新前端進度）
            db: 資料庫 session
            progress_callback: 進度回呼函數
            
        返回:
            處理結果統計
        """
        results = {
            'total': len(file_ids),
            'success': 0,
            'failed': 0,
            'errors': [],
            'file_results': []  # 新增：每個檔案的詳細結果
        }
        
        for idx, file_id in enumerate(file_ids):
            file_result = {
                'file_id': file_id,
                'filename': None,
                'success': False,
                'error': None
            }
            
            try:
                # 獲取檔案記錄
                file_record = await db.get(File, file_id)
                if not file_record:
                    results['failed'] += 1
                    error_msg = f"檔案 ID {file_id} 不存在"
                    results['errors'].append(error_msg)
                    file_result['error'] = error_msg
                    results['file_results'].append(file_result)
                    continue
                
                file_result['filename'] = file_record.original_filename
                
                # 更新狀態為處理中
                file_record.status = FileStatus.PROCESSING
                file_record.processing_step = "classify"
                file_record.processing_progress = 0
                await db.commit()
                await self._report_progress(progress_callback, file_record.id, "classify", 0)
                
                # 執行四階段處理
                success = await self._process_single_file(
                    file_record,
                    db,
                    progress_callback,
                    delete_record_on_failure=delete_record_on_failure,
                )
                
                if success:
                    file_record.status = FileStatus.COMPLETED
                    file_record.processing_step = "completed"
                    file_record.processing_progress = 100
                    results['success'] += 1
                    file_result['success'] = True
                    await db.commit()
                else:
                    if not delete_record_on_failure:
                        file_record.status = FileStatus.FAILED
                        file_record.processing_step = "failed"
                        await db.commit()

                    # delete_record_on_failure=True 時，_process_single_file 會清理檔案和資料庫記錄
                    results['failed'] += 1
                    error_msg = f"檔案處理失敗已被清除"
                    results['errors'].append(error_msg)
                    file_result['error'] = error_msg
                
                results['file_results'].append(file_result)
                
            except Exception as e:
                results['failed'] += 1
                error_msg = f"{str(e)}"
                results['errors'].append(error_msg)
                file_result['error'] = error_msg
                results['file_results'].append(file_result)
                
                # 異常發生時，執行完整清理
                try:
                    file_record = await db.get(File, file_id)
                    if file_record:
                        file_result['filename'] = file_record.original_filename
                        print(f"\n❌ 發生異常，開始清理檔案 ID {file_id}: {file_record.original_filename}")
                        
                        # 刪除 unprocessed 中的實體檔案
                        if file_record.file_path and os.path.exists(file_record.file_path):
                            try:
                                os.remove(file_record.file_path)
                                print(f"   ✅ 已刪除原始檔案: {file_record.file_path}")
                            except Exception as del_error:
                                print(f"   ⚠️ 刪除檔案時出錯: {del_error}")
                        
                        # 刪除資料庫記錄
                        await db.delete(file_record)
                        await db.commit()
                        print(f"   ✅ 已刪除資料庫記錄 ID {file_id}")
                except Exception as cleanup_error:
                    print(f"   ⚠️ 清理失敗檔案時出錯: {cleanup_error}")
                    await db.rollback()
        
        return results
    
    async def _process_single_file(
        self,
        file_record: File,
        db: AsyncSession,
        progress_callback = None,
        delete_record_on_failure: bool = True,
    ) -> bool:
        """
        處理單一檔案的四階段流程
        使用暫存資料夾，全部成功才移動到正確位置
        
        返回:
            bool: 是否成功
        """
        import tempfile
        temp_dir = None
        
        try:
            file_path = Path(file_record.file_path)
            department_id = file_record.department_id

            # 創建新的暫存目錄
            temp_dir = Path(tempfile.mkdtemp(prefix="rag_process_"))
            print(f"\n🗂️ 使用暫存目錄: {temp_dir}")
            print(f"💡 任務完成後會清理此暫存目錄")
            
            # 階段 1: 準備處理 (0-25%)
            print(f"\n📂 階段 1: 準備處理 - {file_record.original_filename}")
            file_record.processing_step = "classify"
            file_record.processing_progress = 10
            await db.commit()
            await self._report_progress(progress_callback, file_record.id, "classify", 10)
            
            # 複製檔案到暫存目錄（不移動原檔案）
            temp_data_file = temp_dir / "data" / file_path.name
            temp_data_file.parent.mkdir(parents=True, exist_ok=True)
            await asyncio.to_thread(shutil.copy2, str(file_path), str(temp_data_file))
            
            file_record.processing_progress = 25
            await db.commit()
            await self._report_progress(progress_callback, file_record.id, "prepare", 25)
            
            # 階段 2: 轉換為 Markdown (25-50%)
            print(f"\n📝 階段 2: 轉換為 Markdown")
            file_record.processing_step = "convert"
            file_record.processing_progress = 30
            await db.commit()
            await self._report_progress(progress_callback, file_record.id, "convert", 30)
            
            # 生成 Markdown 檔名：使用資料庫中的 filename（已清理特殊字元）
            # 例如：QA.pdf → QA.md
            md_filename = f"{Path(file_record.filename).stem}.md"
            temp_md_path = temp_dir / "output_md" / md_filename
            temp_md_path.parent.mkdir(parents=True, exist_ok=True)
            
            success = await asyncio.to_thread(
                self.converter.convert_to_markdown,
                temp_data_file,
                temp_md_path,
                use_mineru_for_pdf=True
            )
            
            if not success:
                file_record.error_message = "Markdown 轉換失敗"
                raise Exception("Markdown 轉換失敗")
            
            file_record.processing_progress = 50
            await db.commit()
            await self._report_progress(progress_callback, file_record.id, "convert", 50)
            
            # 階段 3: 生成摘要 (50-75%)
            print(f"\n💡 階段 3: 生成摘要")
            file_record.processing_step = "summarize"
            file_record.processing_progress = 55
            await db.commit()
            await self._report_progress(progress_callback, file_record.id, "summarize", 55)
            
            temp_summary_path = temp_dir / "summaries" / f"{file_path.stem}_summary.json"
            temp_summary_path.parent.mkdir(parents=True, exist_ok=True)
            
            # 使用新的summarizer，會自動處理長文檔分塊
            success = await self.summarizer.process_markdown_file(
                temp_md_path,
                temp_summary_path
            )
            
            if not success:
                file_record.error_message = "摘要生成失敗"
                raise Exception("摘要生成失敗")
            
            file_record.processing_progress = 75
            await db.commit()
            await self._report_progress(progress_callback, file_record.id, "summarize", 75)
            
            # 階段 4: 生成嵌入 (75-100%)
            print(f"\n🔢 階段 4: 生成向量嵌入")
            file_record.processing_step = "embed"
            file_record.processing_progress = 80
            await db.commit()
            await self._report_progress(progress_callback, file_record.id, "embed", 80)
            
            # 處理主摘要的嵌入
            temp_embedding_path = temp_dir / "embeddings" / f"{file_path.stem}_embedding.json"
            temp_embedding_path.parent.mkdir(parents=True, exist_ok=True)
            
            success = await self.embedder.process_summary_file(
                temp_summary_path,
                temp_embedding_path,
                file_record.original_filename  # ✅ 傳入原始檔名
            )
            
            if not success:
                file_record.error_message = "嵌入生成失敗"
                raise Exception("嵌入生成失敗")
            
            # 檢查並處理分塊摘要的嵌入
            additional_embedding_files = []
            summary_dir = temp_summary_path.parent
            base_name = file_path.stem
            
            # 動態尋找所有分塊摘要檔案
            i = 2
            while True:
                part_summary_file = summary_dir / f"{base_name}_part{i}_summary.json"
                if not part_summary_file.exists():
                    break  # 沒有更多分塊
                    
                part_embedding_file = temp_dir / "embeddings" / f"{base_name}_part{i}_embedding.json"
                
                success = await self.embedder.process_summary_file(
                    part_summary_file,
                    part_embedding_file,
                    file_record.original_filename  # ✅ 傳入原始檔名
                )
                
                if success:
                    additional_embedding_files.append(part_embedding_file)
                    print(f"      ✅ 分塊 {i} 嵌入完成")
                    
                i += 1
            
            if additional_embedding_files:
                print(f"    🔢 處理了 {len(additional_embedding_files)} 個分塊的嵌入")
            
            file_record.processing_progress = 90
            await db.commit()
            await self._report_progress(progress_callback, file_record.id, "embed", 90)
            
            # 所有階段成功，移動檔案到正確位置
            print(f"\n📦 移動檔案到正確位置...")
            
            # 移動到 processed/data
            final_data_path = file_storage._get_processed_path(department_id, "data") / file_path.name
            await asyncio.to_thread(shutil.move, str(temp_data_file), str(final_data_path))
            
            # 移動 markdown
            final_md_path = file_storage._get_processed_path(department_id, "output_md") / temp_md_path.name
            await asyncio.to_thread(shutil.move, str(temp_md_path), str(final_md_path))
            
            # 移動主摘要
            final_summary_path = file_storage._get_processed_path(department_id, "summaries") / temp_summary_path.name
            await asyncio.to_thread(shutil.move, str(temp_summary_path), str(final_summary_path))
            
            # 移動分塊摘要檔案
            additional_summary_files = []
            summary_dir = temp_summary_path.parent
            base_name = file_path.stem
            
            i = 2
            while True:
                part_summary_file = summary_dir / f"{base_name}_part{i}_summary.json"
                if not part_summary_file.exists():
                    break
                    
                final_part_summary = file_storage._get_processed_path(department_id, "summaries") / part_summary_file.name
                await asyncio.to_thread(shutil.move, str(part_summary_file), str(final_part_summary))
                additional_summary_files.append(final_part_summary)
                print(f"    📄 移動分塊摘要: {part_summary_file.name}")
                i += 1
            
            # 移動主嵌入
            final_embedding_path = file_storage._get_processed_path(department_id, "embeddings") / temp_embedding_path.name
            await asyncio.to_thread(shutil.move, str(temp_embedding_path), str(final_embedding_path))
            
            # 移動分塊嵌入檔案
            moved_embedding_count = 0
            for embedding_file in additional_embedding_files:
                if embedding_file.exists():
                    final_part_embedding = file_storage._get_processed_path(department_id, "embeddings") / embedding_file.name
                    await asyncio.to_thread(shutil.move, str(embedding_file), str(final_part_embedding))
                    moved_embedding_count += 1
                    print(f"    🔢 移動分塊嵌入: {embedding_file.name}")
            
            # 計算總的chunk和vector數量
            total_chunks = 1 + len(additional_summary_files)
            total_vectors = 1 + moved_embedding_count
            
            # 更新資料庫記錄
            file_record.file_path = str(final_data_path)
            file_record.markdown_path = str(final_md_path)
            file_record.summary_path = str(final_summary_path)
            file_record.embedding_path = str(final_embedding_path)
            file_record.is_vectorized = True
            file_record.chunk_count = total_chunks
            file_record.vector_count = total_vectors
            file_record.processing_progress = 100
            await db.commit()
            await self._report_progress(progress_callback, file_record.id, "finalize", 100)
            
            print(f"✅ 檔案處理完成: {file_record.original_filename}")
            if total_chunks > 1:
                print(f"    📄 生成了 {total_chunks} 個分塊摘要和 {total_vectors} 個向量嵌入")

            # 清除對應處室的 embedding cache，讓下次查詢重新載入新檔案
            try:
                from app.api.rag import _dept_rag_engines
                engine = _dept_rag_engines.get(file_record.department_id)
                if engine:
                    engine.vector_store.refresh_cache()
                    print(f"🔄 已清除 dept {file_record.department_id} 的 embedding cache")
            except Exception as e:
                print(f"⚠️ 清除 embedding cache 失敗: {e}")
            
            # 刪除 unprocessed 中的原始檔案
            if file_path.exists() and 'unprocessed' in str(file_path):
                try:
                    file_path.unlink()
                    print(f"🗑️ 已刪除原始檔案: {file_path}")
                except Exception as e:
                    print(f"⚠️ 刪除原始檔案失敗: {e}")
            
            # 任務成功後清理自己的暫存目錄
            if temp_dir.exists():
                try:
                    shutil.rmtree(temp_dir)
                except Exception as cleanup_error:
                    print(f"⚠️ 清理暫存目錄失敗: {cleanup_error}")

            await self._report_progress(progress_callback, file_record.id, "completed", 100)
            
            return True
            
        except Exception as e:
            print(f"\n❌ 處理失敗: {e}")
            file_record.error_message = str(e)
            
            # 失敗時完整清理：暫存目錄 + unprocessed檔案 + 資料庫記錄
            print(f"🗑️ 開始清理失敗的檔案...")
            
            # 1. 清理暫存目錄
            if temp_dir and temp_dir.exists():
                try:
                    shutil.rmtree(temp_dir)
                    print(f"   ✅ 已清理暫存目錄")
                except Exception as cleanup_error:
                    print(f"   ⚠️ 清理暫存目錄失敗: {cleanup_error}")
            
            # 2. 依策略處理 unprocessed 原始檔案
            if delete_record_on_failure:
                if file_path.exists():
                    try:
                        file_path.unlink()
                        print(f"   ✅ 已刪除 unprocessed 檔案: {file_path}")
                    except Exception as del_error:
                        print(f"   ⚠️ 刪除 unprocessed 檔案失敗: {del_error}")
            else:
                print(f"   ℹ️ 保留 unprocessed 原始檔案供重試: {file_path}")

            # 3. 視策略刪除或保留資料庫記錄
            if delete_record_on_failure:
                try:
                    await db.delete(file_record)
                    await db.commit()
                    print(f"   ✅ 已刪除資料庫記錄 ID: {file_record.id}")
                except Exception as db_error:
                    print(f"   ⚠️ 刪除資料庫記錄失敗: {db_error}")
                    await db.rollback()
            else:
                try:
                    file_record.status = FileStatus.FAILED
                    file_record.processing_step = "failed"
                    await db.commit()
                    print(f"   ✅ 已保留資料庫記錄並標記失敗 ID: {file_record.id}")
                except Exception as db_error:
                    print(f"   ⚠️ 更新失敗狀態失敗: {db_error}")
                    await db.rollback()
            
            print(f"🗑️ 失敗檔案清理完成")
            await self._report_progress(progress_callback, file_record.id, "failed", 0, str(e))
            return False


# 建立全域實例
file_processing_service = FileProcessingService()
