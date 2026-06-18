import datetime
import time
import uuid

import pytest

# Use a unique prefix for test data to identify/cleanup
TEST_PREFIX = "[IntegrationTest]"


def generate_title(base):
    return f"{TEST_PREFIX} {base} {datetime.datetime.now().isoformat()}"


def poll_ai_job(client, job_id, timeout_s=120, interval_s=1.5):
    """要約・チャットの非同期ジョブを完了/失敗まで GET /api/ai/jobs/{id} でポーリングする。"""
    deadline = time.monotonic() + timeout_s
    while True:
        resp = client.get(f"/api/ai/jobs/{job_id}")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        if data["status"] in ("completed", "failed"):
            return data
        if time.monotonic() >= deadline:
            raise AssertionError(
                f"AI job {job_id} did not finish in {timeout_s}s (status={data['status']})"
            )
        time.sleep(interval_s)


def run_summarize_job(client, note_id):
    """要約ジョブを作成しポーリングして完了したジョブを返す。"""
    resp = client.post("/api/ai/summarize-jobs", json={"note_id": note_id})
    assert resp.status_code == 202, resp.text
    job = poll_ai_job(client, resp.json()["id"])
    assert job["status"] == "completed", job.get("error_message")
    return job


def run_chat_job(client, payload):
    """チャットジョブを作成しポーリングして完了したジョブを返す。"""
    resp = client.post("/api/ai/chat-jobs", json=payload)
    assert resp.status_code == 202, resp.text
    job = poll_ai_job(client, resp.json()["id"])
    assert job["status"] == "completed", job.get("error_message")
    return job


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
        """Create a note, run the async summarize job, verify the completed job structure."""
        job = run_summarize_job(client, test_note["id"])
        assert job["kind"] == "summarize"
        assert isinstance(job["result"], str)
        assert len(job["result"]) > 0
        assert isinstance(job["tokens_used"], int)
        assert job["tokens_used"] >= 0

    def test_summarize_caching(self, client, test_note):
        """Run summarize twice and verify the second job is served from cache (0 tokens)."""
        job1 = run_summarize_job(client, test_note["id"])
        assert len(job1["result"]) > 0

        job2 = run_summarize_job(client, test_note["id"])
        assert len(job2["result"]) > 0
        assert job2["tokens_used"] == 0

    def test_summarize_nonexistent_note(self, client):
        """Creating a summarize job for a fake UUID must be rejected at creation (404)."""
        fake_id = str(uuid.uuid4())
        response = client.post("/api/ai/summarize-jobs", json={"note_id": fake_id})
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
            json={
                "title": note1_title,
                "content": content_base,
                "folder_id": folder["id"],
            },
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
        """Ask a question about a note via an async chat job (scope 'note')."""
        job = run_chat_job(
            client,
            {
                "scope": "note",
                "note_id": test_note["id"],
                "question": "What programming language is this note about?",
            },
        )
        assert job["kind"] == "chat"
        assert isinstance(job["result"], str)
        assert len(job["result"]) > 0
        assert isinstance(job["tokens_used"], int)
        assert job["tokens_used"] >= 0

    def test_chat_folder_scope(self, client, test_folder_with_notes):
        """Ask a question via an async chat job scoped to a folder."""
        folder_id = test_folder_with_notes["folder"]["id"]
        job = run_chat_job(
            client,
            {
                "scope": "folder",
                "folder_id": folder_id,
                "question": "What topics are covered in these notes?",
            },
        )
        assert isinstance(job["result"], str)
        assert len(job["result"]) > 0
        assert job["tokens_used"] >= 0

    def test_chat_all_scope(self, client, test_note):
        """Ask a question via an async chat job scoped to all notes."""
        job = run_chat_job(
            client,
            {
                "scope": "all",
                "question": "Give me a brief summary of all my notes.",
            },
        )
        assert isinstance(job["result"], str)
        assert len(job["result"]) > 0
        assert job["tokens_used"] >= 0

    def test_chat_with_history(self, client, test_note):
        """Ask a follow-up question with history via an async chat job."""
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
        job = run_chat_job(
            client,
            {
                "scope": "note",
                "note_id": test_note["id"],
                "question": "Who created that language?",
                "history": history,
            },
        )
        assert isinstance(job["result"], str)
        assert len(job["result"]) > 0
        assert job["tokens_used"] >= 0


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
        """Verify that a non-cached AI summarize job increases tokens_used in settings."""
        # Capture usage before
        before = client.get("/api/settings").json()["token_usage"]["tokens_used"]

        # Run a summarize job (unique content ensures no S3 cache hit)
        job = run_summarize_job(client, test_note["id"])
        tokens_charged = job["tokens_used"]

        # If the call was a cache miss, tokens_charged > 0 and settings must reflect it
        if tokens_charged > 0:
            after = client.get("/api/settings").json()["token_usage"]["tokens_used"]
            assert after == before + tokens_charged
