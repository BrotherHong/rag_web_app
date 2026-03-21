"""Admin 使用者管理測試"""
import pytest
from httpx import AsyncClient

from app.models import User, UserRole, Department
from app.core.security import get_password_hash


class TestUserList:
    async def test_list_unauthenticated(self, client: AsyncClient):
        response = await client.get("/api/users/")
        assert response.status_code == 401


class TestUserCreate:
    async def test_create_user_as_super_admin(
        self, client: AsyncClient, test_super_admin: User, super_admin_headers: dict,
        test_department: Department
    ):
        response = await client.post("/api/users/", json={
            "username": "new_admin",
            "email": "new_admin@test.com",
            "password": "password123",
            "full_name": "New Admin",
            "role": "admin",
            "department_id": test_department.id,
        }, headers=super_admin_headers)
        assert response.status_code in [200, 201]
        assert response.json()["username"] == "new_admin"

    async def test_create_user_forbidden_for_admin(
        self, client: AsyncClient, test_admin: User, admin_headers: dict,
        test_department: Department
    ):
        response = await client.post("/api/users/", json={
            "username": "another",
            "email": "another@test.com",
            "password": "password123",
            "full_name": "Another",
            "role": "admin",
            "department_id": test_department.id,
        }, headers=admin_headers)
        assert response.status_code == 403

    async def test_create_duplicate_username(
        self, client: AsyncClient, test_super_admin: User, super_admin_headers: dict,
        test_admin: User, test_department: Department
    ):
        response = await client.post("/api/users/", json={
            "username": "test_admin",  # 已存在
            "email": "different@test.com",
            "password": "password123",
            "full_name": "Dup",
            "role": "admin",
            "department_id": test_department.id,
        }, headers=super_admin_headers)
        assert response.status_code in [400, 409]


class TestUserDelete:
    async def test_delete_user_as_super_admin(
        self, client: AsyncClient, test_super_admin: User, super_admin_headers: dict,
        db_session, test_department: Department
    ):
        # 建立一個用來刪除的使用者
        user = User(
            username="to_delete_user",
            email="todelete@test.com",
            hashed_password=get_password_hash("password123"),
            full_name="To Delete",
            role=UserRole.ADMIN,
            is_active=True,
            department_id=test_department.id,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        response = await client.delete(f"/api/users/{user.id}", headers=super_admin_headers)
        assert response.status_code in [200, 204]

    async def test_delete_forbidden_for_admin(
        self, client: AsyncClient, test_admin: User, admin_headers: dict,
        db_session, test_department: Department
    ):
        user = User(
            username="another_admin",
            email="another@test.com",
            hashed_password=get_password_hash("password123"),
            full_name="Another",
            role=UserRole.ADMIN,
            is_active=True,
            department_id=test_department.id,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        response = await client.delete(f"/api/users/{user.id}", headers=admin_headers)
        assert response.status_code == 403



