"""認證系統測試 — Admin & QueryUser"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, Department, QueryUser, QueryUserStatus, UserRole
from app.core.security import get_password_hash, create_access_token


class TestAdminLogin:
    async def test_login_success(self, client: AsyncClient, test_admin: User):
        response = await client.post("/api/auth/login", json={
            "username": "test_admin",
            "password": "testpassword123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data

    async def test_login_wrong_password(self, client: AsyncClient, test_admin: User):
        response = await client.post("/api/auth/login", json={
            "username": "test_admin",
            "password": "wrongpassword"
        })
        assert response.status_code == 401

    async def test_login_nonexistent_user(self, client: AsyncClient):
        response = await client.post("/api/auth/login", json={
            "username": "nobody",
            "password": "whatever"
        })
        assert response.status_code == 401

    async def test_login_inactive_user(self, client: AsyncClient, db_session: AsyncSession, test_department: Department):
        inactive = User(
            username="inactive_user",
            email="inactive@test.com",
            hashed_password=get_password_hash("testpassword123"),
            full_name="Inactive",
            role=UserRole.ADMIN,
            is_active=False,
            department_id=test_department.id,
        )
        db_session.add(inactive)
        await db_session.commit()
        response = await client.post("/api/auth/login", json={
            "username": "inactive_user",
            "password": "testpassword123"
        })
        # 停用帳號無法登入
        assert response.status_code in [401, 403]


class TestAdminMe:
    async def test_get_me_success(self, client: AsyncClient, test_admin: User, admin_headers: dict):
        response = await client.get("/api/auth/me", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "test_admin"

    async def test_get_me_no_token(self, client: AsyncClient):
        response = await client.get("/api/auth/me")
        assert response.status_code == 401

    async def test_get_me_invalid_token(self, client: AsyncClient):
        response = await client.get("/api/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
        assert response.status_code == 401


class TestTokenVerify:
    async def test_verify_valid_token(self, client: AsyncClient, test_admin: User, admin_headers: dict):
        response = await client.get("/api/auth/verify", headers=admin_headers)
        assert response.status_code == 200

    async def test_verify_invalid_token(self, client: AsyncClient):
        response = await client.get("/api/auth/verify", headers={"Authorization": "Bearer badtoken"})
        assert response.status_code == 401


class TestRoleAccess:
    async def test_admin_cannot_access_superadmin_endpoint(
        self, client: AsyncClient, test_admin: User, admin_headers: dict
    ):
        # 一般 admin 不能存取 super admin 專屬功能（如建立部門）
        response = await client.post("/api/departments/", json={
            "name": "New Dept", "slug": "new-dept", "color": "#000"
        }, headers=admin_headers)
        assert response.status_code == 403

    async def test_super_admin_can_access_department(
        self, client: AsyncClient, test_super_admin: User, super_admin_headers: dict
    ):
        response = await client.post("/api/departments/", json={
            "name": "New Dept", "slug": "new-dept", "color": "#000"
        }, headers=super_admin_headers)
        assert response.status_code in [200, 201]

    async def test_unauthenticated_cannot_access_files(self, client: AsyncClient):
        response = await client.get("/api/files/")
        assert response.status_code == 401


class TestQueryUserAuth:
    async def test_register(self, client: AsyncClient, test_department: Department):
        response = await client.post("/api/query-auth/register", json={
            "username": "newuser",
            "email": "newuser@test.com",
            "password": "password123",
            "full_name": "New User",
            "default_department_id": test_department.id,
        })
        assert response.status_code in [200, 201]

    async def test_register_duplicate_username(self, client: AsyncClient, test_query_user: QueryUser):
        response = await client.post("/api/query-auth/register", json={
            "username": "test_quser",
            "email": "another@test.com",
            "password": "password123",
            "full_name": "Another",
        })
        assert response.status_code == 400

    async def test_login_approved_user(self, client: AsyncClient, test_query_user: QueryUser):
        response = await client.post("/api/query-auth/login", json={
            "username": "test_quser",
            "password": "testpassword123"
        })
        assert response.status_code == 200
        assert "access_token" in response.json()

    async def test_login_wrong_password(self, client: AsyncClient, test_query_user: QueryUser):
        response = await client.post("/api/query-auth/login", json={
            "username": "test_quser",
            "password": "wrongpassword"
        })
        assert response.status_code == 401

    async def test_get_me(self, client: AsyncClient, test_query_user: QueryUser, query_user_headers: dict):
        response = await client.get("/api/query-auth/me", headers=query_user_headers)
        assert response.status_code == 200
        assert response.json()["username"] == "test_quser"

    async def test_check_username_available(self, client: AsyncClient):
        response = await client.get("/api/query-auth/check-username/brandnewuser")
        assert response.status_code == 200
        data = response.json()
        assert data.get("available") is True

    async def test_check_username_taken(self, client: AsyncClient, test_query_user: QueryUser):
        response = await client.get("/api/query-auth/check-username/test_quser")
        assert response.status_code == 200
        assert response.json().get("available") is False
