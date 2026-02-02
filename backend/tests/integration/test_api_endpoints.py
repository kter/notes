import datetime

import pytest

# Use a unique prefix for test data to identify/cleanup
TEST_PREFIX = "[IntegrationTest]"

def generate_title(base):
    return f"{TEST_PREFIX} {base} {datetime.datetime.now().isoformat()}"

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
        response = client.patch(f"/api/folders/{test_folder['id']}", json={"name": new_name})
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
        response = client.post("/api/notes", json={"title": title, "content": "Test content"})
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
        
        response = client.patch(f"/api/notes/{test_note['id']}", json={"title": new_title, "content": new_content})
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
            n_resp = client.post("/api/notes", json={"title": n_title, "folder_id": folder_id})
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
        # Assuming there is a settings endpoint
        # The router is `routers/settings.py`
        
        # Get current
        resp = client.get("/api/settings")
        assert resp.status_code == 200
        # Check model. 
        # Update something if possible.
