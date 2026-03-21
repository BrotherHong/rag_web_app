"""FAQ CRUD 及公開列表測試"""
import pytest
from httpx import AsyncClient

from app.models import User, Department, FAQ


@pytest.fixture
async def test_faq(db_session, test_department: Department) -> FAQ:
    faq = FAQ(
        department_id=test_department.id,
        category="general",
        question="這是測試問題？",
        answer="這是測試答案。",
        description="測試描述",
        icon="❓",
        order=1,
        is_active=True,
    )
    db_session.add(faq)
    await db_session.commit()
    await db_session.refresh(faq)
    return faq


class TestFaqList:
    async def test_list_faqs(
        self, client: AsyncClient, test_admin: User, admin_headers: dict, test_faq: FAQ
    ):
        response = await client.get("/api/faqs/", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        items = data.get("items", data) if isinstance(data, dict) else data
        assert any(f["question"] == "這是測試問題？" for f in items)

    async def test_list_unauthenticated(self, client: AsyncClient):
        response = await client.get("/api/faqs/")
        assert response.status_code == 401


class TestFaqCreate:
    async def test_create_faq(
        self, client: AsyncClient, test_admin: User, admin_headers: dict,
        test_department: Department
    ):
        response = await client.post("/api/faqs/", json={
            "department_id": test_department.id,
            "category": "hr",
            "question": "如何請假？",
            "answer": "請填寫請假單。",
            "description": "請假相關",
            "icon": "📅",
            "order": 1,
            "is_active": True,
        }, headers=admin_headers)
        assert response.status_code in [200, 201]
        resp = response.json()
        data = resp.get("data", resp) if isinstance(resp, dict) and "data" in resp else resp
        assert data["question"] == "如何請假？"


class TestFaqToggle:
    async def test_toggle_status(
        self, client: AsyncClient, test_admin: User, admin_headers: dict, test_faq: FAQ
    ):
        response = await client.patch(f"/api/faqs/{test_faq.id}/toggle", json={"is_active": False}, headers=admin_headers)
        assert response.status_code == 200
        resp = response.json()
        data = resp.get("data", resp) if isinstance(resp, dict) and "data" in resp else resp
        assert data["is_active"] == False


class TestFaqPublic:
    async def test_public_faq_list(self, client: AsyncClient, test_faq: FAQ, test_department):
        response = await client.get(f"/api/faq/list?department_id={test_department.id}")
        assert response.status_code == 200
        assert response.json()["total"] >= 1

