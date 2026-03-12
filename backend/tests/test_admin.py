from fastapi.testclient import TestClient

from app.models import AppUser, Folder, MCPToken, Note, TokenUsage, UserSettings


def seed_admin_user(session, user_id: str, email: str, admin: bool = True) -> AppUser:
    user = AppUser(user_id=user_id, email=email, admin=admin)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


class TestAdminAccess:
    def test_non_admin_cannot_access_admin_api(self, client: TestClient):
        response = client.get("/api/admin/users")

        assert response.status_code == 403
        assert response.json()["detail"] == "Admin access required"


class TestAdminUserManagement:
    def test_admin_can_list_users(self, make_client, session):
        seed_admin_user(session, "admin-user", "admin@example.com", admin=True)
        seed_admin_user(session, "target-user", "member@example.com", admin=False)

        session.add(UserSettings(user_id="target-user", token_limit=123456))
        session.add(
            TokenUsage(
                user_id="target-user",
                tokens_used=321,
            )
        )
        session.add(Note(user_id="target-user", title="Admin test"))
        session.add(Folder(user_id="target-user", name="Admin folder"))
        session.add(MCPToken(user_id="target-user", token_hash="hash", name="CLI"))
        session.commit()

        admin_client = make_client("admin-user")
        response = admin_client.get("/api/admin/users")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        target = next(
            item for item in data["users"] if item["user"]["user_id"] == "target-user"
        )
        assert target["settings"]["token_limit"] == 123456
        assert target["token_usage"]["tokens_used"] == 321
        assert target["note_count"] == 1
        assert target["folder_count"] == 1
        assert target["mcp_token_count"] == 1

    def test_admin_can_search_users(self, make_client, session):
        seed_admin_user(session, "admin-user", "admin@example.com", admin=True)
        seed_admin_user(session, "search-target", "findme@example.com", admin=False)
        seed_admin_user(session, "someone-else", "other@example.com", admin=False)

        admin_client = make_client("admin-user")
        response = admin_client.get("/api/admin/users?q=findme")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["users"][0]["user"]["email"] == "findme@example.com"

    def test_admin_can_update_user_settings_and_admin_flag(self, make_client, session):
        seed_admin_user(session, "admin-user", "admin@example.com", admin=True)
        seed_admin_user(session, "target-user", "member@example.com", admin=False)

        admin_client = make_client("admin-user")
        response = admin_client.patch(
            "/api/admin/users/target-user",
            json={
                "admin": True,
                "token_limit": 500000,
                "language": "ja",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["user"]["admin"] is True
        assert data["settings"]["token_limit"] == 500000
        assert data["settings"]["language"] == "ja"

    def test_cannot_demote_last_admin(self, make_client, session):
        seed_admin_user(session, "admin-user", "admin@example.com", admin=True)

        admin_client = make_client("admin-user")
        response = admin_client.patch(
            "/api/admin/users/admin-user",
            json={"admin": False},
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Cannot remove the last admin user"

    def test_admin_detail_returns_default_settings_when_missing(
        self, make_client, session
    ):
        seed_admin_user(session, "admin-user", "admin@example.com", admin=True)
        seed_admin_user(session, "target-user", "member@example.com", admin=False)

        admin_client = make_client("admin-user")
        response = admin_client.get("/api/admin/users/target-user")

        assert response.status_code == 200
        data = response.json()
        assert data["settings"]["user_id"] == "target-user"
        assert data["settings"]["token_limit"] > 0
        assert data["token_usage"]["tokens_used"] == 0
