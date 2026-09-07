"""画像アップロード機能の FastAPI ルーター。

責務: 画像ファイルを S3 にアップロードして CDN URL を返すエンドポイントを提供する。
主要なエクスポート: router
呼び出し関係: アプリケーションの main ルーターにマウントされ、
    ImageUploadUseCases を通じてストレージ処理を呼び出す。
    エラーの HTTP 変換は main.py の DomainError ハンドラーに任せる。
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartParser
from starlette.requests import Request

from app.auth import UserId
from app.features.images.dependencies import get_image_upload_use_cases
from app.features.images.schemas import ImageUploadResponse
from app.features.images.use_cases import MAX_FILE_SIZE, ImageUploadUseCases
from app.shared import ValidationFailed

router = APIRouter()

# Starlette 0.50 buffers file parts in a SpooledTemporaryFile and spills to disk
# when the file exceeds spool_max_size (default 1MB).  Disk writes fail in
# environments with tight quotas, so raise the threshold above our 10MB app
# limit so that all accepted uploads stay in memory.  The 1MB headroom ensures
# files sitting exactly at the limit also avoid a rollover.
MultiPartParser.spool_max_size = MAX_FILE_SIZE + 1024 * 1024


@router.post("", response_model=ImageUploadResponse, status_code=201)
async def upload_image(
    request: Request,
    user_id: UserId,
    use_cases: Annotated[ImageUploadUseCases, Depends(get_image_upload_use_cases)],
):
    """画像を S3 にアップロードし、CDN URL を返す。"""
    form = await request.form(max_part_size=MAX_FILE_SIZE + 1024 * 1024)
    file = form.get("file")
    if not isinstance(file, UploadFile):
        raise ValidationFailed("A file upload is required.")
    # ValidationFailed / ImageUploadFailedError はどちらも DomainError なので、
    # main.py の共通ハンドラーが HTTP へ変換する。他の 5 feature と同じ扱い。
    url = await use_cases.upload_image(file, user_id)
    return ImageUploadResponse(url=url)
