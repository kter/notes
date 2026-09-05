"""Tests for image upload endpoint."""

import io
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient

from app.auth import get_current_user, get_user_id
from app.database import get_session
from app.features.images.dependencies import get_image_upload_use_cases
from app.features.images.use_cases import ImageUploadUseCases
from app.main import app

TEST_USER_ID = "test-user-123"


@pytest.fixture(name="s3_client")
def s3_client_fixture():
    """画像アップロードに注入するS3クライアントを返す。"""
    return MagicMock()


@pytest.fixture(name="client")
def client_fixture(session, s3_client):
    """Create test client with mocked auth."""

    def get_session_override():
        yield session

    def get_user_id_override() -> str:
        return TEST_USER_ID

    def get_current_user_override() -> dict:
        return {"sub": TEST_USER_ID}

    def get_image_upload_use_cases_override() -> ImageUploadUseCases:
        return ImageUploadUseCases(s3_client=s3_client)

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_user_id] = get_user_id_override
    app.dependency_overrides[get_current_user] = get_current_user_override
    app.dependency_overrides[get_image_upload_use_cases] = (
        get_image_upload_use_cases_override
    )

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture(name="unauthenticated_client")
def unauthenticated_client_fixture(session, s3_client):
    """Create test client without auth override (no user)."""

    def get_session_override():
        yield session

    def get_image_upload_use_cases_override() -> ImageUploadUseCases:
        return ImageUploadUseCases(s3_client=s3_client)

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_image_upload_use_cases] = (
        get_image_upload_use_cases_override
    )

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
    def test_upload_valid_image_returns_url(
        self, client: TestClient, s3_client: MagicMock
    ):
        """Valid PNG upload should return 201 with a CDN URL."""
        png_bytes = make_png_bytes()

        response = client.post(
            "/api/images",
            files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
        )

        assert response.status_code == 201
        data = response.json()
        assert "url" in data
        assert data["url"].endswith(".png")
        # S3 key must start with "images/" so CloudFront path /images/* maps correctly
        call_kwargs = s3_client.put_object.call_args.kwargs
        assert call_kwargs["Key"].startswith("images/")
        # CDN URL must not double the "images/" prefix
        assert data["url"].count("/images/") == 1
        s3_client.put_object.assert_called_once()

    def test_upload_s3_client_error_returns_500(
        self, client: TestClient, s3_client: MagicMock
    ):
        """注入したS3クライアントの失敗をHTTP 500へ変換する。"""
        s3_client.put_object.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "upload denied"}},
            "PutObject",
        )

        response = client.post(
            "/api/images",
            files={"file": ("test.png", io.BytesIO(make_png_bytes()), "image/png")},
        )

        assert response.status_code == 500
        assert response.json()["detail"] == "Failed to upload image: upload denied"

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
        png_header = b"\x89PNG\r\n\x1a\n"
        large_content = png_header + b"A" * (10 * 1024 * 1024 + 1 - len(png_header))

        response = client.post(
            "/api/images",
            files={"file": ("big.png", io.BytesIO(large_content), "image/png")},
        )

        assert response.status_code == 400
        assert "exceeds" in response.json()["detail"]

    def test_upload_file_exactly_at_size_limit_returns_201(self, client: TestClient):
        """File exactly at 10MB (not exceeding) should be accepted (boundary: > not >=)."""
        png_header = b"\x89PNG\r\n\x1a\n"
        exact_content = png_header + b"A" * (10 * 1024 * 1024 - len(png_header))

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

        response = client.post(
            "/api/images",
            files={"file": ("photo.jpg", io.BytesIO(jpeg_bytes), "image/jpeg")},
        )

        assert response.status_code == 201
        assert response.json()["url"].endswith(".jpg")

    def test_upload_spoofed_png_header_with_jpeg_content_returns_400(
        self, client: TestClient
    ):
        """A request claiming image/png but carrying JPEG bytes must be rejected.

        This exercises the magic-byte mismatch branch (header vs. content), the
        core of the recently added anti-spoofing defense.
        """
        jpeg_bytes = b"\xff\xd8\xff\xe0" + b"\x00" * 10

        response = client.post(
            "/api/images",
            files={"file": ("evil.png", io.BytesIO(jpeg_bytes), "image/png")},
        )

        assert response.status_code == 400
        assert "mismatch" in response.json()["detail"]

    def test_upload_spoofed_jpeg_header_with_png_content_returns_400(
        self, client: TestClient
    ):
        """A request claiming image/jpeg but carrying PNG bytes must be rejected."""
        png_bytes = make_png_bytes()

        response = client.post(
            "/api/images",
            files={"file": ("evil.jpg", io.BytesIO(png_bytes), "image/jpeg")},
        )

        assert response.status_code == 400
        assert "mismatch" in response.json()["detail"]

    def test_upload_unrecognized_magic_bytes_returns_400(self, client: TestClient):
        """Binary that matches no supported format signature must be rejected."""
        garbage = b"\x00\x01\x02\x03" + b"A" * 100

        response = client.post(
            "/api/images",
            files={"file": ("data.png", io.BytesIO(garbage), "image/png")},
        )

        assert response.status_code == 400
        assert "does not match" in response.json()["detail"]

    def test_upload_valid_webp_returns_201(self, client: TestClient):
        """A minimal valid WebP (RIFF....WEBP) should pass magic-byte validation."""
        # RIFF + 4-byte little-endian size + "WEBP" + minimal padding
        webp_bytes = b"RIFF" + b"\x24\x00\x00\x00" + b"WEBP" + b"VP8 " + b"\x00" * 20

        response = client.post(
            "/api/images",
            files={"file": ("img.webp", io.BytesIO(webp_bytes), "image/webp")},
        )

        assert response.status_code == 201
        assert response.json()["url"].endswith(".webp")

    def test_upload_valid_gif_returns_201(self, client: TestClient):
        """A minimal valid GIF (GIF89a) should pass magic-byte validation."""
        gif_bytes = b"GIF89a" + b"\x00" * 20

        response = client.post(
            "/api/images",
            files={"file": ("img.gif", io.BytesIO(gif_bytes), "image/gif")},
        )

        assert response.status_code == 201
        assert response.json()["url"].endswith(".gif")
