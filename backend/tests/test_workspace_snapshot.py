from fastapi.testclient import TestClient


class TestWorkspaceSnapshot:
    """Tests for GET /api/workspace/snapshot."""

    def test_snapshot_returns_folders_notes_and_cursor(self, client: TestClient):
        folder_response = client.post("/api/folders", json={"name": "Folder A"})
        assert folder_response.status_code == 201
        folder_id = folder_response.json()["id"]

        note_response = client.post(
            "/api/notes",
            json={"title": "Note A", "content": "Body", "folder_id": folder_id},
        )
        assert note_response.status_code == 201
        note_id = note_response.json()["id"]

        response = client.get("/api/workspace/snapshot")
        assert response.status_code == 200
        data = response.json()

        assert data["cursor"]
        assert data["server_time"].endswith("+00:00") or data["server_time"].endswith(
            "Z"
        )
        snapshot_folder = next(
            folder for folder in data["folders"] if folder["id"] == folder_id
        )
        snapshot_note = next(note for note in data["notes"] if note["id"] == note_id)
        assert snapshot_folder["version"] == 1
        assert snapshot_folder["deleted_at"] is None
        assert snapshot_note["version"] == 1
        assert snapshot_note["deleted_at"] is None

    def test_snapshot_only_returns_current_users_data(self, make_client):
        primary_writer = make_client("user-a")
        primary_folder = primary_writer.post(
            "/api/folders", json={"name": "Visible Folder"}
        )
        assert primary_folder.status_code == 201
        primary_folder_id = primary_folder.json()["id"]

        primary_note = primary_writer.post(
            "/api/notes",
            json={
                "title": "Visible Note",
                "content": "Visible content",
                "folder_id": primary_folder_id,
            },
        )
        assert primary_note.status_code == 201

        other_client = make_client("user-b")
        hidden_folder = other_client.post(
            "/api/folders", json={"name": "Hidden Folder"}
        )
        assert hidden_folder.status_code == 201
        hidden_note = other_client.post(
            "/api/notes",
            json={"title": "Hidden Note", "content": "Hidden content"},
        )
        assert hidden_note.status_code == 201

        primary_reader = make_client("user-a")
        response = primary_reader.get("/api/workspace/snapshot")
        assert response.status_code == 200
        data = response.json()

        assert [folder["name"] for folder in data["folders"]] == ["Visible Folder"]
        assert [note["title"] for note in data["notes"]] == ["Visible Note"]

    def test_snapshot_includes_deleted_tombstones(self, client: TestClient):
        folder = client.post("/api/folders", json={"name": "Deleted Folder"}).json()
        note = client.post(
            "/api/notes",
            json={
                "title": "Deleted Note",
                "content": "Body",
                "folder_id": folder["id"],
            },
        ).json()

        delete_note = client.delete(f"/api/notes/{note['id']}")
        delete_folder = client.delete(f"/api/folders/{folder['id']}")
        assert delete_note.status_code == 204
        assert delete_folder.status_code == 204

        response = client.get("/api/workspace/snapshot")
        assert response.status_code == 200
        data = response.json()

        deleted_folder = next(
            item for item in data["folders"] if item["id"] == folder["id"]
        )
        deleted_note = next(item for item in data["notes"] if item["id"] == note["id"])
        assert deleted_folder["deleted_at"] is not None
        assert deleted_folder["version"] == 2
        assert deleted_note["deleted_at"] is not None
        assert deleted_note["version"] == 2
