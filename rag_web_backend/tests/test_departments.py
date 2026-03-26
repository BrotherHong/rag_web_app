"""部門 CRUD 測試"""
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, User
from app.models.user_group import UserGroup


class TestDepartmentList:
    async def test_list_as_admin(
        self, client: AsyncClient, test_admin: User, admin_headers: dict, test_department: Department
    ):
        response = await client.get("/api/departments/", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        items = data["items"] if isinstance(data, dict) else data
        assert any(d["slug"] == "test-dept" for d in items)


class TestDepartmentCreate:
    async def test_create_as_super_admin(
        self, client: AsyncClient, test_super_admin: User, super_admin_headers: dict
    ):
        response = await client.post("/api/departments/", json={
            "name": "新部門", "slug": "new-dept", "color": "#EF4444"
        }, headers=super_admin_headers)
        assert response.status_code in [200, 201]
        assert response.json()["slug"] == "new-dept"

    async def test_create_forbidden_for_admin(
        self, client: AsyncClient, test_admin: User, admin_headers: dict
    ):
        response = await client.post("/api/departments/", json={
            "name": "Forbidden", "slug": "forbidden", "color": "#000"
        }, headers=admin_headers)
        assert response.status_code == 403

    async def test_create_with_custom_login_methods(
        self,
        client: AsyncClient,
        test_super_admin: User,
        super_admin_headers: dict,
        db_session: AsyncSession,
    ):
        response = await client.post(
            "/api/departments/",
            json={
                "name": "Google 部門",
                "slug": "google-only",
                "color": "#4285F4",
                "login_methods": ["google"],
            },
            headers=super_admin_headers,
        )
        assert response.status_code in [200, 201]
        data = response.json()
        assert data["login_methods"] == ["google"]

        groups = (
            await db_session.execute(
                select(UserGroup).where(UserGroup.department_id == data["id"])
            )
        ).scalars().all()
        group_names = {group.name for group in groups}
        assert group_names == {"Google登入"}


class TestDepartmentDelete:
    async def test_delete_as_super_admin(
        self, client: AsyncClient, test_super_admin: User, super_admin_headers: dict,
        db_session: AsyncSession
    ):
        dept = Department(name="刪除測試", slug="delete-me", color="#000")
        db_session.add(dept)
        await db_session.commit()
        await db_session.refresh(dept)

        response = await client.delete(f"/api/departments/{dept.id}", headers=super_admin_headers)
        assert response.status_code in [200, 204]

    async def test_delete_forbidden_for_admin(
        self, client: AsyncClient, test_admin: User, admin_headers: dict, test_department: Department
    ):
        response = await client.delete(f"/api/departments/{test_department.id}", headers=admin_headers)
        assert response.status_code == 403


class TestDepartmentLoginMethods:
    async def test_admin_can_update_current_department_login_methods(
        self,
        client: AsyncClient,
        test_admin: User,
        admin_headers: dict,
        db_session: AsyncSession,
    ):
        response = await client.put(
            "/api/departments/me/login-methods",
            json={"login_methods": ["normal", "google"]},
            headers=admin_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert set(data["login_methods"]) == {"normal", "google"}

        groups = (
            await db_session.execute(
                select(UserGroup).where(UserGroup.department_id == test_admin.department_id)
            )
        ).scalars().all()
        group_names = {group.name for group in groups}
        assert group_names == {"一般登入", "Google登入"}

