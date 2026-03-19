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
        assert data["applied"][1]["note"]["title"] == "Batch Note"
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
                        "payload": {"name": "Updated Folder"},
                    },
                    {
                        "entity": "note",
                        "operation": "delete",
                        "entity_id": note["id"],
                        "payload": {},
                    },
                ]
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["applied"][0]["folder"]["name"] == "Updated Folder"
        assert data["applied"][1]["entity_id"] == note["id"]
        assert all(item["id"] != note["id"] for item in data["snapshot"]["notes"])

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
