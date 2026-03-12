import datetime
import io
import zipfile

import pytest

# Use a unique prefix for test data to identify/cleanup
TEST_PREFIX = "[IntegrationTest]"


def generate_title(base):
    return f"{TEST_PREFIX} {base} {datetime.datetime.now().isoformat()}"


class TestHealthCheck:
    def test_health_check(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


class TestFoldersIntegration:
    @pytest.fixture
    def test_folder(self, client):
        """Fixture that creates a folder and deletes it after test."""
        title = generate_title("Folder")
        response = client.post("/api/folders", json={"name": title})
        assert response.status_code == 201
        folder = response.json()
        yield folder

        # Cleanup
        client.delete(f"/api/folders/{folder['id']}")

    def test_create_and_list_folders(self, client):
        title = generate_title("My Folder")
        # Create
        response = client.post("/api/folders", json={"name": title})
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == title
        folder_id = data["id"]

        # List
        response = client.get("/api/folders")
        assert response.status_code == 200
        folders = response.json()
        assert any(f["id"] == folder_id for f in folders)

        # Delete
        response = client.delete(f"/api/folders/{folder_id}")
        assert response.status_code == 204

        # Verify Delete
        response = client.get(f"/api/folders/{folder_id}")
        assert response.status_code == 404

    def test_update_folder(self, client, test_folder):
        new_name = generate_title("Updated Folder")
        response = client.patch(
            f"/api/folders/{test_folder['id']}", json={"name": new_name}
        )
        assert response.status_code == 200
        assert response.json()["name"] == new_name

        # Verify Get
        response = client.get(f"/api/folders/{test_folder['id']}")
        assert response.status_code == 200
        assert response.json()["name"] == new_name


class TestNotesIntegration:
    @pytest.fixture
    def test_note(self, client):
        """Fixture that creates a note and deletes it after test."""
        title = generate_title("Note")
        response = client.post(
            "/api/notes", json={"title": title, "content": "Test content"}
        )
        assert response.status_code == 201
        note = response.json()
        yield note

        # Cleanup
        client.delete(f"/api/notes/{note['id']}")

    def test_create_and_list_notes(self, client):
        title = generate_title("My Note")
        content = "This is integration test content."

        # Create
        response = client.post("/api/notes", json={"title": title, "content": content})
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == title
        assert data["content"] == content
        note_id = data["id"]

        # List
        response = client.get("/api/notes")
        assert response.status_code == 200
        notes = response.json()
        assert any(n["id"] == note_id for n in notes)

        # Get
        response = client.get(f"/api/notes/{note_id}")
        assert response.status_code == 200
        assert response.json()["title"] == title

        # Delete
        response = client.delete(f"/api/notes/{note_id}")
        assert response.status_code == 204

        # Verify Delete
        response = client.get(f"/api/notes/{note_id}")
        assert response.status_code == 404

    def test_update_note(self, client, test_note):
        new_title = generate_title("Updated Note")
        new_content = "Updated content"

        response = client.patch(
            f"/api/notes/{test_note['id']}",
            json={"title": new_title, "content": new_content},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == new_title
        assert data["content"] == new_content

    def test_note_in_folder(self, client):
        # Create Folder
        f_title = generate_title("Folder for Note")
        f_resp = client.post("/api/folders", json={"name": f_title})
        folder_id = f_resp.json()["id"]

        try:
            # Create Note in Folder
            n_title = generate_title("Note in Folder")
            n_resp = client.post(
                "/api/notes", json={"title": n_title, "folder_id": folder_id}
            )
            assert n_resp.status_code == 201
            note_id = n_resp.json()["id"]
            assert n_resp.json()["folder_id"] == folder_id

            # List Filtered
            response = client.get(f"/api/notes?folder_id={folder_id}")
            assert response.status_code == 200
            notes = response.json()
            assert len(notes) >= 1
            assert any(n["id"] == note_id for n in notes)

            # Move Note out of folder
            response = client.patch(f"/api/notes/{note_id}", json={"folder_id": None})
            assert response.status_code == 200
            assert response.json()["folder_id"] is None

            # Cleanup Note
            client.delete(f"/api/notes/{note_id}")

        finally:
            # Cleanup Folder
            client.delete(f"/api/folders/{folder_id}")


class TestSettingsIntegration:
    def test_get_settings(self, client):
        response = client.get("/api/settings")
        # Settings might not exist yet, so 200 (default) or 404 handled?
        # Checking router: logic handles getting or creating default?
        assert response.status_code == 200

    def test_update_settings(self, client):
        # Get current settings
        resp = client.get("/api/settings")
        assert resp.status_code == 200
        data = resp.json()
        original_model_id = data["settings"]["llm_model_id"]
        original_language = data["settings"]["language"]

        # Pick a valid model_id different from the current one if possible
        available_models = data["available_models"]
        assert len(available_models) > 0
        new_model_id = next(
            (m["id"] for m in available_models if m["id"] != original_model_id),
            available_models[0]["id"],
        )
        new_language = "en" if original_language != "en" else "ja"

        # Update settings
        update_resp = client.put(
            "/api/settings",
            json={"llm_model_id": new_model_id, "language": new_language},
        )
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["settings"]["llm_model_id"] == new_model_id
        assert updated["settings"]["language"] == new_language

        # Restore original settings
        restore_resp = client.put(
            "/api/settings",
            json={"llm_model_id": original_model_id, "language": original_language},
        )
        assert restore_resp.status_code == 200
        restored = restore_resp.json()
        assert restored["settings"]["llm_model_id"] == original_model_id
        assert restored["settings"]["language"] == original_language


class TestNotesExport:
    def test_export_all_notes(self, client):
        # Create a folder
        folder_title = generate_title("Export Folder")
        folder_resp = client.post("/api/folders", json={"name": folder_title})
        assert folder_resp.status_code == 201
        folder_id = folder_resp.json()["id"]

        # Create a note inside the folder
        note1_title = generate_title("Export Note In Folder")
        note1_resp = client.post(
            "/api/notes",
            json={
                "title": note1_title,
                "content": "Content in folder",
                "folder_id": folder_id,
            },
        )
        assert note1_resp.status_code == 201
        note1_id = note1_resp.json()["id"]

        # Create a note without a folder
        note2_title = generate_title("Export Note No Folder")
        note2_resp = client.post(
            "/api/notes",
            json={"title": note2_title, "content": "Content no folder"},
        )
        assert note2_resp.status_code == 201
        note2_id = note2_resp.json()["id"]

        try:
            # Call the export endpoint
            response = client.get("/api/notes/export/all")
            assert response.status_code == 200

            # Verify Content-Type contains zip
            content_type = response.headers.get("content-type", "")
            assert "zip" in content_type

            # Verify response body is non-empty bytes and a valid ZIP
            assert len(response.content) > 0
            zip_buffer = io.BytesIO(response.content)
            assert zipfile.is_zipfile(zip_buffer)

        finally:
            # Cleanup notes and folder
            client.delete(f"/api/notes/{note1_id}")
            client.delete(f"/api/notes/{note2_id}")
            client.delete(f"/api/folders/{folder_id}")
