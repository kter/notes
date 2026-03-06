import uuid

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, HTTPException, UploadFile, status

from app.auth import UserId
from app.config import get_settings

router = APIRouter()

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

MIME_TO_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
}


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile,
    user_id: UserId,
):
    """Upload an image to S3 and return the CDN URL."""
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
            detail=f"File size {len(content)} bytes exceeds the maximum of {MAX_FILE_SIZE} bytes (5MB).",
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
    except ClientError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload image: {e.response['Error']['Message']}",
        ) from e

    url = f"https://{settings.cdn_domain}/{key}"
    return {"url": url}
