"""Tests for image upload endpoint."""

import io
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_user, get_user_id
from app.database import get_session
from app.main import app

TEST_USER_ID = "test-user-123"


@pytest.fixture(name="client")
def client_fixture(session):
    """Create test client with mocked auth."""

    def get_session_override():
        yield session

    def get_user_id_override() -> str:
        return TEST_USER_ID

    def get_current_user_override() -> dict:
        return {"sub": TEST_USER_ID}

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_user_id] = get_user_id_override
    app.dependency_overrides[get_current_user] = get_current_user_override

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture(name="unauthenticated_client")
def unauthenticated_client_fixture(session):
    """Create test client without auth override (no user)."""

    def get_session_override():
        yield session

    app.dependency_overrides[get_session] = get_session_override

    with TestClient(app, raise_server_exceptions=False) as client:
        yield client

    app.dependency_overrides.clear()


def make_png_bytes() -> bytes:
    """Return a minimal valid 1x1 PNG."""
    return (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
        b"\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )


class TestUploadImage:
    def test_upload_valid_image_returns_url(self, client: TestClient):
        """Valid PNG upload should return 201 with a CDN URL."""
        png_bytes = make_png_bytes()

        with patch("app.routers.images.boto3") as mock_boto3:
            mock_s3 = MagicMock()
            mock_boto3.client.return_value = mock_s3

            response = client.post(
                "/api/images",
                files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
            )

        assert response.status_code == 201
        data = response.json()
        assert "url" in data
        assert data["url"].endswith(".png")
        # S3 key must start with "images/" so CloudFront path /images/* maps correctly
        call_kwargs = mock_s3.put_object.call_args.kwargs
        assert call_kwargs["Key"].startswith("images/")
        # CDN URL must not double the "images/" prefix
        assert data["url"].count("/images/") == 1
        mock_s3.put_object.assert_called_once()

    def test_upload_invalid_mime_type_returns_400(self, client: TestClient):
        """Non-image MIME type should return 400."""
        response = client.post(
            "/api/images",
            files={"file": ("test.txt", io.BytesIO(b"hello world"), "text/plain")},
        )

        assert response.status_code == 400
        assert "Unsupported file type" in response.json()["detail"]

    def test_upload_oversized_file_returns_400(self, client: TestClient):
        """Files larger than 10MB should return 400."""
        large_content = b"A" * (10 * 1024 * 1024 + 1)

        response = client.post(
            "/api/images",
            files={"file": ("big.png", io.BytesIO(large_content), "image/png")},
        )

        assert response.status_code == 400
        assert "exceeds" in response.json()["detail"]

    def test_upload_file_exactly_at_size_limit_returns_201(self, client: TestClient):
        """File exactly at 10MB (not exceeding) should be accepted (boundary: > not >=)."""
        exact_content = b"A" * (10 * 1024 * 1024)

        with patch("app.routers.images.boto3") as mock_boto3:
            mock_s3 = MagicMock()
            mock_boto3.client.return_value = mock_s3

            response = client.post(
                "/api/images",
                files={"file": ("exact.png", io.BytesIO(exact_content), "image/png")},
            )

        assert response.status_code == 201

    def test_upload_unauthenticated_returns_401(
        self, unauthenticated_client: TestClient
    ):
        """Request without auth should return 401."""
        png_bytes = make_png_bytes()

        response = unauthenticated_client.post(
            "/api/images",
            files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
        )

        assert response.status_code == 401

    def test_upload_jpeg_returns_jpg_extension(self, client: TestClient):
        """JPEG upload should result in a .jpg extension in the URL."""
        jpeg_bytes = b"\xff\xd8\xff\xe0" + b"\x00" * 10  # minimal JPEG header

        with patch("app.routers.images.boto3") as mock_boto3:
            mock_s3 = MagicMock()
            mock_boto3.client.return_value = mock_s3

            response = client.post(
                "/api/images",
                files={"file": ("photo.jpg", io.BytesIO(jpeg_bytes), "image/jpeg")},
            )

        assert response.status_code == 201
        assert response.json()["url"].endswith(".jpg")
