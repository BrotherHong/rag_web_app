"""RAG 查詢 API 路由"""

import json
import re
import time
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt, JWTError

from app.core.database import get_db
from app.core.security import get_current_query_user_optional
from app.config import settings
from app.models.query_user import QueryUser
from app.models.query_history import QueryHistory
from app.schemas.rag import (
    QueryRequest,
    QueryResponse,
    DocumentSource,
    DirectQueryRequest,
    DirectQueryResponse
)
from app.services.rag.rag_engine import RAGEngine
from app.services.rag.no_result_utils import is_no_result_answer
from app.services.activity import activity_service

router = APIRouter(prefix="/rag", tags=["RAG查詢"])
logger = logging.getLogger(__name__)

# 快取各處室的 RAGEngine，避免每次 request 重新載入 reranker 模型
_dept_rag_engines: dict = {}

def get_dept_rag_engine(department_id: int) -> RAGEngine:
    if department_id not in _dept_rag_engines:
        base_path = f"uploads/{department_id}/processed"
        _dept_rag_engines[department_id] = RAGEngine(base_path=base_path, debug_mode=True)
        print(f"✅ RAG Engine initialized for dept {department_id}: {base_path}")
    return _dept_rag_engines[department_id]


def invalidate_dept_rag_engine(department_id: int) -> None:
    """清除指定處室的 RAG Engine 快取，讓新向量可立即生效"""
    removed = _dept_rag_engines.pop(department_id, None)
    if removed:
        print(f"♻️ RAG Engine cache invalidated for dept {department_id}")


@router.post("/query", response_model=QueryResponse)
async def query_documents(
    request: QueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[QueryUser] = Depends(get_current_query_user_optional)
):
    """RAG 查詢（公開端點，支援訪客和查詢用戶）
    
    此端點專用於前端查詢系統（rag_web_query），支援：
    - 訪客：只能訪問公開文件
    - 查詢用戶：可以訪問公開文件 + 被授權的文件
    
    後台管理員使用獨立的後台系統，不使用此端點
    """
    
    # 調試：檢查當前用戶狀態
    if current_user:
        print(f"🔐 [RAG Query] 已登入用戶: {current_user.username} (ID: {current_user.id})")
    else:
        print(f"👤 [RAG Query] 訪客查詢")
    
    try:
        # 決定處室 ID
        department_id = None
        if request.scope_ids and len(request.scope_ids) > 0:
            department_id = request.scope_ids[0]
        elif current_user and current_user.default_department_id:
            # 查詢用戶使用預設處室
            department_id = current_user.default_department_id
        else:
            raise HTTPException(
                status_code=400,
                detail="未登入用戶必須指定 scope_ids"
            )
        
        # 處理分類過濾：如果有指定 category_ids，查詢符合條件的檔案清單
        allowed_filenames = None  # None 表示不過濾（查詢所有檔案）
        
        # 訪客權限過濾：只能訪問公開文件
        if current_user is None:
            from app.models.file import File as FileModel
            
            # 獲取公開文件列表
            public_query = select(FileModel.original_filename).where(
                FileModel.department_id == department_id,
                FileModel.is_public == True,
                FileModel.is_vectorized == True
            )
            
            public_result = await db.execute(public_query)
            allowed_filenames = {row[0] for row in public_result.all()}
        
        # 查詢用戶權限過濾：公開文件 + 被授權的文件 + 身分組授權的文件
        elif isinstance(current_user, QueryUser):
            # 查詢用戶可以訪問：公開文件 + 被授權的文件 + 身分組授權的文件
            from app.models.file import File as FileModel
            from app.models.query_user import FilePermission
            from app.models.user_group import FileUserGroupPermission
            
            # 1. 獲取公開文件
            public_query = select(FileModel.original_filename).where(
                FileModel.department_id == department_id,
                FileModel.is_public == True,
                FileModel.is_vectorized == True
            )
            public_result = await db.execute(public_query)
            public_filenames = {row[0] for row in public_result.all()}
            
            # 2. 獲取用戶被授權的文件（個人權限）
            permission_query = select(FileModel.original_filename).join(
                FilePermission,
                FileModel.id == FilePermission.file_id
            ).where(
                FilePermission.query_user_id == current_user.id,
                FileModel.department_id == department_id,
                FileModel.is_vectorized == True
            )
            
            permission_result = await db.execute(permission_query)
            authorized_filenames = {row[0] for row in permission_result.all()}
            
            # 3. 獲取用戶通過身分組授權的文件
            # 首先獲取用戶所屬的所有身分組 ID
            user_group_ids = [group.id for group in current_user.user_groups]
            
            group_permission_filenames = set()
            if user_group_ids:
                group_permission_query = select(FileModel.original_filename).join(
                    FileUserGroupPermission,
                    FileModel.id == FileUserGroupPermission.file_id
                ).where(
                    FileUserGroupPermission.user_group_id.in_(user_group_ids),
                    FileModel.department_id == department_id,
                    FileModel.is_vectorized == True
                )
                
                group_permission_result = await db.execute(group_permission_query)
                group_permission_filenames = {row[0] for row in group_permission_result.all()}
            
            # 4. 合併：公開文件 + 個人授權文件 + 身分組授權文件
            allowed_filenames = public_filenames | authorized_filenames | group_permission_filenames
        
        # 「其他」分類的檔案對所有人開放，不受公開/身分組權限限制
        if allowed_filenames is not None:
            from app.models.category import Category as CategoryModel
            from app.models.file import File as FileModel
            
            other_cat_query = select(CategoryModel.id).where(
                CategoryModel.department_id == department_id,
                CategoryModel.name == "其他"
            )
            other_cat_result = await db.execute(other_cat_query)
            other_cat_id = other_cat_result.scalar_one_or_none()
            
            if other_cat_id:
                other_files_query = select(FileModel.original_filename).where(
                    FileModel.department_id == department_id,
                    FileModel.category_id == other_cat_id,
                    FileModel.is_vectorized == True
                )
                other_files_result = await db.execute(other_files_query)
                other_filenames = {row[0] for row in other_files_result.all()}
                allowed_filenames = allowed_filenames | other_filenames
                print(f"📂 [RAG] 加入「其他」分類公開檔案: {len(other_filenames)} 個")
        
        # 若沒有任何可訪問的文件，提早返回
        if allowed_filenames is not None and not allowed_filenames:
            if current_user is None:
                msg = "抱歉，目前沒有可供查詢的公開資料。請登入以訪問更多內容。"
            else:
                msg = "抱歉，您目前沒有權限訪問任何文件。請聯繫管理員獲取訪問權限。"
            return QueryResponse(
                query=request.query,
                answer=msg,
                sources=[]
            )
        
        # 分類過濾（對所有用戶類型生效）
        if request.category_ids:
            from app.models.category import Category
            from app.models.file import File as FileModel
            
            # 1. 找出該處室的「其他」分類 ID
            other_category_query = select(Category.id).where(
                Category.department_id == department_id,
                Category.name == "其他"
            )
            other_category_result = await db.execute(other_category_query)
            other_category_id = other_category_result.scalar_one_or_none()
            
            # 2. 建立完整的分類 ID 清單（使用者選的 + 「其他」）
            filter_category_ids = list(request.category_ids)
            if other_category_id and other_category_id not in filter_category_ids:
                filter_category_ids.append(other_category_id)
            
            # 3. 查詢符合分類條件的檔案
            file_query = select(FileModel.original_filename).where(
                FileModel.department_id == department_id,
                FileModel.category_id.in_(filter_category_ids),
                FileModel.is_vectorized == True
            )
            
            # 所有用戶類型統一：已有權限列表（公開+授權+其他分類），與選定分類求交集
            # 訪客的 allowed_filenames 已包含公開文件 + 「其他」分類文件
            # 查詢用戶的 allowed_filenames 已包含公開+授權+「其他」分類文件
            file_result = await db.execute(file_query)
            category_filenames = {row[0] for row in file_result.all()}
            allowed_filenames = allowed_filenames & category_filenames  # 交集
            
            if not allowed_filenames:
                # 沒有符合條件的檔案
                msg = "抱歉，在選定的分類中找不到"
                if current_user is None:
                    msg += "公開的"
                else:
                    msg += "您有權限訪問的"
                msg += "相關資訊。"
                return QueryResponse(
                    query=request.query,
                    answer=msg,
                    sources=[]
                )
        
        # 取得（或初始化）對應處室的 RAG 引擎（全域快取，reranker 只載入一次）
        try:
            dept_rag_engine = get_dept_rag_engine(department_id)
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"處室 {department_id} 的 RAG 引擎未初始化，請確認系統配置和 embeddings 資料"
            )
        
        start_time = time.time()
        
        # Execute RAG query with async implementation
        result = await dept_rag_engine.query(
            question=request.query,
            top_k=250,
            include_similarity_scores=True,
            allowed_filenames=allowed_filenames
        )
        
        processing_time = time.time() - start_time
        logger.info(
            f"✅ RAG查詢完成 | 問題: {request.query[:50]}... | 處理時間: {processing_time:.2f}秒 | 檢索文檔數: {result.get('retrieved_docs', 0)}"
        )
        
        # 解析 answer 中實際被引用的文檔編號
        answer_text = result['answer']
        all_sources = result['sources']

        # 1. 匹配 （文檔X） 格式（全形/半形括號、冒號、空格皆可）
        cited_numbers = {int(m) for m in re.findall(r'[（(]\s*(?:來源[：:]\s*)?文檔\s*(\d+)\s*[）)]', answer_text)}

        # 2. 同時嘗試直接匹配括號內的檔案名稱
        bracket_texts = re.findall(r'[（(]([^）)\n]+)[）)]', answer_text)
        filename_to_idx = {s['filename']: i for i, s in enumerate(all_sources, 1)}
        for text in bracket_texts:
            fname = text.strip()
            if fname in filename_to_idx:
                cited_numbers.add(filename_to_idx[fname])

        # 3. 若完全沒有解析到，fallback 回傳全部 sources
        use_all = not cited_numbers

        # Convert sources to API format
        sources = []
        for idx, source in enumerate(all_sources, 1):
            if not use_all and idx not in cited_numbers:
                continue

            original_filename = source['filename']
            
            # Query database to find file_id
            from app.models.file import File as FileModel
            file_query = select(FileModel).where(
                FileModel.department_id == department_id,
                FileModel.original_filename == original_filename
            )
            file_result = await db.execute(file_query)
            file_record = file_result.scalar_one_or_none()
            
            if not file_record:
                print(f"⚠️ Warning: File record not found for {original_filename}")
                continue
            
            doc_source = DocumentSource(
                doc_num=idx,
                file_id=file_record.id,
                file_name=original_filename,
                source_link=source.get('source_link', ''),
                download_link=f"/public/files/{file_record.id}/download"
            )
            sources.append(doc_source)
        
        # Log activity and save query history
        is_no_result = is_no_result_answer(result['answer'])

        if current_user:
            # 查詢用戶（記錄到 query_history）
            try:
                query_history = QueryHistory(
                    user_id=None,
                    query_user_id=current_user.id,
                    department_id=department_id,
                    query=request.query,
                    answer=result['answer'],
                    processing_time=processing_time,
                    source_count=len(sources),
                    query_type="semantic",
                    scope="query_user",
                    extra_data={
                        "category_ids": request.category_ids or [],
                        "retrieved_docs": result.get('retrieved_docs', 0),
                        "is_no_result": is_no_result,
                    }
                )
                db.add(query_history)
                await db.commit()
                print(f"✅ QueryHistory saved (query_user): query_id={query_history.id}, user={current_user.username}")
            except Exception as e:
                print(f"❌ Failed to save QueryHistory for query_user: {e}")
                await db.rollback()
        else:
            # 訪客
            try:
                anonymous_history = QueryHistory(
                    user_id=None,
                    query_user_id=None,
                    department_id=department_id,
                    query=request.query,
                    answer=result['answer'],
                    processing_time=processing_time,
                    source_count=len(sources),
                    query_type="semantic",
                    scope="anonymous",
                    extra_data={
                        "category_ids": request.category_ids or [],
                        "retrieved_docs": result.get('retrieved_docs', 0),
                        "is_no_result": is_no_result,
                    }
                )
                db.add(anonymous_history)
                await db.commit()
                print(f"✅ QueryHistory saved (anonymous): query_id={anonymous_history.id}")
            except Exception as e:
                print(f"❌ Failed to save anonymous QueryHistory: {e}")
                await db.rollback()

        return QueryResponse(
            query=request.query,
            answer=result['answer'],
            sources=sources
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"參數錯誤: {str(e)}"
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"查詢處理失敗: {str(e)}"
        )


@router.post("/direct-query", response_model=DirectQueryResponse)
async def direct_query(
    request: DirectQueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[QueryUser] = Depends(get_current_query_user_optional)
):
    """直接用 LLM 回覆（不依賴 RAG 知識庫）
    
    當 RAG 找不到相關資料時，使用此端點讓 LLM 直接回答。
    - 若處室有設定 external_api_key，使用該 API Key 呼叫外部模型
    - 否則使用本地 Ollama 模型直接回答
    """
    department_id = None
    if request.scope_ids and len(request.scope_ids) > 0:
        department_id = request.scope_ids[0]
    elif current_user and current_user.default_department_id:
        department_id = current_user.default_department_id
    else:
        raise HTTPException(status_code=400, detail="未登入用戶必須指定 scope_ids")

    # 取得處室的 external_api_key
    from app.models.department import Department
    dept_result = await db.execute(select(Department).where(Department.id == department_id))
    department = dept_result.scalar_one_or_none()

    if not department:
        raise HTTPException(status_code=404, detail="處室不存在")

    answer = await _call_llm_direct(request.query, department.external_api_key)

    return DirectQueryResponse(
        query=request.query,
        answer=answer,
        used_external_api=bool(department.external_api_key)
    )


async def _call_llm_direct(question: str, api_key: str | None) -> str:
    """呼叫 LLM 直接回覆（不使用 RAG）"""
    import httpx
    import opencc
    converter = opencc.OpenCC('s2t')

    prompt = f"""請直接回答以下問題。請以繁體中文回覆，回答要清晰、完整、有條理。

問題：{question}

回答："""

    def _extract_responses_text_and_sources(data: dict) -> tuple[str, list[tuple[str, str]]]:
        """從 OpenAI Responses 回傳中擷取文字與可驗證來源連結。"""
        raw = data.get("output_text", "") or ""
        parts: list[str] = []
        sources: list[tuple[str, str]] = []
        seen_urls: set[str] = set()

        for item in data.get("output", []):
            for content in item.get("content", []):
                text = content.get("text")
                if text:
                    parts.append(text)

                for ann in content.get("annotations", []) or []:
                    url = ann.get("url") or ann.get("source")
                    if not url or url in seen_urls:
                        continue
                    title = ann.get("title") or ann.get("text") or url
                    seen_urls.add(url)
                    sources.append((str(title), str(url)))

        if not raw.strip():
            raw = "\n".join(parts).strip()

        return raw.strip(), sources

    if api_key:
        # 使用外部 API（支援 OpenAI / Gemini / Claude 等 OpenAI-compatible 介面）
        if api_key.startswith("sk-ant-"):
            # Claude (Anthropic)
            base_url = "https://api.anthropic.com/v1"
            model = "claude-3-5-haiku-20241022"
            headers = {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
            payload = {
                "model": model,
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": prompt}]
            }
            try:
                async with httpx.AsyncClient(timeout=60) as client:
                    resp = await client.post(f"{base_url}/messages", headers=headers, json=payload)
                    resp.raise_for_status()
                    raw = resp.json()["content"][0]["text"].strip()
                    return converter.convert(raw)
            except Exception as e:
                return f"外部 API 呼叫失敗：{str(e)}"

        elif api_key.startswith("AIza"):
            # Google Gemini（OpenAI-compatible endpoint）
            base_url = "https://generativelanguage.googleapis.com/v1beta/openai"
            model = "gemini-2.0-flash"
        else:
            # OpenAI 或其他 OpenAI-compatible
            base_url = "https://api.openai.com/v1"
            model = settings.OPENAI_DIRECT_MODEL

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        # OpenAI 的 gpt-5 系列優先走 Responses API，避免與 chat/completions 參數不相容。
        use_responses_api = base_url == "https://api.openai.com/v1" and model.startswith("gpt-5")
        use_web_search = settings.OPENAI_ENABLE_WEB_SEARCH and base_url == "https://api.openai.com/v1"

        effective_prompt = prompt
        if use_web_search:
            effective_prompt = (
                prompt
                + "\n\n請使用網路檢索工具查證；若找不到可靠來源請明確說不知道。"
                + "不要自行臆造人名、職稱、年份或網址。"
            )

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                if use_responses_api:
                    payload = {
                        "model": model,
                        "input": [
                            {
                                "role": "user",
                                "content": [
                                    {"type": "input_text", "text": effective_prompt}
                                ]
                            }
                        ],
                        "max_output_tokens": 1024
                    }
                    if use_web_search:
                        payload["tools"] = [{"type": "web_search_preview"}]
                        payload["tool_choice"] = "auto"
                    resp = await client.post(f"{base_url}/responses", headers=headers, json=payload)
                else:
                    payload = {
                        "model": model,
                        "messages": [{"role": "user", "content": effective_prompt}],
                        "max_tokens": 1024
                    }
                    resp = await client.post(f"{base_url}/chat/completions", headers=headers, json=payload)

                resp.raise_for_status()

                data = resp.json()
                if use_responses_api:
                    raw, sources = _extract_responses_text_and_sources(data)
                    if raw and use_web_search and sources:
                        source_lines = [f"- {title}: {url}" for title, url in sources[:8]]
                        raw = raw + "\n\n可驗證來源（系統擷取）:\n" + "\n".join(source_lines)
                else:
                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    if isinstance(content, list):
                        raw = "\n".join(
                            part.get("text", "") for part in content if isinstance(part, dict)
                        ).strip()
                    else:
                        raw = str(content).strip()

                if not raw:
                    return "外部 API 呼叫成功，但未取得可用回覆內容。"

                return converter.convert(raw)
        except httpx.HTTPStatusError as e:
            status = e.response.status_code if e.response else "unknown"
            body = (e.response.text if e.response else str(e))

            # 若 Web Search 工具不可用，退回純文字回覆，避免整體失敗。
            if use_responses_api and use_web_search and status in (400, 404):
                try:
                    async with httpx.AsyncClient(timeout=60) as client:
                        fallback_payload = {
                            "model": model,
                            "input": [
                                {
                                    "role": "user",
                                    "content": [
                                        {"type": "input_text", "text": effective_prompt}
                                    ]
                                }
                            ],
                            "max_output_tokens": 1024
                        }
                        fallback_resp = await client.post(
                            f"{base_url}/responses",
                            headers=headers,
                            json=fallback_payload
                        )
                        fallback_resp.raise_for_status()
                        fallback_data = fallback_resp.json()
                        fallback_raw, _ = _extract_responses_text_and_sources(fallback_data)
                        if fallback_raw:
                            return converter.convert(fallback_raw)
                except Exception:
                    pass

            return f"外部 API 呼叫失敗：HTTP {status} - {body[:1000]}"
        except Exception as e:
            return f"外部 API 呼叫失敗：{str(e)}"

    else:
        # 使用本地 Ollama
        from app.services.llm.ollama_client import OllamaClient
        client = OllamaClient()
        return await client.generate(prompt)
