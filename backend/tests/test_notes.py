"""Tests for notes API endpoints."""

from fastapi.testclient import TestClient

from tests.conftest import TEST_USER_ID


class TestListNotes:
    """Tests for GET /api/notes/"""

    def test_list_notes_empty(self, client: TestClient):
        """Test listing notes when none exist."""
        response = client.get("/api/notes/")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_notes(self, client: TestClient):
        """Test listing notes after creating some."""
        client.post("/api/notes/", json={"title": "Note 1", "content": "Content 1"})
        client.post("/api/notes/", json={"title": "Note 2", "content": "Content 2"})

        response = client.get("/api/notes/")
        assert response.status_code == 200
        notes = response.json()
        assert len(notes) == 2

    def test_list_notes_filter_by_folder(self, client: TestClient):
        """Test filtering notes by folder_id."""
        # Create a folder
        folder_response = client.post("/api/folders/", json={"name": "My Folder"})
        folder_id = folder_response.json()["id"]

        # Create notes
        client.post("/api/notes/", json={"title": "In Folder", "folder_id": folder_id})
        client.post("/api/notes/", json={"title": "No Folder"})

        # Filter by folder
        response = client.get(f"/api/notes/?folder_id={folder_id}")
        assert response.status_code == 200
        notes = response.json()
        assert len(notes) == 1
        assert notes[0]["title"] == "In Folder"


class TestCreateNote:
    """Tests for POST /api/notes/"""

    def test_create_note_minimal(self, client: TestClient):
        """Test creating a note with minimal data."""
        response = client.post("/api/notes/", json={})
        
        assert response.status_code == 201
        note = response.json()
        assert note["title"] == ""
        assert note["content"] == ""
        assert note["user_id"] == TEST_USER_ID
        assert note["folder_id"] is None

    def test_create_note_full(self, client: TestClient):
        """Test creating a note with all fields."""
        # Create a folder first
        folder_response = client.post("/api/folders/", json={"name": "Folder"})
        folder_id = folder_response.json()["id"]

        response = client.post(
            "/api/notes/",
            json={"title": "My Note", "content": "Hello World", "folder_id": folder_id},
        )
        
        assert response.status_code == 201
        note = response.json()
        assert note["title"] == "My Note"
        assert note["content"] == "Hello World"
        assert note["folder_id"] == folder_id


class TestGetNote:
    """Tests for GET /api/notes/{note_id}"""

    def test_get_note(self, client: TestClient):
        """Test getting a specific note."""
        create_response = client.post(
            "/api/notes/", json={"title": "Test", "content": "Content"}
        )
        note_id = create_response.json()["id"]

        response = client.get(f"/api/notes/{note_id}")
        assert response.status_code == 200
        assert response.json()["title"] == "Test"

    def test_get_note_not_found(self, client: TestClient):
        """Test getting a non-existent note."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = client.get(f"/api/notes/{fake_id}")
        assert response.status_code == 404


class TestUpdateNote:
    """Tests for PATCH /api/notes/{note_id}"""

    def test_update_note_title(self, client: TestClient):
        """Test updating note title."""
        create_response = client.post(
            "/api/notes/", json={"title": "Original", "content": "Content"}
        )
        note_id = create_response.json()["id"]

        response = client.patch(f"/api/notes/{note_id}", json={"title": "Updated"})
        assert response.status_code == 200
        assert response.json()["title"] == "Updated"
        assert response.json()["content"] == "Content"  # unchanged

    def test_update_note_content(self, client: TestClient):
        """Test updating note content."""
        create_response = client.post(
            "/api/notes/", json={"title": "Title", "content": "Old"}
        )
        note_id = create_response.json()["id"]

        response = client.patch(f"/api/notes/{note_id}", json={"content": "New"})
        assert response.status_code == 200
        assert response.json()["content"] == "New"
        assert response.json()["title"] == "Title"  # unchanged

    def test_update_note_folder(self, client: TestClient):
        """Test moving note to a folder."""
        # Create folder and note
        folder_response = client.post("/api/folders/", json={"name": "Folder"})
        folder_id = folder_response.json()["id"]
        
        create_response = client.post("/api/notes/", json={"title": "Note"})
        note_id = create_response.json()["id"]

        response = client.patch(
            f"/api/notes/{note_id}", json={"folder_id": folder_id}
        )
        assert response.status_code == 200
        assert response.json()["folder_id"] == folder_id

    def test_update_note_not_found(self, client: TestClient):
        """Test updating a non-existent note."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = client.patch(f"/api/notes/{fake_id}", json={"title": "New"})
        assert response.status_code == 404


class TestDeleteNote:
    """Tests for DELETE /api/notes/{note_id}"""

    def test_delete_note(self, client: TestClient):
        """Test deleting a note."""
        create_response = client.post("/api/notes/", json={"title": "ToDelete"})
        note_id = create_response.json()["id"]

        response = client.delete(f"/api/notes/{note_id}")
        assert response.status_code == 204

        # Verify it's deleted
        get_response = client.get(f"/api/notes/{note_id}")
        assert get_response.status_code == 404

    def test_delete_note_not_found(self, client: TestClient):
        """Test deleting a non-existent note."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = client.delete(f"/api/notes/{fake_id}")
        assert response.status_code == 404


class TestNoteAuthorization:
    """Tests for note authorization (user isolation)."""

    def test_cannot_access_other_users_note(self, make_client):
        """Test that users cannot access other users' notes."""
        client = make_client(TEST_USER_ID)
        create_response = client.post("/api/notes/", json={"title": "Private"})
        note_id = create_response.json()["id"]

        other_client = make_client("other-user-456")
        response = other_client.get(f"/api/notes/{note_id}")
        assert response.status_code == 404

    def test_cannot_update_other_users_note(self, make_client):
        """Test that users cannot update other users' notes."""
        client = make_client(TEST_USER_ID)
        create_response = client.post("/api/notes/", json={"title": "Private"})
        note_id = create_response.json()["id"]

        other_client = make_client("other-user-456")
        response = other_client.patch(
            f"/api/notes/{note_id}",
            json={"title": "Hacked"},
        )
        assert response.status_code == 404

    def test_cannot_delete_other_users_note(self, make_client):
        """Test that users cannot delete other users' notes."""
        client = make_client(TEST_USER_ID)
        create_response = client.post("/api/notes/", json={"title": "Private"})
        note_id = create_response.json()["id"]

        other_client = make_client("other-user-456")
        response = other_client.delete(f"/api/notes/{note_id}")
        assert response.status_code == 404

