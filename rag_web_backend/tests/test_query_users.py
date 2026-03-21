"""Admin 管理 QueryUser 測試"""
import pytest
from httpx import AsyncClient

from app.models import User, Department, QueryUser, QueryUserStatus
from app.core.security import get_password_hash


class TestQueryUserCreate:
    async def test_create_query_user(
        self, client: AsyncClient, test_super_admin: User, super_admin_headers: dict,
        test_department: Department
    ):
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
        response = await client.post("/api/query-users/create", json={
            "username": "x", "email": "x@x.com", "password": "abc123", "full_name": "X"
        })
        assert response.status_code == 401


class TestQueryUserSuspendActivate:
    async def test_suspend(
        self, client: AsyncClient, test_super_admin: User, super_admin_headers: dict, test_query_user: QueryUser
    ):
        response = await client.post(f"/api/query-users/{test_query_user.id}/suspend", headers=super_admin_headers)
        assert response.status_code == 200

    async def test_activate(
        self, client: AsyncClient, test_super_admin: User, super_admin_headers: dict, test_query_user: QueryUser
    ):
        await client.post(f"/api/query-users/{test_query_user.id}/suspend", headers=super_admin_headers)
        response = await client.post(f"/api/query-users/{test_query_user.id}/activate", headers=super_admin_headers)
        assert response.status_code == 200

