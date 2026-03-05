import datetime
import uuid

import pytest

# Use a unique prefix for test data to identify/cleanup
TEST_PREFIX = "[IntegrationTest]"


def generate_title(base):
    return f"{TEST_PREFIX} {base} {datetime.datetime.now().isoformat()}"


class TestAISummarize:
    @pytest.fixture
    def test_note(self, client):
        """Fixture that creates a note with substantial content and deletes it after test."""
        title = generate_title("Summarize Note")
        unique_id = str(uuid.uuid4())
        content = (
            f"This is a test note about Python programming [{unique_id}]. "
            "Python is a high-level language used for data science and web development. "
            "It was created by Guido van Rossum in the late 1980s. "
            "Python emphasizes code readability and supports multiple programming paradigms."
        )
        response = client.post("/api/notes", json={"title": title, "content": content})
        assert response.status_code == 201
        note = response.json()
        yield note

        # Cleanup
        client.delete(f"/api/notes/{note['id']}")

    def test_summarize_note(self, client, test_note):
        """Create a note with substantial content, call summarize, verify response structure."""
        response = client.post("/api/ai/summarize", json={"note_id": test_note["id"]})
        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
        assert isinstance(data["summary"], str)
        assert len(data["summary"]) > 0
        assert "tokens_used" in data
        assert isinstance(data["tokens_used"], int)
        assert data["tokens_used"] >= 0

    def test_summarize_caching(self, client, test_note):
        """Call summarize twice on the same note; verify both return 200 and same summary (S3 cache hit on second call)."""
        response1 = client.post("/api/ai/summarize", json={"note_id": test_note["id"]})
        assert response1.status_code == 200
        data1 = response1.json()
        assert len(data1["summary"]) > 0

        response2 = client.post("/api/ai/summarize", json={"note_id": test_note["id"]})
        assert response2.status_code == 200
        data2 = response2.json()

        # Both calls should return the same summary (cache hit on second call)
        assert data1["summary"] == data2["summary"]
        # On a cache hit, tokens_used should be 0
        assert data2["tokens_used"] == 0

    def test_summarize_nonexistent_note(self, client):
        """Call summarize with a fake UUID, verify 404."""
        fake_id = str(uuid.uuid4())
        response = client.post("/api/ai/summarize", json={"note_id": fake_id})
        assert response.status_code == 404


class TestAIChat:
    @pytest.fixture
    def test_note(self, client):
        """Fixture that creates a note and deletes it after test."""
        title = generate_title("Chat Note")
        unique_id = str(uuid.uuid4())
        content = (
            f"This is a test note about Python programming [{unique_id}]. "
            "Python is a versatile language used for scripting, automation, and machine learning. "
            "It was created by Guido van Rossum in the late 1980s. "
            "Python emphasizes code readability and supports multiple programming paradigms."
        )
        response = client.post("/api/notes", json={"title": title, "content": content})
        assert response.status_code == 201
        note = response.json()
        yield note

        # Cleanup
        client.delete(f"/api/notes/{note['id']}")

    @pytest.fixture
    def test_folder_with_notes(self, client):
        """Fixture that creates a folder with 2 notes and deletes them after test."""
        folder_title = generate_title("Chat Folder")
        folder_response = client.post("/api/folders", json={"name": folder_title})
        assert folder_response.status_code == 201
        folder = folder_response.json()

        content_base = (
            "Python is a versatile programming language widely used in data science and automation. "
            "It supports object-oriented, functional, and procedural programming styles."
        )

        note1_title = generate_title("Chat Folder Note 1")
        note1_response = client.post(
            "/api/notes",
            json={"title": note1_title, "content": content_base, "folder_id": folder["id"]},
        )
        assert note1_response.status_code == 201
        note1 = note1_response.json()

        note2_title = generate_title("Chat Folder Note 2")
        note2_response = client.post(
            "/api/notes",
            json={
                "title": note2_title,
                "content": "Machine learning is a subset of artificial intelligence. "
                "It enables systems to learn from data and improve over time without explicit programming.",
                "folder_id": folder["id"],
            },
        )
        assert note2_response.status_code == 201
        note2 = note2_response.json()

        yield {"folder": folder, "notes": [note1, note2]}

        # Cleanup notes first, then folder
        client.delete(f"/api/notes/{note1['id']}")
        client.delete(f"/api/notes/{note2['id']}")
        client.delete(f"/api/folders/{folder['id']}")

    def test_chat_note_scope(self, client, test_note):
        """Create a note, ask a question about it using scope 'note' and note_id, verify response structure."""
        response = client.post(
            "/api/ai/chat",
            json={
                "scope": "note",
                "note_id": test_note["id"],
                "question": "What programming language is this note about?",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "answer" in data
        assert isinstance(data["answer"], str)
        assert len(data["answer"]) > 0
        assert "tokens_used" in data
        assert isinstance(data["tokens_used"], int)
        assert data["tokens_used"] >= 0

    def test_chat_folder_scope(self, client, test_folder_with_notes):
        """Create a folder with 2 notes, ask question using scope 'folder' and folder_id, verify 200 and response structure."""
        folder_id = test_folder_with_notes["folder"]["id"]
        response = client.post(
            "/api/ai/chat",
            json={
                "scope": "folder",
                "folder_id": folder_id,
                "question": "What topics are covered in these notes?",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "answer" in data
        assert isinstance(data["answer"], str)
        assert len(data["answer"]) > 0
        assert "tokens_used" in data
        assert isinstance(data["tokens_used"], int)
        assert data["tokens_used"] >= 0

    def test_chat_all_scope(self, client, test_note):
        """Ask question using scope 'all' (no note_id/folder_id), verify 200 and response structure."""
        response = client.post(
            "/api/ai/chat",
            json={
                "scope": "all",
                "question": "Give me a brief summary of all my notes.",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "answer" in data
        assert isinstance(data["answer"], str)
        assert len(data["answer"]) > 0
        assert "tokens_used" in data
        assert isinstance(data["tokens_used"], int)
        assert data["tokens_used"] >= 0

    def test_chat_with_history(self, client, test_note):
        """Create a note, ask a follow-up question with history list containing one previous exchange, verify 200."""
        history = [
            {
                "role": "user",
                "content": "What programming language is this note about?",
            },
            {
                "role": "assistant",
                "content": "The note is about Python programming.",
            },
        ]
        response = client.post(
            "/api/ai/chat",
            json={
                "scope": "note",
                "note_id": test_note["id"],
                "question": "Who created that language?",
                "history": history,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "answer" in data
        assert isinstance(data["answer"], str)
        assert len(data["answer"]) > 0
        assert "tokens_used" in data
        assert isinstance(data["tokens_used"], int)
        assert data["tokens_used"] >= 0


class TestTokenUsage:
    """Integration tests for token usage tracking via GET /api/settings."""

    @pytest.fixture
    def test_note(self, client):
        """Create a note with unique content to avoid S3 cache hits."""
        title = generate_title("Token Usage Note")
        # Embed a UUID so this content is unique and never cached
        unique_id = str(uuid.uuid4())
        content = (
            f"Unique integration test note [{unique_id}]. "
            "This note is about software engineering and testing practices. "
            "Integration tests verify end-to-end behaviour of deployed systems."
        )
        response = client.post("/api/notes", json={"title": title, "content": content})
        assert response.status_code == 201
        note = response.json()
        yield note

        client.delete(f"/api/notes/{note['id']}")

    def test_token_usage_structure_in_settings(self, client):
        """GET /api/settings must include a token_usage object with the expected fields."""
        response = client.get("/api/settings")
        assert response.status_code == 200
        data = response.json()

        assert "token_usage" in data
        usage = data["token_usage"]
        assert "tokens_used" in usage
        assert "token_limit" in usage
        assert "period_start" in usage
        assert "period_end" in usage
        assert isinstance(usage["tokens_used"], int)
        assert isinstance(usage["token_limit"], int)
        assert usage["token_limit"] > 0
        assert usage["tokens_used"] >= 0

    def test_ai_call_increments_token_usage(self, client, test_note):
        """Verify that a non-cached AI summarize call increases tokens_used in settings."""
        # Capture usage before
        before = client.get("/api/settings").json()["token_usage"]["tokens_used"]

        # Make a summarize call (unique content ensures no S3 cache hit)
        ai_response = client.post("/api/ai/summarize", json={"note_id": test_note["id"]})
        assert ai_response.status_code == 200
        tokens_charged = ai_response.json()["tokens_used"]

        # If the call was a cache miss, tokens_charged > 0 and settings must reflect it
        if tokens_charged > 0:
            after = client.get("/api/settings").json()["token_usage"]["tokens_used"]
            assert after == before + tokens_charged
