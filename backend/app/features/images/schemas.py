from pydantic import BaseModel


class ImageUploadResponse(BaseModel):
    """Response returned after uploading an image."""

    url: str
