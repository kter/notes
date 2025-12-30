import io
import zipfile

from fastapi.testclient import TestClient


class TestExportNotes:
    """Tests for GET /api/notes/export/all"""

    def test_export_notes_empty(self, client: TestClient):
        """Test exporting when no notes exist."""
        response = client.get("/api/notes/export/all")
        assert response.status_code == 200
        assert response.headers["Content-Type"] == "application/x-zip-compressed"

        # Verify ZIP is valid but empty
        with zipfile.ZipFile(io.BytesIO(response.content)) as z:
            assert len(z.namelist()) == 0

    def test_export_notes_with_structure(self, client: TestClient):
        """Test exporting notes with folder structure."""
        # Create folder
        folder_response = client.post("/api/folders", json={"name": "Work/Project"})
        folder_id = folder_response.json()["id"]

        # Create notes
        client.post(
            "/api/notes",
            json={"title": "Note 1", "content": "Content 1", "folder_id": folder_id},
        )
        client.post(
            "/api/notes", json={"title": "Note 2", "content": "Content 2"}
        )  # Root
        client.post(
            "/api/notes",
            json={"title": "Note 1", "content": "Duplicate", "folder_id": folder_id},
        )  # Duplicate title

        response = client.get("/api/notes/export/all")
        assert response.status_code == 200

        with zipfile.ZipFile(io.BytesIO(response.content)) as z:
            names = z.namelist()
            assert len(names) == 3
            # Sanitized folder name "Work/Project" -> "WorkProject" or similar depending on sanitization logic
            # My current logic: "".join(c for c in folder_name if c.isalnum() or c in (" ", "-", "_")).strip()
            # "Work/Project" -> "WorkProject"
            assert "WorkProject/Note 1.md" in names
            assert "WorkProject/Note 1 (1).md" in names
            assert "Note 2.md" in names

            assert z.read("WorkProject/Note 1.md").decode() == "Content 1"
            assert z.read("Note 2.md").decode() == "Content 2"

    def test_export_authorization(self, make_client):
        """Test that users can only export their own notes."""
        client_a = make_client("user-a")
        client_a.post("/api/notes", json={"title": "User A Note", "content": "Private"})

        # User B exports
        client_b = make_client("user-b")
        response = client_b.get("/api/notes/export/all")
        assert response.status_code == 200
        with zipfile.ZipFile(io.BytesIO(response.content)) as z:
            assert len(z.namelist()) == 0
            assert "User A Note.md" not in z.namelist()
