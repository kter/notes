import datetime

import httpx
import pytest

# Use a unique prefix for test data to identify/cleanup
TEST_PREFIX = "[IntegrationTest]"


def generate_title(base):
    return f"{TEST_PREFIX} {base} {datetime.datetime.now().isoformat()}"


@pytest.fixture
def public_client(api_base_url):
    """Create an httpx Client with no auth headers for testing public endpoints."""
    with httpx.Client(base_url=api_base_url, timeout=30.0) as client:
        yield client


class TestShareNote:
    @pytest.fixture
    def test_note(self, client):
        """Fixture that creates a note and deletes it after the test."""
        title = generate_title("Share Note")
        response = client.post("/api/notes", json={"title": title, "content": "Content for share test."})
        assert response.status_code == 201
        note = response.json()
        yield note

        # Cleanup
        client.delete(f"/api/notes/{note['id']}")

    @pytest.fixture
    def test_note_with_share(self, client):
        """Fixture that creates a note with a share link and cleans both up after the test."""
        title = generate_title("Share Note With Link")
        note_response = client.post("/api/notes", json={"title": title, "content": "Content for share link test."})
        assert note_response.status_code == 201
        note = note_response.json()

        share_response = client.post(f"/api/notes/{note['id']}/share")
        assert share_response.status_code == 201
        share = share_response.json()

        yield note, share

        # Cleanup share first, then note (best-effort)
        client.delete(f"/api/notes/{note['id']}/share")
        client.delete(f"/api/notes/{note['id']}")

    def test_create_share_link(self, client, test_note):
        """Create a share link for a note and verify the response structure."""
        note_id = test_note["id"]

        response = client.post(f"/api/notes/{note_id}/share")
        try:
            assert response.status_code == 201
            data = response.json()
            assert "token" in data or "share_token" in data, (
                f"Response missing token field. Got keys: {list(data.keys())}"
            )
            assert str(data["note_id"]) == note_id
        finally:
            client.delete(f"/api/notes/{note_id}/share")

    def test_create_share_link_is_idempotent(self, client, test_note):
        """Creating a share link twice for the same note returns the same share."""
        note_id = test_note["id"]

        first_response = client.post(f"/api/notes/{note_id}/share")
        try:
            assert first_response.status_code == 201
            first_data = first_response.json()

            second_response = client.post(f"/api/notes/{note_id}/share")
            assert second_response.status_code == 201
            second_data = second_response.json()

            assert first_data["id"] == second_data["id"]
            assert first_data["share_token"] == second_data["share_token"]
        finally:
            client.delete(f"/api/notes/{note_id}/share")

    def test_get_share_info(self, client, test_note_with_share):
        """Get the share info for a note and verify the structure."""
        note, share = test_note_with_share
        note_id = note["id"]

        response = client.get(f"/api/notes/{note_id}/share")

        assert response.status_code == 200
        data = response.json()
        assert data is not None
        assert data["id"] == share["id"]
        assert data["note_id"] == note_id
        assert "share_token" in data
        assert data["share_token"] == share["share_token"]
        assert "created_at" in data
        assert "expires_at" in data

    def test_get_share_info_when_not_shared(self, client, test_note):
        """Getting share info for a note that has no share link returns null."""
        note_id = test_note["id"]

        response = client.get(f"/api/notes/{note_id}/share")

        assert response.status_code == 200
        # The endpoint returns null when no share exists
        assert response.json() is None

    def test_revoke_share_link(self, client, test_note):
        """Create a share link, revoke it, and verify the share is gone."""
        note_id = test_note["id"]

        # Create share
        create_response = client.post(f"/api/notes/{note_id}/share")
        assert create_response.status_code == 201

        # Revoke share
        delete_response = client.delete(f"/api/notes/{note_id}/share")
        assert delete_response.status_code == 204

        # Verify share is gone - GET should return null (not shared)
        get_response = client.get(f"/api/notes/{note_id}/share")
        assert get_response.status_code == 200
        assert get_response.json() is None

    def test_revoke_nonexistent_share_link(self, client, test_note):
        """Revoking a share link that does not exist returns 404."""
        note_id = test_note["id"]

        # Ensure no share exists first
        client.delete(f"/api/notes/{note_id}/share")

        response = client.delete(f"/api/notes/{note_id}/share")
        assert response.status_code == 404

    def test_public_access_shared_note(self, client, public_client, test_note_with_share):
        """Access a shared note via the public endpoint without any auth header."""
        note, share = test_note_with_share
        token = share["share_token"]

        response = public_client.get(f"/api/shared/{token}")

        assert response.status_code == 200
        data = response.json()
        assert data["title"] == note["title"]
        assert data["content"] == note["content"]
        assert "updated_at" in data

    def test_public_access_nonexistent_token(self, public_client):
        """Accessing a shared note with a non-existent token returns 404."""
        nonexistent_token = "00000000-0000-0000-0000-000000000000"

        response = public_client.get(f"/api/shared/{nonexistent_token}")

        assert response.status_code == 404
