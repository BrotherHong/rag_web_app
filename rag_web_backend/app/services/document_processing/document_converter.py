"""
文件轉 Markdown 工具
支援 DOC, DOCX, PDF, XLSX 等格式
"""

import re
import subprocess
import shutil
import time
from pathlib import Path
from typing import Optional

try:
    from markitdown import MarkItDown
except ImportError:
    print("警告: markitdown 套件未安裝")
    MarkItDown = None


class DocumentConverter:
    """文件轉換器"""
    
    def __init__(self):
        if MarkItDown:
            self.markitdown = MarkItDown()
        else:
            self.markitdown = None
            print("警告: MarkItDown 不可用")
        
        self.supported_extensions = {'.doc', '.docx', '.pdf', '.xlsx', '.xls'}
    
    def convert_doc_to_docx(self, doc_file: Path, output_dir: Path) -> Optional[Path]:
        """使用 LibreOffice 將 .doc 轉為 .docx"""
        if not doc_file.exists():
            print(f"❌ 檔案不存在: {doc_file}")
            return None
        
        output_dir.mkdir(parents=True, exist_ok=True)
        
        command = [
            "soffice",
            "--headless",
            "--convert-to", "docx",
            "--outdir", str(output_dir),
            str(doc_file)
        ]
        
        try:
            subprocess.run(command, capture_output=True, text=True, check=True, timeout=60)
            docx_file = output_dir / f"{doc_file.stem}.docx"
            if docx_file.exists():
                return docx_file
            return None
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            print(f"❌ DOC 轉換失敗: {e}")
            return None
    
    def convert_to_markdown(
        self,
        input_file: Path,
        output_file: Path,
        use_mineru_for_pdf: bool = True
    ) -> bool:
        """
        轉換檔案為 Markdown
        
        Args:
            input_file: 輸入檔案路徑
            output_file: 輸出 Markdown 檔案路徑
            use_mineru_for_pdf: PDF 是否使用 mineru（否則使用 markitdown）
            
        Returns:
            bool: 是否成功
        """
        if not input_file.exists():
            print(f"❌ 檔案不存在: {input_file}")
            return False
        
        file_extension = input_file.suffix.lower()
        
        # 處理 .doc 檔案 - 先轉為 .docx
        if file_extension == '.doc':
            temp_dir = input_file.parent / "temp_docx"
            docx_file = self.convert_doc_to_docx(input_file, temp_dir)
            if not docx_file:
                return False
            input_file = docx_file
            file_extension = '.docx'
        
        # PDF 使用 mineru
        if file_extension == '.pdf' and use_mineru_for_pdf:
            return self._convert_pdf_with_mineru(input_file, output_file)
        
        # 其他格式使用 MarkItDown
        return self._convert_with_markitdown(input_file, output_file)
    
    def _convert_pdf_with_mineru(self, pdf_file: Path, output_file: Path) -> bool:
        """使用 mineru 轉換 PDF"""
        try:
            # mineru 需要輸出目錄而不是具體檔案
            output_dir = output_file.parent
            output_dir.mkdir(parents=True, exist_ok=True)
            existing_md_files = {str(path.resolve()) for path in output_dir.rglob("*.md")}
            
            # mineru 命令格式
            command = [
                "mineru",
                "-p", str(pdf_file),
                "-o", str(output_dir),
                "-m", "auto",  # 自動判斷方法
                "-b", "pipeline",  # 使用 pipeline 後端
                "-d", "cpu"  # 強制 CPU，避免與 Reranker 搶 GPU
            ]
            
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=900  # 逾時上限 15 分鐘（避免同時處理兩個大檔時誤判超時）
            )
            
            if result.returncode == 0:
                found_md = None
                # MinerU 在高併發時可能會晚一點才把 markdown 寫到磁碟。
                for _ in range(15):
                    found_md = self._find_mineru_output(pdf_file, output_dir, existing_md_files)
                    if found_md:
                        break
                    time.sleep(1)

                if not found_md:
                    print("❌ mineru 轉換完成但找不到輸出檔案")
                    print(f"   PDF: {pdf_file}")
                    print(f"   output_dir: {output_dir}")
                    if result.stdout:
                        print("   stdout:")
                        print(result.stdout[-2000:])
                    if result.stderr:
                        print("   stderr:")
                        print(result.stderr[-2000:])

                    all_md = list(output_dir.rglob("*.md"))
                    if all_md:
                        print("   output_dir 內已有 markdown:")
                        for md in all_md[:20]:
                            print(f"   - {md}")
                    return False

                if found_md.resolve() != output_file.resolve():
                    if output_file.exists():
                        output_file.unlink()
                    shutil.move(str(found_md), str(output_file))

                # 盡可能清理 mineru 可能建立的子目錄
                try:
                    shutil.rmtree(str(output_dir / pdf_file.stem), ignore_errors=True)
                except Exception:
                    pass

                # 以 PDF 文字層校正 OCR 弄壞的網址（失敗不影響轉檔）
                try:
                    from .url_correction import correct_urls
                    content = output_file.read_text(encoding="utf-8")
                    fixed = correct_urls(content, pdf_file)
                    if fixed != content:
                        output_file.write_text(fixed, encoding="utf-8")
                        print("✅ 已校正 OCR 網址")
                except Exception as e:
                    print(f"⚠️ URL 校正跳過：{e}")

                print("✅ mineru 轉換成功")
                return True
            else:
                print(f"❌ mineru 返回錯誤碼 {result.returncode}: {result.stderr}")
                return False
            
        except FileNotFoundError as e:
            print(f"❌ mineru 未安裝")
            print(f"💡 安裝方式: pip install mineru")
            return False
        except subprocess.TimeoutExpired as e:
            print(f"❌ mineru 處理超時（超過 15 分鐘）")
            return False
    
    def _find_mineru_output(
        self,
        pdf_file: Path,
        output_dir: Path,
        existing_md_files: Optional[set[str]] = None,
    ) -> Optional[Path]:
        """尋找 mineru 產生的 markdown 檔案"""
        # mineru 通常產生在子目錄中
        possible_paths = [
            output_dir / f"{pdf_file.stem}.md",
            output_dir / pdf_file.stem / "auto" / f"{pdf_file.stem}.md",
            output_dir / "auto" / f"{pdf_file.stem}.md",
        ]
        
        for path in possible_paths:
            if path.exists():
                return path

        all_md_files = [path for path in output_dir.rglob("*.md") if path.is_file()]

        # 優先挑選本次 mineru 執行後新出現的 markdown
        if existing_md_files is not None:
            new_md_files = [
                path for path in all_md_files
                if str(path.resolve()) not in existing_md_files
            ]
            if new_md_files:
                return max(new_md_files, key=lambda p: p.stat().st_mtime)

        # 退而求其次：挑選最近修改且名稱最接近原始 PDF 的 markdown
        same_stem_files = [path for path in all_md_files if path.stem == pdf_file.stem]
        if same_stem_files:
            return max(same_stem_files, key=lambda p: p.stat().st_mtime)
        
        if all_md_files:
            return max(all_md_files, key=lambda p: p.stat().st_mtime)
        
        return None
    
    def _unescape_url_underscores(self, content: str) -> str:
        """還原 MarkItDown 對 URL 中底線的跳脫（\_ → _）"""
        return re.sub(r'https?://\S+', lambda m: m.group(0).replace('\_', '_'), content)

    def _convert_with_markitdown(self, input_file: Path, output_file: Path) -> bool:
        """使用 MarkItDown 轉換"""
        if not self.markitdown:
            print("❌ MarkItDown 不可用")
            return False
        
        try:
            output_file.parent.mkdir(parents=True, exist_ok=True)
            
            result = self.markitdown.convert(str(input_file))
            text = self._unescape_url_underscores(result.text_content)
            
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(text)
            
            return True
            
        except Exception as e:
            print(f"❌ MarkItDown 轉換失敗: {e}")
            return False
