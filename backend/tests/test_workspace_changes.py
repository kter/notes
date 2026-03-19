from fastapi.testclient import TestClient


class TestWorkspaceChanges:
    """Tests for POST /api/workspace/changes."""

    def test_apply_batch_changes(self, client: TestClient):
        response = client.post(
            "/api/workspace/changes",
            json={
                "device_id": "web-test",
                "base_cursor": "bootstrap",
                "changes": [
                    {
                        "entity": "folder",
                        "operation": "create",
                        "client_mutation_id": "m1",
                        "payload": {"name": "Batch Folder"},
                    },
                    {
                        "entity": "note",
                        "operation": "create",
                        "client_mutation_id": "m2",
                        "payload": {"title": "Batch Note", "content": "Body"},
                    },
                ],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["applied"]) == 2
        assert data["applied"][0]["folder"]["name"] == "Batch Folder"
        assert data["applied"][0]["folder"]["version"] == 1
        assert data["applied"][1]["note"]["title"] == "Batch Note"
        assert data["applied"][1]["note"]["version"] == 1
        assert any(
            folder["name"] == "Batch Folder" for folder in data["snapshot"]["folders"]
        )
        assert any(note["title"] == "Batch Note" for note in data["snapshot"]["notes"])

    def test_update_and_delete_batch_changes(self, client: TestClient):
        folder = client.post("/api/folders", json={"name": "Original Folder"}).json()
        note = client.post(
            "/api/notes",
            json={
                "title": "Original Note",
                "content": "Body",
                "folder_id": folder["id"],
            },
        ).json()

        response = client.post(
            "/api/workspace/changes",
            json={
                "changes": [
                    {
                        "entity": "folder",
                        "operation": "update",
                        "entity_id": folder["id"],
                        "expected_version": folder["version"],
                        "payload": {"name": "Updated Folder"},
                    },
                    {
                        "entity": "note",
                        "operation": "delete",
                        "entity_id": note["id"],
                        "expected_version": note["version"],
                        "payload": {},
                    },
                ]
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["applied"][0]["folder"]["name"] == "Updated Folder"
        assert data["applied"][0]["folder"]["version"] == 2
        assert data["applied"][1]["entity_id"] == note["id"]
        tombstone = next(
            item for item in data["snapshot"]["notes"] if item["id"] == note["id"]
        )
        assert tombstone["deleted_at"] is not None
        assert tombstone["version"] == 2

    def test_rejects_invalid_change_shape(self, client: TestClient):
        response = client.post(
            "/api/workspace/changes",
            json={
                "changes": [
                    {
                        "entity": "note",
                        "operation": "update",
                        "payload": {"title": "Missing entity id"},
                    }
                ]
            },
        )

        assert response.status_code == 422

    def test_rejects_stale_expected_version(self, client: TestClient):
        note = client.post(
            "/api/notes", json={"title": "Original", "content": "Body"}
        ).json()
        updated = client.patch(
            f"/api/notes/{note['id']}", json={"title": "Updated"}
        ).json()
        assert updated["version"] == 2

        response = client.post(
            "/api/workspace/changes",
            json={
                "changes": [
                    {
                        "entity": "note",
                        "operation": "update",
                        "entity_id": note["id"],
                        "expected_version": 1,
                        "payload": {"title": "Stale"},
                    }
                ]
            },
        )

        assert response.status_code == 409
        assert "version mismatch" in response.json()["detail"]

    def test_replays_client_mutation_id_without_creating_duplicates(
        self, client: TestClient
    ):
        request = {
            "changes": [
                {
                    "entity": "note",
                    "operation": "create",
                    "client_mutation_id": "m-replay-note",
                    "payload": {"title": "Replay Note", "content": "Body"},
                }
            ]
        }

        first_response = client.post("/api/workspace/changes", json=request)
        second_response = client.post("/api/workspace/changes", json=request)

        assert first_response.status_code == 200
        assert second_response.status_code == 200

        first_data = first_response.json()
        second_data = second_response.json()
        assert first_data["applied"] == second_data["applied"]

        notes_response = client.get("/api/notes")
        assert notes_response.status_code == 200
        replay_notes = [
            note
            for note in notes_response.json()
            if note["title"] == "Replay Note" and note["deleted_at"] is None
        ]
        assert len(replay_notes) == 1

    def test_replays_delete_client_mutation_id_with_same_result(
        self, client: TestClient
    ):
        note = client.post(
            "/api/notes", json={"title": "Delete Replay", "content": "Body"}
        ).json()
        request = {
            "changes": [
                {
                    "entity": "note",
                    "operation": "delete",
                    "entity_id": note["id"],
                    "client_mutation_id": "m-replay-delete",
                    "expected_version": note["version"],
                    "payload": {},
                }
            ]
        }

        first_response = client.post("/api/workspace/changes", json=request)
        second_response = client.post("/api/workspace/changes", json=request)

        assert first_response.status_code == 200
        assert second_response.status_code == 200
        assert first_response.json()["applied"] == second_response.json()["applied"]
