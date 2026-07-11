"""
LiteLLM 客戶端 - 支援多主機負載均衡
"""

import opencc
from typing import Optional, List
from urllib.parse import urlparse
from litellm import Router
from app.config import settings
from app.services.llm.exceptions import LLMServiceError
import logging

logger = logging.getLogger(__name__)

# 禁用 LiteLLM 的內建日誌（避免重複輸出）
logging.getLogger("LiteLLM Router").setLevel(logging.ERROR)
logging.getLogger("LiteLLM").setLevel(logging.ERROR)
logging.getLogger("LiteLLM Proxy").setLevel(logging.ERROR)


class LiteLLMClient:
    """LiteLLM 客戶端，支援多主機負載均衡與故障轉移"""
    
    def __init__(self):
        """初始化 LiteLLM Router"""
        self.converter = opencc.OpenCC('s2t')
        if not settings.ollama_base_urls:
            raise ValueError("未設定任何 Ollama 主機，請設定 OLLAMA_BASE_URL")

        model_list = self._build_model_list()

        # 重試次數取「設定值」與「端點數」較大者，確保單一端點失敗時仍有機會改用其他端點
        num_retries = max(settings.LITELLM_NUM_RETRIES, len(settings.ollama_base_urls))

        self.router = Router(
            model_list=model_list,
            routing_strategy=settings.LITELLM_ROUTING_STRATEGY,
            num_retries=num_retries,
            timeout=float(settings.LITELLM_TIMEOUT),
            allowed_fails=settings.LITELLM_ALLOWED_FAILS,
            cooldown_time=settings.LITELLM_COOLDOWN_TIME,
            enable_pre_call_checks=True,
        )

        # 簡化輸出：只記錄端點數量和主機名
        hosts = sorted({self._extract_host_name(url) for url in settings.ollama_base_urls})
        logger.info(f"✅ LiteLLM Router 初始化完成 ({len(model_list)} 端點, {len(hosts)} 主機: {', '.join(sorted(hosts))})")

    def _extract_host_name(self, url: str) -> str:
        """從 URL 提取可辨識名稱供日誌顯示；帶上路徑最後一段以區分同主機的不同部署"""
        try:
            parsed = urlparse(url)
            if not parsed.netloc:
                return parsed.path or "unknown"
            app = parsed.path.strip("/").rsplit("/", 1)[-1]
            return f"{parsed.netloc}/{app}" if app else parsed.netloc
        except Exception:
            return "unknown"

    def _log_used_host(self, tag: str, response) -> None:
        """記錄實際服務此回應的端點（取自回應的 _hidden_params，故為真正用到的那台）"""
        api_base = getattr(response, "_hidden_params", {}).get("api_base", "")
        logger.info(f"[{tag}] 使用主機: {self._extract_host_name(api_base)}")
    
    def _build_model_list(self) -> List[dict]:
        """建立模型配置列表"""
        model_list = []
        
        # 為每個主機配置文字生成與 Embedding 模型
        for base_url in settings.ollama_base_urls:
            # 文字生成模型（summary 與 rag 共用）
            model_list.append({
                "model_name": "text-generation",
                "litellm_params": {
                    "model": f"ollama/{settings.OLLAMA_RAG_MODEL or settings.OLLAMA_SUMMARY_MODEL}",
                    "api_base": base_url,
                }
            })
            
            # Embedding 模型
            model_list.append({
                "model_name": "bge-embedding",
                "litellm_params": {
                    "model": f"ollama/{settings.OLLAMA_EMBEDDING_MODEL}",
                    "api_base": base_url,
                }
            })

            # 安全過濾模型（llama-guard）
            if settings.GUARD_ENABLED and settings.GUARD_MODEL:
                model_list.append({
                    "model_name": "guard",
                    "litellm_params": {
                        "model": f"ollama/{settings.GUARD_MODEL}",
                        "api_base": base_url,
                    }
                })

        return model_list
    
    async def generate(self, prompt: str = None, *, system: str = None, user: str = None, timeout: Optional[int] = None) -> str:
        """
        異步發送提示詞並獲取回應
        
        支援兩種呼叫方式：
        - generate(prompt)：向下相容，整段放入 user message
        - generate(system=..., user=...)：system/user 分離
        
        Args:
            prompt: 提示詞（向下相容）
            system: system prompt
            user: user prompt
            timeout: 超時時間（秒），None 時使用設定值
            
        Returns:
            str: 模型回應（繁體中文）
        """
        try:
            request_timeout = timeout if timeout is not None else settings.LITELLM_TIMEOUT
            
            model_name = "text-generation"

            # 組合 messages
            if system and user:
                messages = [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ]
            else:
                messages = [{"role": "user", "content": prompt}]

            response = await self.router.acompletion(
                model=model_name,
                messages=messages,
                timeout=request_timeout,
            )
            self._log_used_host("TEXT", response)

            raw_response = response.choices[0].message.content
            return self.converter.convert(raw_response)

        except Exception as e:
            logger.error(f"LiteLLM generate 失敗: {str(e)}")
            raise LLMServiceError(f"文字生成失敗: {str(e)}") from e
    
    async def generate_embedding(self, text: str, timeout: int = 60) -> Optional[List[float]]:
        """
        異步生成文本嵌入向量
        
        Args:
            text: 要向量化的文本
            timeout: 超時時間（秒）
            
        Returns:
            List[float]: 嵌入向量，失敗時返回 None
        """
        try:
            response = await self.router.aembedding(
                model="bge-embedding",
                input=[text],
                timeout=timeout,
            )
            self._log_used_host("EMBEDDING", response)
            return response.data[0]['embedding']
            
        except Exception as e:
            logger.error(f"生成嵌入失敗: {str(e)}")
            return None

    async def check_guard(self, user_message: str, timeout: int = 10) -> str:
        """呼叫 guard 模型檢查查詢安全性，回傳原始回應內容（失敗時由呼叫端決定放行與否）。"""
        response = await self.router.acompletion(
            model="guard",
            messages=[{"role": "user", "content": user_message}],
            temperature=0,
            max_tokens=20,
            timeout=timeout,
        )
        self._log_used_host("GUARD", response)
        return response.choices[0].message.content or ""

    def get_load_balancing_stats(self) -> dict:
        """
        獲取負載均衡統計資訊
        
        返回:
            dict: 包含各主機請求數、延遲等資訊
        """
        try:
            # LiteLLM Router 提供的統計資訊
            return {
                "routing_strategy": settings.LITELLM_ROUTING_STRATEGY,
                "total_deployments": len(self.router.model_list),
                "text_model": settings.OLLAMA_RAG_MODEL or settings.OLLAMA_SUMMARY_MODEL,
                "embedding_model": settings.OLLAMA_EMBEDDING_MODEL,
                # 可擴展其他統計資訊
            }
        except Exception as e:
            logger.error(f"獲取統計資訊失敗: {str(e)}")
            return {}


_shared_client: Optional["LiteLLMClient"] = None


def get_llm_client() -> "LiteLLMClient":
    """取得全程序共用的 LiteLLMClient，讓所有呼叫共享同一組 Router 與冷卻狀態。"""
    global _shared_client
    if _shared_client is None:
        _shared_client = LiteLLMClient()
    return _shared_client
