"""画像アップロード機能の FastAPI ルーター。

責務: 画像ファイルを S3 にアップロードして CDN URL を返すエンドポイントを提供する。
主要なエクスポート: router
呼び出し関係: アプリケーションの main ルーターにマウントされ、
    ImageUploadUseCases を通じてストレージ処理を呼び出す。
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

from app.auth import UserId
from app.features.images.dependencies import get_image_upload_use_cases
from app.features.images.errors import ImageUploadFailedError
from app.features.images.schemas import ImageUploadResponse
from app.features.images.use_cases import ImageUploadUseCases

router = APIRouter()


@router.post("", response_model=ImageUploadResponse, status_code=201)
async def upload_image(
    file: UploadFile,
    user_id: UserId,
    use_cases: Annotated[ImageUploadUseCases, Depends(get_image_upload_use_cases)],
):
    """画像を S3 にアップロードし、CDN URL を返す。"""
    try:
        url = await use_cases.upload_image(file, user_id)
    except ImageUploadFailedError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    return ImageUploadResponse(url=url)
