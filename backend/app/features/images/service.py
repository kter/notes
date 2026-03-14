import uuid

import boto3
from botocore.exceptions import ClientError
from fastapi import HTTPException, UploadFile, status

from app.config import get_settings

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_FILE_SIZE = (
    10 * 1024 * 1024
)  # 10MB - must match frontend/src/components/layout/EditorPanel.tsx MAX_SIZE

MIME_TO_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
}


class ImageService:
    """Application service for image uploads."""

    async def upload_image(self, file: UploadFile, user_id: str) -> str:
        settings = get_settings()

        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type: {file.content_type}. Allowed: {', '.join(sorted(ALLOWED_MIME_TYPES))}",
            )

        content = await file.read()

        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File size {len(content)} bytes exceeds the maximum of {MAX_FILE_SIZE} bytes (10MB).",
            )

        ext = MIME_TO_EXT[file.content_type]
        key = f"images/{user_id}/{uuid.uuid4()}.{ext}"

        try:
            s3 = boto3.client("s3")
            s3.put_object(
                Bucket=settings.image_bucket_name,
                Key=key,
                Body=content,
                ContentType=file.content_type,
            )
        except ClientError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload image: {exc.response['Error']['Message']}",
            ) from exc

        return f"https://{settings.cdn_domain}/{key}"
