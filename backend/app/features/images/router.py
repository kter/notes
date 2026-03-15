from fastapi import APIRouter, UploadFile

from app.auth import UserId
from app.features.images.schemas import ImageUploadResponse
from app.features.images.service import ImageService

router = APIRouter()


@router.post("", response_model=ImageUploadResponse, status_code=201)
async def upload_image(
    file: UploadFile,
    user_id: UserId,
):
    """Upload an image to S3 and return the CDN URL."""
    service = ImageService()
    return ImageUploadResponse(url=await service.upload_image(file, user_id))
