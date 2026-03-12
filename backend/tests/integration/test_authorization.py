import datetime

import pytest

# Use a unique prefix for test data to identify/cleanup
TEST_PREFIX = "[IntegrationTest]"


def generate_title(base):
    return f"{TEST_PREFIX} {base} {datetime.datetime.now().isoformat()}"


class TestCrossUserAuthorization:
    @pytest.fixture
    def user_a_note(self, client):
        """Fixture that creates a note as user A and deletes it after the test."""
        title = generate_title("User A Note")
        response = client.post(
            "/api/notes", json={"title": title, "content": "User A content"}
        )
        assert response.status_code == 201
        note = response.json()
        yield note

        # Cleanup by user A
        client.delete(f"/api/notes/{note['id']}")

    @pytest.fixture
    def user_a_folder(self, client):
        """Fixture that creates a folder as user A and deletes it after the test."""
        name = generate_title("User A Folder")
        response = client.post("/api/folders", json={"name": name})
        assert response.status_code == 201
        folder = response.json()
        yield folder

        # Cleanup by user A
        client.delete(f"/api/folders/{folder['id']}")

    def test_cannot_read_other_users_note(self, another_client, user_a_note):
        """User B cannot read a note that belongs to user A."""
        response = another_client.get(f"/api/notes/{user_a_note['id']}")
        assert response.status_code == 404

    def test_cannot_update_other_users_note(self, another_client, user_a_note):
        """User B cannot update a note that belongs to user A."""
        response = another_client.patch(
            f"/api/notes/{user_a_note['id']}",
            json={
                "title": generate_title("Unauthorized Update"),
                "content": "Unauthorized content",
            },
        )
        assert response.status_code == 404

    def test_cannot_delete_other_users_note(self, another_client, user_a_note):
        """User B cannot delete a note that belongs to user A."""
        response = another_client.delete(f"/api/notes/{user_a_note['id']}")
        assert response.status_code == 404

    def test_cannot_read_other_users_folder(self, another_client, user_a_folder):
        """User B cannot read a folder that belongs to user A."""
        response = another_client.get(f"/api/folders/{user_a_folder['id']}")
        assert response.status_code == 404

    def test_notes_are_isolated_between_users(self, another_client, user_a_note):
        """User B's note list must not contain notes that belong to user A."""
        response = another_client.get("/api/notes")
        assert response.status_code == 200
        notes = response.json()
        note_ids = [n["id"] for n in notes]
        assert user_a_note["id"] not in note_ids
