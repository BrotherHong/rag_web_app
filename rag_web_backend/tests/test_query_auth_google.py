"""Google 查詢端登入測試"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.query_user import QueryUser


class TestGoogleQueryAuth:
    async def test_google_login_creates_session_only(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ):
        settings.GOOGLE_CLIENT_ID = "test-google-client-id"

        def fake_verify_oauth2_token(_id_token, _request, _client_id):
            return {
                "iss": "https://accounts.google.com",
                "sub": "google-sub-123",
                "email": "google.user@ncku.edu.tw",
                "name": "Google User",
                "email_verified": True,
                "iat": 1710000000,
            }

        monkeypatch.setattr(
            "app.api.query_auth.google_id_token.verify_oauth2_token",
            fake_verify_oauth2_token,
        )

        response = await client.post(
            "/api/query-auth/google-login",
            json={"id_token": "fake-google-id-token"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["token_type"] == "bearer"
        assert data["user"]["auth_provider"] == "google"
        assert data["user"]["is_managed_user"] is False
        assert data["user"]["email"] == "google.user@ncku.edu.tw"

        result = await db_session.execute(
            select(QueryUser).where(QueryUser.email == "google.user@ncku.edu.tw")
        )
        assert result.scalar_one_or_none() is None

    async def test_google_login_token_can_call_me(
        self,
        client: AsyncClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        settings.GOOGLE_CLIENT_ID = "test-google-client-id"

        def fake_verify_oauth2_token(_id_token, _request, _client_id):
            return {
                "iss": "https://accounts.google.com",
                "sub": "google-sub-456",
                "email": "another.user@ncku.edu.tw",
                "name": "Another User",
                "email_verified": True,
                "iat": 1710000100,
            }

        monkeypatch.setattr(
            "app.api.query_auth.google_id_token.verify_oauth2_token",
            fake_verify_oauth2_token,
        )

        login_response = await client.post(
            "/api/query-auth/google-login",
            json={"id_token": "fake-google-id-token-2"},
        )
        assert login_response.status_code == 200
        access_token = login_response.json()["access_token"]

        me_response = await client.get(
            "/api/query-auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        assert me_response.status_code == 200

        me_data = me_response.json()
        assert me_data["auth_provider"] == "google"
        assert me_data["is_managed_user"] is False
        assert me_data["email"] == "another.user@ncku.edu.tw"
