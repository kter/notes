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


def _detect_mime_from_bytes(content: bytes) -> str | None:
    """ファイルのマジックバイトから実際の MIME タイプを判定する。

    Content-Type ヘッダーは攻撃者が自由に設定できるため、
    ファイルの先頭バイト列（マジックバイト）を直接検査して
    実際のフォーマットを確認する。

    Returns:
        検出された MIME タイプ文字列、またはサポート外フォーマットの場合 None。
    """
    if content[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if content[:8] == b"\x89\x50\x4e\x47\x0d\x0a\x1a\x0a":
        return "image/png"
    if content[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    # WebP: "RIFF" + 4-byte size + "WEBP"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


class ImageUploadUseCases:
    """画像アップロードのアプリケーションユースケース。"""

    async def upload_image(self, file: UploadFile, user_id: str) -> str:
        """ファイルを検証して S3 に保存し、CDN URL を返す。"""
        settings = get_settings()

        # 早期リターン: Content-Type ヘッダーが許可リスト外なら即拒否
        if file.content_type not in ALLOWED_MIME_TYPES:
            raise ValidationFailed(
                f"Unsupported file type: {file.content_type}. Allowed: {', '.join(sorted(ALLOWED_MIME_TYPES))}"
            )

        content = await file.read()

        # マジックバイト検証: ヘッダーではなく実際のバイト列でフォーマットを確認する
        detected_mime = _detect_mime_from_bytes(content)
        if detected_mime is None:
            raise ValidationFailed(
                "File content does not match any supported image format"
            )
        if detected_mime != file.content_type:
            raise ValidationFailed(
                f"File content type mismatch: header says {file.content_type} but content is {detected_mime}"
            )

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
