"""公開端點測試（不需要認證）"""
import pytest
from httpx import AsyncClient

from app.models import Department, FAQ


class TestPublicInfo:
    async def test_public_welcome(self, client: AsyncClient):
        response = await client.get("/api/public/welcome")
        assert response.status_code == 200

    async def test_public_info(self, client: AsyncClient):
        response = await client.get("/api/public/info")
        assert response.status_code == 200

    async def test_health_check(self, client: AsyncClient):
        response = await client.get("/api/health")
        assert response.status_code == 200


class TestPublicFaq:
    async def test_faq_list_requires_department_id(self, client: AsyncClient):
        # department_id 是必要參數，不帶應回傳 422
        response = await client.get("/api/faq/list")
        assert response.status_code == 422

    async def test_faq_list_empty(self, client: AsyncClient, test_department: Department):
        response = await client.get(f"/api/faq/list?department_id={test_department.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["data"] == []

    async def test_faq_list_with_data(self, client: AsyncClient, db_session, test_department: Department):
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

        response = await client.get(f"/api/faq/list?department_id={test_department.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert any(f["question"] == "公開的問題" for f in data["data"])

    async def test_inactive_faq_not_in_public_list(self, client: AsyncClient, db_session, test_department: Department):
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

        response = await client.get(f"/api/faq/list?department_id={test_department.id}")
        assert response.status_code == 200
        data = response.json()
        questions = [f["question"] for f in data["data"]]
        assert "停用的問題" not in questions


class TestSystemEndpoints:
    async def test_root(self, client: AsyncClient):
        response = await client.get("/")
        assert response.status_code == 200

    async def test_statistics_requires_auth(self, client: AsyncClient):
        response = await client.get("/api/statistics")
        assert response.status_code == 401
