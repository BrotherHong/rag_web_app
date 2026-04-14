"""
Admin 使用者（User）管理測試

涵蓋範圍：
- 未認證無法列出使用者
- Super Admin 建立使用者，重複帳號回 400/409
- Admin 無法建立使用者（403）
- Super Admin 刪除使用者
- Admin 無法刪除使用者（403）
"""
import pytest
from httpx import AsyncClient

from app.models import User, UserRole, Department
from app.core.security import get_password_hash


class TestUserList:
    async def test_list_unauthenticated(self, client: AsyncClient):
        """未認證存取使用者列表應回傳 401"""
        response = await client.get("/api/users/")
        assert response.status_code == 401


class TestUserCreate:
    async def test_create_user_as_super_admin(
        self, client: AsyncClient, test_super_admin: User, super_admin_headers: dict,
        test_department: Department
    ):
        """Super Admin 建立使用者應成功，回傳正確 username"""
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

    async def test_admin_can_create_user_in_own_dept(
        self, client: AsyncClient, test_admin: User, admin_headers: dict,
        test_department: Department
    ):
        """Admin 在自己處室建立使用者應成功"""
        response = await client.post("/api/users/", json={
            "username": "another",
            "email": "another@test.com",
            "password": "password123",
            "full_name": "Another",
            "role": "admin",
            "department_id": test_department.id,
        }, headers=admin_headers)
        assert response.status_code in [200, 201]

    async def test_admin_cannot_create_user_in_other_dept(
        self, client: AsyncClient, test_admin: User, admin_headers: dict,
        db_session
    ):
        """Admin 在其他處室建立使用者應被拒絕 403"""
        from app.models import Department as Dept
        other_dept = Dept(name="其他處室", slug="other-dept", color="#000")
        db_session.add(other_dept)
        await db_session.commit()
        await db_session.refresh(other_dept)

        response = await client.post("/api/users/", json={
            "username": "outsider",
            "email": "outsider@test.com",
            "password": "password123",
            "full_name": "Outsider",
            "role": "admin",
            "department_id": other_dept.id,
        }, headers=admin_headers)
        assert response.status_code == 403

    async def test_create_duplicate_username(
        self, client: AsyncClient, test_super_admin: User, super_admin_headers: dict,
        test_admin: User, test_department: Department
    ):
        """Super Admin 建立重複 username 應回傳 400 或 409"""
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
        """Super Admin 刪除使用者應成功（200 或 204）"""
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
        """Admin 刪除其他使用者應被拒絕 403"""
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



