"""
文件轉 Markdown 工具
支援 DOC, DOCX, PDF, XLSX 等格式
"""

import subprocess
import shutil
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
                timeout=600  # 增加超時時間到 10 分鐘
            )
            
            if result.returncode == 0:
                # mineru 會在輸出目錄創建一個以 PDF 檔名為基礎的目錄結構
                # 路徑格式: {pdf_stem}/auto/{pdf_stem}.md
                pdf_stem = pdf_file.stem
                expected_md_path = output_dir / pdf_stem / "auto" / f"{pdf_stem}.md"
                
                if expected_md_path.exists():
                    # 移動到指定位置
                    shutil.move(str(expected_md_path), str(output_file))
                    # 清理臨時目錄結構
                    try:
                        shutil.rmtree(str(output_dir / pdf_stem))
                    except:
                        pass
                    print(f"✅ mineru 轉換成功")
                    return True
                else:
                    # 如果沒找到預期位置，搜尋所有可能的 .md 檔案
                    found_md = None
                    for md_file in output_dir.rglob("*.md"):
                        if pdf_stem in md_file.stem:
                            found_md = md_file
                            break
                    
                    if found_md:
                        shutil.move(str(found_md), str(output_file))
                        # 清理臨時目錄
                        try:
                            shutil.rmtree(str(output_dir / pdf_stem))
                        except:
                            pass
                        print(f"✅ mineru 轉換成功")
                        return True
                    else:
                        print(f"❌ mineru 轉換完成但找不到輸出檔案")
                        return False
            else:
                print(f"❌ mineru 返回錯誤碼 {result.returncode}: {result.stderr}")
                return False
            
        except FileNotFoundError as e:
            print(f"❌ mineru 未安裝")
            print(f"💡 安裝方式: pip install mineru")
            return False
        except subprocess.TimeoutExpired as e:
            print(f"❌ mineru 處理超時（超過 10 分鐘）")
            return False
    
    def _find_mineru_output(self, pdf_file: Path, output_dir: Path) -> Optional[Path]:
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
        
        # 搜尋所有 .md 檔案
        md_files = list(output_dir.rglob("*.md"))
        if md_files:
            return md_files[0]
        
        return None
    
    def _convert_with_markitdown(self, input_file: Path, output_file: Path) -> bool:
        """使用 MarkItDown 轉換"""
        if not self.markitdown:
            print("❌ MarkItDown 不可用")
            return False
        
        try:
            output_file.parent.mkdir(parents=True, exist_ok=True)
            
            result = self.markitdown.convert(str(input_file))
            
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(result.text_content)
            
            return True
            
        except Exception as e:
            print(f"❌ MarkItDown 轉換失敗: {e}")
            return False
