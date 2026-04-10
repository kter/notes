"""Tests for user API key management and external CRUD access."""

from collections.abc import Generator
from contextlib import contextmanager

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.auth import UserApiKeyService
from app.database import get_session
from app.main import app
from app.models import Folder, UserApiKey, UserApiKeyCreate


@contextmanager
def _make_external_client(session: Session) -> Generator[TestClient, None, None]:
    def get_session_override():
        yield session

    app.dependency_overrides.clear()
    app.dependency_overrides[get_session] = get_session_override

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()


class TestApiKeyManagement:
    def test_create_api_key_returns_secret_once_and_stores_hash(
        self, client, session: Session
    ):
        response = client.post("/api/settings/api-keys", json={"name": "CLI key"})

        assert response.status_code == 201
        data = response.json()
        assert data["api_key"]["name"] == "CLI key"
        assert data["api_key"]["token_prefix"] == data["token_plain"][:16]
        assert data["token_plain"].startswith("notes_")

        stored_key = session.exec(select(UserApiKey)).one()
        assert stored_key.name == "CLI key"
        assert stored_key.token_hash != data["token_plain"]
        assert stored_key.token_prefix == data["api_key"]["token_prefix"]

        list_response = client.get("/api/settings/api-keys")
        assert list_response.status_code == 200
        assert list_response.json() == [data["api_key"]]

    def test_revoke_api_key_removes_it_from_active_list(self, client, session: Session):
        created = client.post("/api/settings/api-keys", json={"name": "Temp key"})
        assert created.status_code == 201
        key_id = created.json()["api_key"]["id"]
        token_plain = created.json()["token_plain"]

        delete_response = client.delete(f"/api/settings/api-keys/{key_id}")
        assert delete_response.status_code == 204

        list_response = client.get("/api/settings/api-keys")
        assert list_response.status_code == 200
        assert list_response.json() == []

        with _make_external_client(session) as external_client:
            folders_response = external_client.get(
                "/api/folders",
                headers={"X-API-Key": token_plain},
            )
            assert folders_response.status_code == 401


class TestApiKeyCrudAccess:
    def test_api_key_can_perform_folder_and_note_crud(self, session: Session):
        _, token_plain = UserApiKeyService(session).create_key(
            "test-user-123",
            UserApiKeyCreate(name="External app"),
        )
        headers = {"X-API-Key": token_plain}

        with _make_external_client(session) as external_client:
            create_folder = external_client.post(
                "/api/folders",
                json={"name": "External Folder"},
                headers=headers,
            )
            assert create_folder.status_code == 201
            folder_id = create_folder.json()["id"]

            list_folders = external_client.get("/api/folders", headers=headers)
            assert list_folders.status_code == 200
            assert [item["name"] for item in list_folders.json()] == ["External Folder"]

            rename_folder = external_client.patch(
                f"/api/folders/{folder_id}",
                json={"name": "Renamed Folder"},
                headers=headers,
            )
            assert rename_folder.status_code == 200
            assert rename_folder.json()["name"] == "Renamed Folder"

            create_note = external_client.post(
                "/api/notes",
                json={
                    "title": "External Note",
                    "content": "Created over API key",
                    "folder_id": folder_id,
                },
                headers=headers,
            )
            assert create_note.status_code == 201
            note_id = create_note.json()["id"]

            list_notes = external_client.get(
                f"/api/notes?folder_id={folder_id}",
                headers=headers,
            )
            assert list_notes.status_code == 200
            assert [item["title"] for item in list_notes.json()] == ["External Note"]

            update_note = external_client.patch(
                f"/api/notes/{note_id}",
                json={"title": "Updated External Note"},
                headers=headers,
            )
            assert update_note.status_code == 200
            assert update_note.json()["title"] == "Updated External Note"

            delete_note = external_client.delete(
                f"/api/notes/{note_id}",
                headers=headers,
            )
            delete_folder = external_client.delete(
                f"/api/folders/{folder_id}",
                headers=headers,
            )
            assert delete_note.status_code == 204
            assert delete_folder.status_code == 204

    def test_api_key_remains_user_scoped(self, session: Session):
        _, token_plain = UserApiKeyService(session).create_key(
            "test-user-123",
            UserApiKeyCreate(name="Scoped key"),
        )
        session.add(Folder(user_id="other-user", name="Other Folder"))
        session.commit()

        with _make_external_client(session) as external_client:
            folders_response = external_client.get(
                "/api/folders",
                headers={"X-API-Key": token_plain},
            )
            assert folders_response.status_code == 200
            assert folders_response.json() == []

    def test_non_crud_routes_do_not_accept_api_key(self, session: Session):
        _, token_plain = UserApiKeyService(session).create_key(
            "test-user-123",
            UserApiKeyCreate(name="Limited key"),
        )
        headers = {"X-API-Key": token_plain}

        with _make_external_client(session) as external_client:
            snapshot_response = external_client.get(
                "/api/workspace/snapshot", headers=headers
            )
            export_response = external_client.get(
                "/api/notes/export/all", headers=headers
            )

            assert snapshot_response.status_code == 401
            assert export_response.status_code == 401
