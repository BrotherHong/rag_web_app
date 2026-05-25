"""
查詢使用者（QueryUser）管理測試

涵蓋範圍：
- Super Admin 直接建立 QueryUser（不需走申請流程）
- 未認證無法建立 QueryUser（401）
- 停用（suspend）與啟用（activate）QueryUser
"""
import pytest
from httpx import AsyncClient

from app.models import User, Department, QueryUser, QueryUserStatus
from app.core.security import get_password_hash


class TestQueryUserCreate:
    async def test_create_query_user(
        self, client: AsyncClient, test_super_admin: User, super_admin_headers: dict,
        test_department: Department
    ):
        """Super Admin 直接建立 QueryUser，應回傳正確 username"""
        response = await client.post("/api/query-users/create", json={
            "username": "created_quser",
            "email": "created@test.com",
            "password": "password123",
            "full_name": "Created User",
            "default_department_id": test_department.id,
        }, headers=super_admin_headers)
        assert response.status_code in [200, 201]
        assert response.json()["username"] == "created_quser"

    async def test_create_unauthenticated(self, client: AsyncClient, test_department: Department):
        """未認證建立 QueryUser 應回傳 401"""
        response = await client.post("/api/query-users/create", json={
            "username": "x", "email": "x@x.com", "password": "abc123", "full_name": "X"
        })
        assert response.status_code == 401


class TestQueryUserSuspendActivate:
    async def test_suspend(
        self, client: AsyncClient, test_super_admin: User, super_admin_headers: dict, test_query_user: QueryUser
    ):
        """Super Admin 停用 QueryUser，應回傳 200"""
        response = await client.post(f"/api/query-users/{test_query_user.id}/suspend", headers=super_admin_headers)
        assert response.status_code == 200

    async def test_activate(
        self, client: AsyncClient, test_super_admin: User, super_admin_headers: dict, test_query_user: QueryUser
    ):
        """Super Admin 停用再啟用 QueryUser，啟用應回傳 200"""
        response = await client.post(f"/api/query-users/{test_query_user.id}/activate", headers=super_admin_headers)
        assert response.status_code == 200

