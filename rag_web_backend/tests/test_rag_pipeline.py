"""RAG 完整流程 E2E 測試

測試流程：
  1. 建立處室
  2. 建立 admin 使用者並登入
  3. 上傳 DOCX 檔案並觸發處理
  4. 輪詢等待處理完成
  5. 標記檔案為公開
  6. 以訪客身份執行 RAG 查詢
  7. 驗證回答非空

執行方式（需要 Ollama 服務可用，約 1-5 分鐘）：
  docker compose exec backend pytest tests/test_rag_pipeline.py -v -s
"""

import io
import asyncio
import pytest
from docx import Document as DocxDocument
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, Department
from app.models.file import File

# ── 測試用文件內容 ──────────────────────────────────────────────────────────────

TEST_DOCUMENT_CONTENT = (
    "本文件說明成功學院人事室的請假申請規定。\n\n"
    "一、請假申請流程\n"
    "員工需提前三個工作天填寫請假申請單，並由直屬主管核准。\n"
    "緊急病假可於當日上班前電話通知，事後補齊相關文件。\n\n"
    "二、假別與天數\n"
    "年假：到職滿一年後享有七天，滿三年後享有十二天，滿五年後享有十四天。\n"
    "病假：每年最多三十天，需附醫師診斷書。\n"
    "事假：每次申請不得超過五個工作天，全年累計不超過十四天。\n\n"
    "三、未休年假處理\n"
    "年度結束後未休畢之年假，依規定折算薪資發給。\n"
)

TEST_QUERY = "員工請假需要提前幾天申請？"


def _create_docx_bytes(text: str) -> bytes:
    """使用 python-docx 建立最小有效的 DOCX"""
    doc = DocxDocument()
    for paragraph in text.split("\n\n"):
        doc.add_paragraph(paragraph.strip())
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()


# ── 測試類別 ──────────────────────────────────────────────────────────────────

@pytest.mark.slow
class TestRAGPipeline:
    """完整 RAG 流程測試"""

    async def test_upload_process_and_query(
        self,
        client: AsyncClient,
        test_super_admin: User,
        super_admin_headers: dict,
        db_session: AsyncSession,
    ):
        # ── Step 1: 建立處室 ──────────────────────────────────────────────────
        dept_resp = await client.post("/api/departments/", json={
            "name": "RAG測試處室",
            "slug": "rag-e2e-test",
            "description": "E2E pipeline test department",
            "color": "#3B82F6",
        }, headers=super_admin_headers)
        assert dept_resp.status_code == 201, f"建立處室失敗: {dept_resp.text}"
        dept_id = dept_resp.json()["id"]
        print(f"\n✅ 建立處室 ID={dept_id}")

        # ── Step 2: 建立 Admin 使用者 ─────────────────────────────────────────
        user_resp = await client.post("/api/users/", json={
            "username": "rag_e2e_admin",
            "email": "rag_e2e@test.com",
            "password": "testpassword123",
            "full_name": "RAG E2E Admin",
            "role": "admin",
            "department_id": dept_id,
        }, headers=super_admin_headers)
        assert user_resp.status_code in [200, 201], f"建立使用者失敗: {user_resp.text}"
        print("✅ 建立 Admin 使用者")

        # ── Step 3: 登入 ──────────────────────────────────────────────────────
        login_resp = await client.post("/api/auth/login", json={
            "username": "rag_e2e_admin",
            "password": "testpassword123",
        })
        assert login_resp.status_code == 200, f"登入失敗: {login_resp.text}"
        admin_token = login_resp.json()["token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        print("✅ 登入成功")

        # ── Step 4: 建立並上傳 DOCX ──────────────────────────────────────────
        docx_bytes = _create_docx_bytes(TEST_DOCUMENT_CONTENT)
        print(f"✅ 建立 DOCX ({len(docx_bytes)} bytes)")

        upload_resp = await client.post(
            "/api/upload/batch",
            data={
                "categories": "{}",
                "removeFileIds": "[]",
                "startProcessing": "true",
            },
            files=[(
                "files",
                (
                    "leave_policy.docx",
                    io.BytesIO(docx_bytes),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ),
            )],
            headers=admin_headers,
        )
        assert upload_resp.status_code == 200, f"上傳失敗: {upload_resp.text}"
        task_id = upload_resp.json()["taskId"]
        print(f"✅ 上傳成功，task_id={task_id}")

        # ── Step 5: 輪詢等待處理完成（最多 10 分鐘）─────────────────────────
        print("⏳ 等待背景處理（連線 Ollama，需要一些時間）...")
        final_status = None
        prog_data = {}
        for i in range(120):  # 120 × 5s = 10 分鐘
            await asyncio.sleep(5)
            prog_resp = await client.get(
                f"/api/upload/progress/{task_id}",
                headers=admin_headers,
            )
            if prog_resp.status_code == 200:
                prog_data = prog_resp.json()
                inner = prog_data.get("data", prog_data)
                final_status = inner.get("status")
                failed = inner.get("failedFiles", 0)
                total = inner.get("totalFiles", 1)
                print(f"   [{i*5:4d}s] status={final_status}, failed={failed}/{total}")
                if final_status in ("completed", "partial", "failed"):
                    break

        assert final_status == "completed", (
            f"處理未成功完成。最終狀態: {final_status}\n"
            f"進度資料: {prog_data}"
        )
        print("✅ 檔案處理完成")

        # ── Step 6: 標記檔案為公開 (訪客才能查詢) ──────────────────────────
        result = await db_session.execute(
            select(File).where(
                File.department_id == dept_id,
                File.is_vectorized == True,
            )
        )
        file_record = result.scalar_one_or_none()
        assert file_record is not None, "DB 中找不到已向量化的檔案"
        file_record.is_public = True
        await db_session.commit()
        print(f"✅ 標記檔案 '{file_record.original_filename}' 為公開")

        # ── Step 7: RAG 查詢（訪客身份，不帶 token）──────────────────────────
        query_resp = await client.post("/api/rag/query", json={
            "query": TEST_QUERY,
            "scope_ids": [dept_id],
        })
        assert query_resp.status_code == 200, f"RAG 查詢失敗: {query_resp.text}"

        data = query_resp.json()
        answer = data.get("answer", "")
        sources = data.get("sources", [])

        assert answer, "RAG 回答為空"
        print(f"\n{'='*60}")
        print(f"Query : {TEST_QUERY}")
        print(f"Answer: {answer[:400]}")
        print(f"Sources: {[s.get('file_name') for s in sources]}")
        print("="*60)
