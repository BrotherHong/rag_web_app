"""
Ollama 客戶端 - 用於 LLM 生成和嵌入
"""

import requests
import opencc
from app.config import settings


class OllamaClient:
    """
    Ollama 客戶端，用於生成回應和嵌入
    """
    
    def __init__(self, base_url: str = None, model: str = None):
        """
        初始化 Ollama 客戶端
        
        參數:
            base_url: Ollama 伺服器網址（預設從設定檔讀取）
            model: 使用的模型名稱（預設從設定檔讀取）
        """
        self.base_url = base_url or settings.OLLAMA_BASE_URL
        self.model = model or settings.OLLAMA_SUMMARY_MODEL
        self.converter = opencc.OpenCC('s2t')  # 簡體轉繁體
    
    def generate(self, prompt: str, timeout: int = 300) -> str:
        """
        發送提示詞到 Ollama 並獲取回應
        
        參數:
            prompt: 要發送到模型的提示詞
            timeout: 請求超時時間（秒）
            
        返回:
            str: 模型回應或錯誤訊息
        """
        url = f"{self.base_url}/api/generate"
        
        data = {
            "model": self.model,
            "prompt": prompt,
            "stream": False
        }
        
        try:
            response = requests.post(url, json=data, timeout=timeout)
            response.raise_for_status()
            raw_response = response.json()["response"]
            # 將簡體中文轉換為繁體中文
            return self.converter.convert(raw_response)
            
        except requests.exceptions.ConnectionError:
            return "錯誤: 無法連接到 Ollama 服務器。請確保 Ollama 正在運行"
        except requests.exceptions.Timeout:
            return "錯誤: 請求超時"
        except requests.exceptions.RequestException as e:
            return f"錯誤: {str(e)}"
        except KeyError:
            return "錯誤: 無效的響應格式"
    
    def generate_embedding(self, text: str, model: str = None, timeout: int = 60) -> list[float] | None:
        """
        為文本生成嵌入向量
        
        參數:
            text: 要向量化的文本
            model: 嵌入模型名稱（預設使用設定中的嵌入模型）
            timeout: 請求超時時間（秒）
            
        返回:
            list[float]: 嵌入向量，失敗時返回 None
        """
        embedding_model = model or settings.OLLAMA_EMBEDDING_MODEL
        url = f"{self.base_url}/api/embeddings"
        
        data = {
            "model": embedding_model,
            "prompt": text
        }
        
        try:
            response = requests.post(url, json=data, timeout=timeout)
            response.raise_for_status()
            result = response.json()
            return result.get("embedding", None)
            
        except Exception as e:
            print(f"生成嵌入失敗: {str(e)}")
            return None
