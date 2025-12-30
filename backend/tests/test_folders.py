"""Tests for folders API endpoints."""

from fastapi.testclient import TestClient

from tests.conftest import TEST_USER_ID


class TestListFolders:
    """Tests for GET /api/folders/"""

    def test_list_folders_empty(self, client: TestClient):
        """Test listing folders when none exist."""
        response = client.get("/api/folders")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_folders(self, client: TestClient):
        """Test listing folders after creating some."""
        # Create folders
        client.post("/api/folders", json={"name": "Folder 1"})
        client.post("/api/folders", json={"name": "Folder 2"})

        response = client.get("/api/folders")
        assert response.status_code == 200
        folders = response.json()
        assert len(folders) == 2


class TestCreateFolder:
    """Tests for POST /api/folders/"""

    def test_create_folder(self, client: TestClient):
        """Test creating a folder."""
        response = client.post("/api/folders", json={"name": "My Folder"})

        assert response.status_code == 201
        folder = response.json()
        assert folder["name"] == "My Folder"
        assert folder["user_id"] == TEST_USER_ID
        assert "id" in folder
        assert "created_at" in folder
        assert "updated_at" in folder


class TestGetFolder:
    """Tests for GET /api/folders/{folder_id}"""

    def test_get_folder(self, client: TestClient):
        """Test getting a specific folder."""
        # Create a folder
        create_response = client.post("/api/folders", json={"name": "Test"})
        folder_id = create_response.json()["id"]

        response = client.get(f"/api/folders/{folder_id}")
        assert response.status_code == 200
        assert response.json()["name"] == "Test"

    def test_get_folder_not_found(self, client: TestClient):
        """Test getting a non-existent folder."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = client.get(f"/api/folders/{fake_id}")
        assert response.status_code == 404


class TestUpdateFolder:
    """Tests for PATCH /api/folders/{folder_id}"""

    def test_update_folder(self, client: TestClient):
        """Test updating a folder."""
        # Create a folder
        create_response = client.post("/api/folders", json={"name": "Original"})
        folder_id = create_response.json()["id"]

        response = client.patch(
            f"/api/folders/{folder_id}",
            json={"name": "Updated"},
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Updated"

    def test_update_folder_not_found(self, client: TestClient):
        """Test updating a non-existent folder."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = client.patch(f"/api/folders/{fake_id}", json={"name": "New"})
        assert response.status_code == 404


class TestDeleteFolder:
    """Tests for DELETE /api/folders/{folder_id}"""

    def test_delete_folder(self, client: TestClient):
        """Test deleting a folder."""
        # Create a folder
        create_response = client.post("/api/folders", json={"name": "ToDelete"})
        folder_id = create_response.json()["id"]

        response = client.delete(f"/api/folders/{folder_id}")
        assert response.status_code == 204

        # Verify it's deleted
        get_response = client.get(f"/api/folders/{folder_id}")
        assert get_response.status_code == 404

    def test_delete_folder_not_found(self, client: TestClient):
        """Test deleting a non-existent folder."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = client.delete(f"/api/folders/{fake_id}")
        assert response.status_code == 404


class TestFolderAuthorization:
    """Tests for folder authorization (user isolation)."""

    def test_cannot_access_other_users_folder(self, make_client):
        """Test that users cannot access other users' folders."""
        # Create folder as test user
        client = make_client(TEST_USER_ID)
        create_response = client.post("/api/folders", json={"name": "Private"})
        folder_id = create_response.json()["id"]

        # Try to access as other user
        other_client = make_client("other-user-456")
        response = other_client.get(f"/api/folders/{folder_id}")
        assert response.status_code == 404

    def test_cannot_update_other_users_folder(self, make_client):
        """Test that users cannot update other users' folders."""
        client = make_client(TEST_USER_ID)
        create_response = client.post("/api/folders", json={"name": "Private"})
        folder_id = create_response.json()["id"]

        other_client = make_client("other-user-456")
        response = other_client.patch(
            f"/api/folders/{folder_id}",
            json={"name": "Hacked"},
        )
        assert response.status_code == 404

    def test_cannot_delete_other_users_folder(self, make_client):
        """Test that users cannot delete other users' folders."""
        client = make_client(TEST_USER_ID)
        create_response = client.post("/api/folders", json={"name": "Private"})
        folder_id = create_response.json()["id"]

        other_client = make_client("other-user-456")
        response = other_client.delete(f"/api/folders/{folder_id}")
        assert response.status_code == 404
