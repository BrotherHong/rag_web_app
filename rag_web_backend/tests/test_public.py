"""
公開與系統端點測試

涵蓋範圍：
- /api/public/welcome：歡迎訊息（需 QueryUser 認證）
- /api/faq/list：常見問題公開列表（需 QueryUser 認證）
- /api/health：健康檢查（無需認證）
- /api/statistics：統計資料（需 Admin 認證）
- 停用的 FAQ 不應出現在列表中
"""
import pytest
from httpx import AsyncClient

from app.models import Department, FAQ


class TestPublicInfo:
    async def test_health_check(self, client: AsyncClient):
        """健康檢查端點無需認證，應回傳 200"""
        response = await client.get("/api/health")
        assert response.status_code == 200


class TestPublicFaq:
    async def test_faq_list_empty(self, client: AsyncClient, test_department: Department,
                                  test_query_user, query_user_headers: dict):
        """處室尚無 FAQ 時，公開列表應回傳 total=0、data=[]"""
        response = await client.get(
            f"/api/faq/list?department_id={test_department.id}",
            headers=query_user_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["data"] == []

    async def test_faq_list_with_data(self, client: AsyncClient, db_session, test_department: Department,
                                      test_query_user, query_user_headers: dict):
        """新增已啟用的 FAQ 後，公開列表應可查詢到該筆"""
        faq = FAQ(
            department_id=test_department.id,
            category="general",
            question="公開的問題",
            answer="公開的答案",
            description="",
            icon="❓",
            order=1,
            is_active=True,
        )
        db_session.add(faq)
        await db_session.commit()

        response = await client.get(
            f"/api/faq/list?department_id={test_department.id}",
            headers=query_user_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert any(f["question"] == "公開的問題" for f in data["data"])

    async def test_inactive_faq_not_in_public_list(self, client: AsyncClient, db_session,
                                                    test_department: Department,
                                                    test_query_user, query_user_headers: dict):
        """停用的 FAQ 不應出現在公開列表中"""
        faq = FAQ(
            department_id=test_department.id,
            category="general",
            question="停用的問題",
            answer="停用的答案",
            description="",
            icon="❓",
            order=1,
            is_active=False,
        )
        db_session.add(faq)
        await db_session.commit()

        response = await client.get(
            f"/api/faq/list?department_id={test_department.id}",
            headers=query_user_headers,
        )
        assert response.status_code == 200
        data = response.json()
        questions = [f["question"] for f in data["data"]]
        assert "停用的問題" not in questions
