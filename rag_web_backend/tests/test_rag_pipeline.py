"""RAG 完整流程 E2E 測試

測試流程：
  0. 建立 Super Admin（直接寫入正式 DB）
  1. 建立處室
  2. 建立 Admin 使用者並登入
  3. 上傳 DOCX 並觸發 Celery 處理
  4. 輪詢等待處理完成
  5. 將檔案標記為公開（QueryUser 才能查到）
  6. 建立 QueryUser 並登入
  7. 以 QueryUser 身份執行 RAG 查詢
  8. 驗證回答非空且非權限錯誤

測試結束後自動清除：
  - DB: departments、users、query_users（依固定 slug/username）
  - 磁碟: /app/uploads/{dept_id}/ 整個目錄

執行方式（需要 Ollama 服務可用，約 1-5 分鐘）：
  docker compose exec backend pytest tests/test_rag_pipeline.py -v -s -m slow
"""

import io
import os
import asyncio
import pytest
from docx import Document as DocxDocument
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text, select
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.main import app
from app.core.database import Base, get_db
from app.models import User, Department
from app.models.file import File

# E2E 測試必須使用正式 DB（與 Celery worker 相同），從 docker-compose 的環境變數重建 URL
# conftest.py 在最頂部把 DATABASE_URL 覆蓋為 rag_db_test，所以這裡直接讀原始組件
_pg_user = os.environ.get("POSTGRES_USER", "postgres")
_pg_pass = os.environ.get("POSTGRES_PASSWORD", "postgres123")
_pg_host = "postgres"
_pg_db   = os.environ.get("POSTGRES_DB", "rag_db")
PROD_DB_URL = f"postgresql+asyncpg://{_pg_user}:{_pg_pass}@{_pg_host}:5432/{_pg_db}"


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


# ── E2E 專用 fixtures（使用正式 DB，與 Celery worker 共用）──────────────────

@pytest.fixture(scope="class")
async def prod_engine():
    """E2E 測試使用正式 DB engine"""
    engine = create_async_engine(PROD_DB_URL, echo=False, poolclass=NullPool)
    yield engine
    await engine.dispose()


@pytest.fixture(scope="function")
async def e2e_client(prod_engine):
    """覆蓋 get_db 讓 FastAPI 使用正式 DB（與 Celery 同一個 DB）
    function-scoped 確保在 conftest 的 override_get_db 之後執行，正確覆寫 prod DB。
    """
    factory = async_sessionmaker(prod_engine, class_=AsyncSession, expire_on_commit=False)

    async def _prod_get_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db] = _prod_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture(scope="class")
async def e2e_db(prod_engine):
    """直接操作正式 DB 的 session"""
    factory = async_sessionmaker(prod_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest.fixture(scope="class", autouse=True)
async def cleanup_e2e_data(prod_engine):
    """E2E 測試結束後清理 DB 資料與磁碟檔案"""
    yield
    import shutil
    from pathlib import Path

    cleanup_engine = create_async_engine(PROD_DB_URL, echo=False, poolclass=NullPool)
    async with cleanup_engine.begin() as conn:
        # 先查 dept_id（CASCADE 刪除前）
        result = await conn.execute(text(
            "SELECT id FROM departments WHERE slug = 'rag-e2e-test'"
        ))
        row = result.fetchone()
        dept_id = row[0] if row else None

        await conn.execute(text("DELETE FROM departments WHERE slug = 'rag-e2e-test'"))
        await conn.execute(text(
            "DELETE FROM users WHERE username IN ('rag_e2e_admin', 'e2e_superadmin')"
        ))
        await conn.execute(text("DELETE FROM query_users WHERE username = 'e2e_quser'"))
    await cleanup_engine.dispose()

    # 清除磁碟上的 uploads/{dept_id}/ 目錄
    if dept_id:
        dept_upload_dir = Path(f"/app/uploads/{dept_id}")
        if dept_upload_dir.exists():
            shutil.rmtree(dept_upload_dir)
            print(f"\n🧹 已清除磁碟目錄: {dept_upload_dir}")


# ── 測試類別 ──────────────────────────────────────────────────────────────────

@pytest.mark.slow
class TestRAGPipeline:
    """完整 RAG 流程測試（使用正式 DB 與 Celery worker 通訊）"""

    async def test_upload_process_and_query(
        self,
        e2e_client: AsyncClient,
        e2e_db: AsyncSession,
    ):
        client = e2e_client
        db_session = e2e_db

        from app.core.security import get_password_hash
        from app.models import UserRole

        # ── Step 0: 建立 Super Admin（直接寫入正式 DB）───────────────────────
        from app.models import User as UserModel
        super_admin = UserModel(
            username="e2e_superadmin",
            email="e2e_superadmin@test.com",
            hashed_password=get_password_hash("testpassword123"),
            full_name="E2E Super Admin",
            role=UserRole.SUPER_ADMIN,
            is_active=True,
        )
        db_session.add(super_admin)
        await db_session.commit()
        await db_session.refresh(super_admin)

        sa_login = await client.post("/api/auth/login", json={
            "username": "e2e_superadmin", "password": "testpassword123"
        })
        assert sa_login.status_code == 200, f"Super Admin 登入失敗: {sa_login.text}"
        sa_headers = {"Authorization": f"Bearer {sa_login.json()['token']}"}

        # ── Step 1: 建立處室 ──────────────────────────────────────────────────
        dept_resp = await client.post("/api/departments/", json={
            "name": "RAG測試處室",
            "slug": "rag-e2e-test",
            "description": "E2E pipeline test department",
            "color": "#3B82F6",
        }, headers=sa_headers)
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
        }, headers=sa_headers)
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

        # ── Step 6: 將檔案標記為公開（QueryUser 才能查到）────────────────────
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

        # ── Step 7: 建立 QueryUser 並登入 ──────────────────────────────────
        quser_resp = await client.post("/api/query-users/create", json={
            "username": "e2e_quser",
            "email": "e2e_quser@test.com",
            "password": "testpassword123",
            "full_name": "E2E Query User",
            "default_department_id": dept_id,
        }, headers=sa_headers)
        assert quser_resp.status_code in [200, 201], f"建立 QueryUser 失敗: {quser_resp.text}"

        qlogin_resp = await client.post("/api/query-auth/login", json={
            "username": "e2e_quser",
            "password": "testpassword123",
        })
        assert qlogin_resp.status_code == 200, f"QueryUser 登入失敗: {qlogin_resp.text}"
        query_headers = {"Authorization": f"Bearer {qlogin_resp.json()['access_token']}"}
        print("✅ QueryUser 建立並登入")

        # ── Step 8: RAG 查詢（QueryUser 身份）─────────────────────────────────────
        query_resp = await client.post("/api/rag/query", json={
            "query": TEST_QUERY,
            "scope_ids": [dept_id],
        }, headers=query_headers)
        assert query_resp.status_code == 200, f"RAG 查詢失敗: {query_resp.text}"

        data = query_resp.json()
        answer = data.get("answer", "")
        sources = data.get("sources", [])

        assert answer, "RAG 回答為空"
        assert "沒有權限" not in answer, f"RAG 回答為權限錯誤：{answer}"
        print(f"\n{'='*60}")
        print(f"Query : {TEST_QUERY}")
        print(f"Answer: {answer[:400]}")
        print(f"Sources: {[s.get('file_name') for s in sources]}")
        print("="*60)
