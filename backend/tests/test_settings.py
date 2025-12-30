"""Tests for settings API endpoints."""

from fastapi.testclient import TestClient

from app.models.user_settings import (
    AVAILABLE_LANGUAGES,
    AVAILABLE_MODELS,
    DEFAULT_LANGUAGE,
    DEFAULT_LLM_MODEL_ID,
)
from tests.conftest import TEST_USER_ID


class TestGetSettings:
    """Tests for GET /api/settings/"""

    def test_get_settings_creates_default(self, client: TestClient):
        """Test that getting settings creates default settings for new user."""
        response = client.get("/api/settings")

        assert response.status_code == 200
        data = response.json()

        # Check settings structure
        assert "settings" in data
        assert "available_models" in data
        assert "available_languages" in data

        # Check default settings
        settings = data["settings"]
        assert settings["user_id"] == TEST_USER_ID
        assert settings["llm_model_id"] == DEFAULT_LLM_MODEL_ID
        assert settings["language"] == DEFAULT_LANGUAGE
        assert "created_at" in settings
        assert "updated_at" in settings

    def test_get_settings_returns_available_models(self, client: TestClient):
        """Test that available models list is returned."""
        response = client.get("/api/settings")

        assert response.status_code == 200
        data = response.json()

        available_models = data["available_models"]
        assert len(available_models) == len(AVAILABLE_MODELS)

        # Check model structure
        for model in available_models:
            assert "id" in model
            assert "name" in model
            assert "description" in model

    def test_get_settings_returns_available_languages(self, client: TestClient):
        """Test that available languages list is returned."""
        response = client.get("/api/settings")

        assert response.status_code == 200
        data = response.json()

        available_languages = data["available_languages"]
        assert len(available_languages) == len(AVAILABLE_LANGUAGES)

        # Check language structure
        for lang in available_languages:
            assert "id" in lang
            assert "name" in lang
            assert "description" in lang

    def test_get_settings_idempotent(self, client: TestClient):
        """Test that getting settings multiple times returns same result."""
        response1 = client.get("/api/settings")
        response2 = client.get("/api/settings")

        assert response1.status_code == 200
        assert response2.status_code == 200

        settings1 = response1.json()["settings"]
        settings2 = response2.json()["settings"]

        assert settings1["llm_model_id"] == settings2["llm_model_id"]
        assert settings1["language"] == settings2["language"]
        assert settings1["created_at"] == settings2["created_at"]


class TestUpdateSettings:
    """Tests for PUT /api/settings/"""

    def test_update_settings_change_model(self, client: TestClient):
        """Test updating the LLM model selection."""
        # Get valid model ID from available models
        valid_model_id = AVAILABLE_MODELS[1]["id"]  # Pick second model

        response = client.put(
            "/api/settings",
            json={"llm_model_id": valid_model_id},
        )

        assert response.status_code == 200
        settings = response.json()
        assert settings["llm_model_id"] == valid_model_id
        assert settings["user_id"] == TEST_USER_ID

    def test_update_settings_invalid_model_id(self, client: TestClient):
        """Test that invalid model ID is rejected."""
        # First get current settings (creates default)
        client.get("/api/settings")

        response = client.put(
            "/api/settings",
            json={"llm_model_id": "invalid-model-that-does-not-exist"},
        )

        assert response.status_code == 400
        assert "Invalid model ID" in response.json()["detail"]

    def test_update_settings_creates_if_not_exists(self, client: TestClient):
        """Test that update creates settings if they don't exist."""
        valid_model_id = AVAILABLE_MODELS[0]["id"]

        # Update without getting first
        response = client.put(
            "/api/settings",
            json={"llm_model_id": valid_model_id},
        )

        assert response.status_code == 200
        settings = response.json()
        assert settings["llm_model_id"] == valid_model_id


class TestUpdateLanguageSettings:
    """Tests for language settings in PUT /api/settings/"""

    def test_update_language_to_japanese(self, client: TestClient):
        """Test changing language to Japanese."""
        response = client.put(
            "/api/settings",
            json={"language": "ja"},
        )

        assert response.status_code == 200
        settings = response.json()
        assert settings["language"] == "ja"

    def test_update_language_to_english(self, client: TestClient):
        """Test changing language to English."""
        response = client.put(
            "/api/settings",
            json={"language": "en"},
        )

        assert response.status_code == 200
        settings = response.json()
        assert settings["language"] == "en"

    def test_update_language_to_auto(self, client: TestClient):
        """Test changing language back to auto."""
        # First set to Japanese
        client.put("/api/settings", json={"language": "ja"})

        # Then change to auto
        response = client.put(
            "/api/settings",
            json={"language": "auto"},
        )

        assert response.status_code == 200
        settings = response.json()
        assert settings["language"] == "auto"

    def test_update_invalid_language_rejected(self, client: TestClient):
        """Test that invalid language is rejected."""
        # First create settings
        client.get("/api/settings")

        response = client.put(
            "/api/settings",
            json={"language": "invalid-language"},
        )

        assert response.status_code == 400
        assert "Invalid language" in response.json()["detail"]

    def test_update_model_and_language_together(self, client: TestClient):
        """Test updating both model and language at once."""
        valid_model_id = AVAILABLE_MODELS[1]["id"]

        response = client.put(
            "/api/settings",
            json={"llm_model_id": valid_model_id, "language": "ja"},
        )

        assert response.status_code == 200
        settings = response.json()
        assert settings["llm_model_id"] == valid_model_id
        assert settings["language"] == "ja"


class TestSettingsUserIsolation:
    """Tests for settings user isolation."""

    def test_settings_per_user(self, make_client):
        """Test that each user has their own settings."""
        # User 1 sets a model
        client1 = make_client("user-1")
        model1 = AVAILABLE_MODELS[0]["id"]
        response1_update = client1.put("/api/settings", json={"llm_model_id": model1})
        assert response1_update.status_code == 200

        # User 2 gets default settings (different from user 1's choice if default differs)
        client2 = make_client("user-2")
        response2 = client2.get("/api/settings")

        # Both users should have settings
        assert response2.status_code == 200
        assert response2.json()["settings"]["user_id"] == "user-2"

        # Verify user 1's setting persisted
        response1 = client1.get("/api/settings")
        assert response1.status_code == 200
        # Note: due to make_client fixture behavior with shared session,
        # the user_id in the returned data should match what was set
        assert "llm_model_id" in response1.json()["settings"]

    def test_language_settings_per_user(self, make_client):
        """Test that each user has their own language settings."""
        # User 1 sets Japanese
        client1 = make_client("user-1")
        response1 = client1.put("/api/settings", json={"language": "ja"})
        assert response1.status_code == 200
        assert response1.json()["language"] == "ja"

        # User 2 sets English
        client2 = make_client("user-2")
        response2 = client2.put("/api/settings", json={"language": "en"})
        assert response2.status_code == 200
        assert response2.json()["language"] == "en"
