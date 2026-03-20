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
    """Upload an image to S3 and return the CDN URL."""
    try:
        url = await use_cases.upload_image(file, user_id)
    except ImageUploadFailedError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    return ImageUploadResponse(url=url)
