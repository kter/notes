"""images 機能の FastAPI 依存関係ファクトリ。

責務: ImageUploadUseCases インスタンスを DI コンテナへ提供する。
主要なエクスポート: get_image_upload_use_cases
呼び出し関係: images/router.py の Depends から呼ばれる。
"""

from app.features.images.use_cases import ImageUploadUseCases


def get_image_upload_use_cases() -> ImageUploadUseCases:
    """ImageUploadUseCases のインスタンスを生成して返す。"""
    return ImageUploadUseCases()
