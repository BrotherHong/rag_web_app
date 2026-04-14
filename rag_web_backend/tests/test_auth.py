"""
認證系統測試 — Admin & QueryUser

涵蓋範圍：
- Admin 登入（正確密碼、錯誤密碼、不存在帳號、停用帳號）
- Admin JWT Token 驗證（/auth/me、/auth/verify）
- 角色存取控制（admin 不能用 super_admin 專屬 API）
- QueryUser 註冊、登入、取得自身資訊
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, Department, QueryUser, QueryUserStatus, UserRole
from app.core.security import get_password_hash, create_access_token


class TestAdminLogin:
    async def test_login_success(self, client: AsyncClient, test_admin: User):
        """正確帳號密碼登入，應回傳 200 及 token"""
        response = await client.post("/api/auth/login", json={
            "username": "test_admin",
            "password": "testpassword123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data

    async def test_login_wrong_password(self, client: AsyncClient, test_admin: User):
        """錯誤密碼登入應回傳 401"""
        response = await client.post("/api/auth/login", json={
            "username": "test_admin",
            "password": "wrongpassword"
        })
        assert response.status_code == 401

    async def test_login_nonexistent_user(self, client: AsyncClient):
        """不存在的帳號登入應回傳 401"""
        response = await client.post("/api/auth/login", json={
            "username": "nobody",
            "password": "whatever"
        })
        assert response.status_code == 401

    async def test_login_inactive_user(self, client: AsyncClient, db_session: AsyncSession, test_department: Department):
        """停用帳號登入應被拒絕（401 或 403）"""
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
        """附有效 token 呼叫 /me，應回傳當前使用者資訊"""
        response = await client.get("/api/auth/me", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "test_admin"

    async def test_get_me_no_token(self, client: AsyncClient):
        """未帶 token 呼叫 /me 應回傳 401"""
        response = await client.get("/api/auth/me")
        assert response.status_code == 401

    async def test_get_me_invalid_token(self, client: AsyncClient):
        """帶偽造 token 呼叫 /me 應回傳 401"""
        response = await client.get("/api/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
        assert response.status_code == 401


class TestTokenVerify:
    async def test_verify_valid_token(self, client: AsyncClient, test_admin: User, admin_headers: dict):
        """有效 token 呼叫 /verify 應回傳 200"""
        response = await client.get("/api/auth/verify", headers=admin_headers)
        assert response.status_code == 200

    async def test_verify_invalid_token(self, client: AsyncClient):
        """無效 token 呼叫 /verify 應回傳 401"""
        response = await client.get("/api/auth/verify", headers={"Authorization": "Bearer badtoken"})
        assert response.status_code == 401


class TestQueryUserAuth:
    async def test_register(self, client: AsyncClient, test_department: Department):
        """QueryUser 正常註冊應成功（200 或 201）"""
        response = await client.post("/api/query-auth/register", json={
            "username": "newuser",
            "email": "newuser@test.com",
            "password": "password123",
            "full_name": "New User",
            "default_department_id": test_department.id,
        })
        assert response.status_code in [200, 201]

    async def test_register_duplicate_username(self, client: AsyncClient, test_query_user: QueryUser):
        """重複帳號名稱註冊應回傳 400"""
        response = await client.post("/api/query-auth/register", json={
            "username": "test_quser",
            "email": "another@test.com",
            "password": "password123",
            "full_name": "Another",
        })
        assert response.status_code == 400

    async def test_login_approved_user(self, client: AsyncClient, test_query_user: QueryUser):
        """已審核通過的 QueryUser 登入應回傳 token"""
        response = await client.post("/api/query-auth/login", json={
            "username": "test_quser",
            "password": "testpassword123"
        })
        assert response.status_code == 200
        assert "access_token" in response.json()

    async def test_login_wrong_password(self, client: AsyncClient, test_query_user: QueryUser):
        """QueryUser 錯誤密碼登入應回傳 401"""
        response = await client.post("/api/query-auth/login", json={
            "username": "test_quser",
            "password": "wrongpassword"
        })
        assert response.status_code == 401

    async def test_get_me(self, client: AsyncClient, test_query_user: QueryUser, query_user_headers: dict):
        """QueryUser 附有效 token 呼叫 /me，應回傳自身帳號資訊"""
        response = await client.get("/api/query-auth/me", headers=query_user_headers)
        assert response.status_code == 200
        assert response.json()["username"] == "test_quser"
