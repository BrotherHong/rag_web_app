"""檔案儲存服務 (File Storage Service)"""

import os
import uuid
import aiofiles
from pathlib import Path
from typing import Optional
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.file import FileStatus


class FileStorageService:
    """檔案儲存服務"""

    def __init__(self):
        """初始化檔案儲存服務"""
        self.base_path = Path(settings.UPLOAD_DIR)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _get_department_path(self, department_id: int, subdirectory: str = "unprocessed") -> Path:
        """取得處室的檔案儲存路徑
        
        Args:
            department_id: 處室 ID
            subdirectory: 子目錄名稱 (unprocessed 或 processed)
        """
        dept_path = self.base_path / str(department_id) / subdirectory
        dept_path.mkdir(parents=True, exist_ok=True)
        return dept_path
    
    def _get_processed_path(self, department_id: int, process_type: str) -> Path:
        """取得處理後檔案的路徑
        
        Args:
            department_id: 處室 ID
            process_type: 處理類型 (data, output_md, summaries, embeddings)
        """
        processed_path = self.base_path / str(department_id) / "processed" / process_type
        processed_path.mkdir(parents=True, exist_ok=True)
        return processed_path

    def generate_unique_filename(self, original_filename: str) -> str:
        """生成唯一檔名
        
        格式: 原檔名 (如果重複則加上時間戳記)
        例如: 人事規章.pdf 或 人事規章_20251113_143000.pdf
        """
        # 分離檔名和副檔名
        name, ext = os.path.splitext(original_filename)
        
        # 清理檔名中的特殊字元
        safe_name = "".join(c for c in name if c.isalnum() or c in (' ', '-', '_', '.')).strip()
        
        # 基本檔名
        base_filename = f"{safe_name}{ext}"
        
        # 如果檔案已存在，加上時間戳記
        # 這個檢查會在 save_upload_file 中進行
        return base_filename

    async def save_upload_file(
        self,
        upload_file: UploadFile,
        department_id: int,
        db: AsyncSession = None,
        original_filename: str = None
    ) -> tuple[str, str, int]:
        """儲存上傳的檔案到 unprocessed 目錄
        
        Args:
            upload_file: FastAPI UploadFile 物件
            department_id: 處室 ID
            db: 資料庫 session（用於檢查重複）
            original_filename: 原始檔名（用於檢查重複）
            
        Returns:
            tuple: (unique_filename, file_path, file_size)
            
        Raises:
            ValueError: 檔名已存在
        """
        from sqlalchemy import select
        from app.models import File as FileModel
        
        # 檢查資料庫是否已有相同檔名基礎的檔案
        if db is not None and original_filename:
            base_name = original_filename.rsplit('.', 1)[0]
            check_query = select(FileModel).where(
                FileModel.department_id == department_id,
                FileModel.original_filename.like(f"{base_name}.%"),
                FileModel.status == FileStatus.COMPLETED,
                FileModel.is_vectorized.is_(True),
            )
            result = await db.execute(check_query)
            existing_file = result.scalars().first()
            
            if existing_file:
                raise ValueError(f"檔案「{existing_file.original_filename}」已存在，請先刪除舊檔或更改檔名後再上傳")
        
        # 生成檔名
        unique_filename = self.generate_unique_filename(upload_file.filename)
        
        # 取得 unprocessed 儲存路徑
        dept_path = self._get_department_path(department_id, "unprocessed")
        file_path = dept_path / unique_filename

        # 若資料庫已有相同 file_path 的舊失敗/取消紀錄，先清除避免唯一鍵衝突
        if db is not None:
            existing_path_query = select(FileModel).where(
                FileModel.file_path == str(file_path)
            )
            existing_path_result = await db.execute(existing_path_query)
            existing_path_record = existing_path_result.scalars().first()

            if existing_path_record:
                is_usable_existing = (
                    existing_path_record.status == FileStatus.COMPLETED
                    and existing_path_record.is_vectorized
                )
                if is_usable_existing:
                    raise ValueError(
                        f"檔案「{existing_path_record.original_filename}」已存在，請先刪除舊檔或更改檔名後再上傳"
                    )

                cleanup_paths = [
                    existing_path_record.file_path,
                    existing_path_record.markdown_path,
                    existing_path_record.summary_path,
                    existing_path_record.embedding_path,
                ]
                for stale_path in cleanup_paths:
                    if not stale_path:
                        continue
                    try:
                        path_obj = Path(stale_path)
                        if path_obj.exists() and path_obj.is_file():
                            path_obj.unlink()
                    except Exception:
                        pass

                await db.delete(existing_path_record)
                await db.flush()
        
        # 如果實體檔案已存在但 DB 無對應記錄（例如測試清空後殘留），直接覆蓋
        if file_path.exists():
            file_path.unlink()
        
        # 儲存檔案
        file_size = 0
        async with aiofiles.open(file_path, 'wb') as f:
            # 分塊讀取和寫入，避免記憶體溢出
            chunk_size = 1024 * 1024  # 1MB
            while chunk := await upload_file.read(chunk_size):
                await f.write(chunk)
                file_size += len(chunk)
        
        return unique_filename, str(file_path), file_size

    def delete_file_completely(self, file_record, department_id: int) -> dict:
        """完整刪除檔案及其所有相關檔案
        
        包括：
        - 原始檔案
        - Markdown 轉換檔案
        - 摘要檔案（包括分塊檔案 part1, part2, etc.）
        - 嵌入向量檔案（包括分塊檔案）
        
        Args:
            file_record: 檔案記錄物件
            department_id: 處室 ID
            
        Returns:
            dict: 清理結果統計
        """
        cleanup_stats = {
            'original_file': False,
            'markdown_file': False,
            'summary_files': 0,
            'embedding_files': 0,
            'errors': []
        }
        
        try:
            # 取得檔案基本資訊
            original_filename = file_record.original_filename
            file_path = file_record.file_path
            
            # 使用資料庫中的 filename（已清理特殊字元）作為檔名主幹
            # 這樣可以精確匹配，避免誤刪其他檔案
            # 例如：filename="QA.pdf" → filename_stem="QA"
            filename_stem = Path(file_record.filename).stem
            
            print(f"📂 使用檔名主幹進行清理: {filename_stem}")
            print(f"📂 原始檔名: {original_filename}")
            print(f"📂 資料庫檔名: {file_record.filename}")
            
            # 取得處室路徑
            dept_path = self._get_department_path(department_id)
            processed_path = self._get_department_path(department_id, "processed")
            
            # 1. 刪除原始檔案
            if file_record.file_path and os.path.exists(file_record.file_path):
                try:
                    os.remove(file_record.file_path)
                    cleanup_stats['original_file'] = True
                    print(f"✅ 已刪除原始檔案: {file_record.file_path}")
                except Exception as e:
                    cleanup_stats['errors'].append(f"刪除原始檔案失敗: {str(e)}")
            
            # 2. 刪除 Markdown 檔案
            markdown_file = processed_path / "output_md" / f"{filename_stem}.md"
            if markdown_file.exists():
                try:
                    markdown_file.unlink()
                    cleanup_stats['markdown_file'] = True
                    print(f"✅ 已刪除 Markdown 檔案: {markdown_file}")
                except Exception as e:
                    cleanup_stats['errors'].append(f"刪除 Markdown 檔案失敗: {str(e)}")
            
            # 3. 刪除摘要檔案（包括分塊檔案）
            summary_dir = processed_path / "summaries"
            if summary_dir.exists():
                # 主摘要檔案
                main_summary = summary_dir / f"{filename_stem}_summary.json"
                if main_summary.exists():
                    try:
                        main_summary.unlink()
                        cleanup_stats['summary_files'] += 1
                        print(f"✅ 已刪除主摘要檔案: {main_summary}")
                    except Exception as e:
                        cleanup_stats['errors'].append(f"刪除主摘要檔案失敗: {str(e)}")
                
                # 分塊摘要檔案（part2, part3, ...）
                for part_file in summary_dir.glob(f"{filename_stem}_part*_summary.json"):
                    try:
                        part_file.unlink()
                        cleanup_stats['summary_files'] += 1
                        print(f"✅ 已刪除分塊摘要檔案: {part_file}")
                    except Exception as e:
                        cleanup_stats['errors'].append(f"刪除分塊摘要檔案失敗: {str(e)}")
            
            # 4. 刪除嵌入向量檔案（包括分塊檔案）
            embeddings_dir = processed_path / "embeddings"
            if embeddings_dir.exists():
                # 主嵌入檔案（可能是 _embedding.json 或 _embeddings.json）
                for pattern in [f"{filename_stem}_embedding.json", f"{filename_stem}_embeddings.json"]:
                    main_embedding = embeddings_dir / pattern
                    if main_embedding.exists():
                        try:
                            main_embedding.unlink()
                            cleanup_stats['embedding_files'] += 1
                            print(f"✅ 已刪除主嵌入檔案: {main_embedding}")
                        except Exception as e:
                            cleanup_stats['errors'].append(f"刪除主嵌入檔案失敗: {str(e)}")
                
                # 分塊嵌入檔案（part2, part3, ...）
                for part_file in embeddings_dir.glob(f"{filename_stem}_part*_embedding.json"):
                    try:
                        part_file.unlink()
                        cleanup_stats['embedding_files'] += 1
                        print(f"✅ 已刪除分塊嵌入檔案: {part_file}")
                    except Exception as e:
                        cleanup_stats['errors'].append(f"刪除分塊嵌入檔案失敗: {str(e)}")
                
                # 也處理可能的 _embeddings.json 格式
                for part_file in embeddings_dir.glob(f"{filename_stem}_part*_embeddings.json"):
                    try:
                        part_file.unlink()
                        cleanup_stats['embedding_files'] += 1
                        print(f"✅ 已刪除分塊嵌入檔案: {part_file}")
                    except Exception as e:
                        cleanup_stats['errors'].append(f"刪除分塊嵌入檔案失敗: {str(e)}")
            
            # 5. 刪除其他可能的衍生檔案
            # 檢查 data 目錄
            data_dir = processed_path / "data"
            if data_dir.exists():
                for data_file in data_dir.glob(f"{filename_stem}.*"):
                    try:
                        data_file.unlink()
                        print(f"✅ 已刪除資料檔案: {data_file}")
                    except Exception as e:
                        cleanup_stats['errors'].append(f"刪除資料檔案失敗: {str(e)}")
            
            print(f"🗑️ 檔案清理完成: {original_filename}")
            print(f"   - 原始檔案: {'✅' if cleanup_stats['original_file'] else '❌'}")
            print(f"   - Markdown: {'✅' if cleanup_stats['markdown_file'] else '❌'}")
            print(f"   - 摘要檔案: {cleanup_stats['summary_files']} 個")
            print(f"   - 嵌入檔案: {cleanup_stats['embedding_files']} 個")
            if cleanup_stats['errors']:
                print(f"   - 錯誤: {len(cleanup_stats['errors'])} 個")
            
            return cleanup_stats
            
        except Exception as e:
            error_msg = f"檔案清理過程發生錯誤: {str(e)}"
            cleanup_stats['errors'].append(error_msg)
            print(f"❌ {error_msg}")
            return cleanup_stats

    async def validate_file(
        self, 
        upload_file: UploadFile,
        db: AsyncSession
    ) -> tuple[bool, Optional[str]]:
        """驗證檔案
        
        Args:
            upload_file: 上傳的檔案
            db: 資料庫 session
            
        Returns:
            tuple: (is_valid, error_message)
        """
        # 使用環境變數的檔案大小限制
        max_file_size = settings.MAX_FILE_SIZE
        
        # 檢查檔案大小
        if hasattr(upload_file, 'size') and upload_file.size:
            if upload_file.size > max_file_size:
                return False, f"檔案大小超過限制 ({max_file_size / (1024**2):.0f} MB)"
        
        # 使用環境變數的允許檔案類型
        allowed_exts = settings.allowed_extensions_list
        
        # 檢查檔案類型
        ext = os.path.splitext(upload_file.filename)[1].lower()
        if ext not in allowed_exts:
            return False, f"不支援的檔案格式: {ext}，允許的格式: {', '.join(allowed_exts)}"
        
        return True, None


# 建立全域檔案儲存服務實例
file_storage = FileStorageService()
