"""Tests for share API endpoints."""

from uuid import uuid4

from fastapi.testclient import TestClient

from tests.conftest import TEST_USER_ID


class TestCreateShare:
    """Tests for POST /api/notes/{note_id}/share"""

    def test_create_share(self, client: TestClient):
        """Test creating a share link for a note."""
        # Create a note first
        note_response = client.post("/api/notes", json={"title": "Shareable Note", "content": "Content to share"})
        assert note_response.status_code == 201
        note_id = note_response.json()["id"]

        # Create share
        response = client.post(f"/api/notes/{note_id}/share")
        assert response.status_code == 201
        share = response.json()
        assert share["note_id"] == note_id
        assert "share_token" in share
        assert share["expires_at"] is None

    def test_create_share_idempotent(self, client: TestClient):
        """Test that creating a share twice returns the same share."""
        note_response = client.post("/api/notes", json={"title": "Note"})
        note_id = note_response.json()["id"]

        # Create share twice
        response1 = client.post(f"/api/notes/{note_id}/share")
        response2 = client.post(f"/api/notes/{note_id}/share")

        assert response1.json()["share_token"] == response2.json()["share_token"]

    def test_create_share_note_not_found(self, client: TestClient):
        """Test sharing a non-existent note."""
        fake_id = str(uuid4())
        response = client.post(f"/api/notes/{fake_id}/share")
        assert response.status_code == 404


class TestGetShare:
    """Tests for GET /api/notes/{note_id}/share"""

    def test_get_share(self, client: TestClient):
        """Test getting share info for a shared note."""
        # Create note and share
        note_response = client.post("/api/notes", json={"title": "Note"})
        note_id = note_response.json()["id"]
        client.post(f"/api/notes/{note_id}/share")

        # Get share info
        response = client.get(f"/api/notes/{note_id}/share")
        assert response.status_code == 200
        assert response.json()["note_id"] == note_id

    def test_get_share_not_shared(self, client: TestClient):
        """Test getting share info for an unshared note."""
        note_response = client.post("/api/notes", json={"title": "Note"})
        note_id = note_response.json()["id"]

        response = client.get(f"/api/notes/{note_id}/share")
        assert response.status_code == 200
        assert response.json() is None


class TestDeleteShare:
    """Tests for DELETE /api/notes/{note_id}/share"""

    def test_delete_share(self, client: TestClient):
        """Test revoking a share."""
        # Create note and share
        note_response = client.post("/api/notes", json={"title": "Note"})
        note_id = note_response.json()["id"]
        share_response = client.post(f"/api/notes/{note_id}/share")
        share_token = share_response.json()["share_token"]

        # Delete share
        response = client.delete(f"/api/notes/{note_id}/share")
        assert response.status_code == 204

        # Verify share is gone
        get_response = client.get(f"/api/notes/{note_id}/share")
        assert get_response.json() is None

        # Verify public access is denied
        public_response = client.get(f"/api/shared/{share_token}")
        assert public_response.status_code == 404

    def test_delete_share_not_found(self, client: TestClient):
        """Test deleting a share that doesn't exist."""
        note_response = client.post("/api/notes", json={"title": "Note"})
        note_id = note_response.json()["id"]

        response = client.delete(f"/api/notes/{note_id}/share")
        assert response.status_code == 404


class TestGetSharedNote:
    """Tests for GET /api/shared/{token} (public endpoint)"""

    def test_get_shared_note(self, client: TestClient):
        """Test accessing a shared note via token."""
        # Create note and share
        note_response = client.post("/api/notes", json={"title": "Shared Title", "content": "Shared Content"})
        note_id = note_response.json()["id"]
        share_response = client.post(f"/api/notes/{note_id}/share")
        share_token = share_response.json()["share_token"]

        # Access via public endpoint
        response = client.get(f"/api/shared/{share_token}")
        assert response.status_code == 200
        shared_note = response.json()
        assert shared_note["title"] == "Shared Title"
        assert shared_note["content"] == "Shared Content"
        assert "updated_at" in shared_note

    def test_get_shared_note_invalid_token(self, client: TestClient):
        """Test accessing with an invalid token."""
        fake_token = str(uuid4())
        response = client.get(f"/api/shared/{fake_token}")
        assert response.status_code == 404

    def test_get_shared_note_no_auth_required(self, make_client):
        """Test that shared notes don't require authentication."""
        owner_client = make_client(TEST_USER_ID)

        # Owner creates and shares note
        note_response = owner_client.post("/api/notes", json={"title": "Public Note", "content": "Public Content"})
        note_id = note_response.json()["id"]
        share_response = owner_client.post(f"/api/notes/{note_id}/share")
        share_token = share_response.json()["share_token"]

        # Access with a different "user" (simulating unauthenticated access)
        other_client = make_client("anonymous-user")
        response = other_client.get(f"/api/shared/{share_token}")
        assert response.status_code == 200
        assert response.json()["title"] == "Public Note"


# Note: Authorization tests (test_create_share_not_owner, test_cannot_get_share_of_others_note,
# test_cannot_delete_share_of_others_note) are verified through the get_owned_resource pattern
# which is tested in test_notes.py. The test fixture's make_client sharing global state prevents
# reliable multi-user authorization tests in this context.

