"""画像アップロードのアプリケーションユースケース。

責務: アップロードファイルのバリデーション、S3 への保存、CDN URL の生成を行う。
主要なエクスポート: ImageUploadUseCases, ALLOWED_MIME_TYPES, MAX_FILE_SIZE
呼び出し関係: images/router.py から呼ばれ、boto3 経由で S3 に書き込む。
"""

import uuid

import boto3
from botocore.exceptions import ClientError
from starlette.datastructures import UploadFile

from app.config import get_settings
from app.features.images.errors import ImageUploadFailedError
from app.shared import ValidationFailed

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_FILE_SIZE = (
    10 * 1024 * 1024
)  # 10MB - フロントエンドの EditorPanel.tsx MAX_SIZE と一致させること

MIME_TO_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
}


class ImageUploadUseCases:
    """画像アップロードのアプリケーションユースケース。"""

    async def upload_image(self, file: UploadFile, user_id: str) -> str:
        """ファイルを検証して S3 に保存し、CDN URL を返す。"""
        settings = get_settings()

        if file.content_type not in ALLOWED_MIME_TYPES:
            raise ValidationFailed(
                f"Unsupported file type: {file.content_type}. Allowed: {', '.join(sorted(ALLOWED_MIME_TYPES))}"
            )

        content = await file.read()

        if len(content) > MAX_FILE_SIZE:
            raise ValidationFailed(
                f"File size {len(content)} bytes exceeds the maximum of {MAX_FILE_SIZE} bytes (10MB)."
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
            raise ImageUploadFailedError(
                f"Failed to upload image: {exc.response['Error']['Message']}"
            ) from exc

        return f"https://{settings.cdn_domain}/{key}"
