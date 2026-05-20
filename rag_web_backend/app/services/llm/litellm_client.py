"""
LiteLLM 客戶端 - 支援多主機負載均衡
"""

import opencc
from typing import Optional, List
from urllib.parse import urlparse
from litellm import Router
from app.config import settings
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
        
        self.router = Router(
            model_list=model_list,
            routing_strategy=settings.LITELLM_ROUTING_STRATEGY,
            num_retries=settings.LITELLM_NUM_RETRIES,
            timeout=float(settings.LITELLM_TIMEOUT),
            enable_pre_call_checks=True,
        )

        # 簡化輸出：只記錄端點數量和主機名
        hosts = sorted({self._extract_host_name(url) for url in settings.ollama_base_urls})
        logger.info(f"✅ LiteLLM Router 初始化完成 ({len(model_list)} 端點, {len(hosts)} 主機: {', '.join(sorted(hosts))})")

    def _extract_host_name(self, url: str) -> str:
        """從 URL 提取主機名供日誌顯示"""
        try:
            parsed = urlparse(url)
            return parsed.netloc or parsed.path or "unknown"
        except Exception:
            return "unknown"
    
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

            # 獲取選擇的部署（簡化日誌）
            deployment = self.router.get_available_deployment(model=model_name)
            if deployment:
                api_base = deployment.get('litellm_params', {}).get('api_base', '')
                host_name = self._extract_host_name(api_base)
                logger.info(f"[TEXT] 使用主機: {host_name}")

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

            raw_response = response.choices[0].message.content
            return self.converter.convert(raw_response)
            
        except Exception as e:
            error_msg = f"錯誤: {str(e)}"
            logger.error(f"LiteLLM generate 失敗: {error_msg}")
            return error_msg
    
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
            # 獲取選擇的部署（簡化日誌）
            deployment = self.router.get_available_deployment(model="bge-embedding")
            if deployment:
                api_base = deployment.get('litellm_params', {}).get('api_base', '')
                host_name = self._extract_host_name(api_base)
                logger.info(f"[EMBEDDING] 使用主機: {host_name}")
            
            response = await self.router.aembedding(
                model="bge-embedding",
                input=[text],
                timeout=timeout,
            )
            return response.data[0]['embedding']
            
        except Exception as e:
            logger.error(f"生成嵌入失敗: {str(e)}")
            return None
    
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
