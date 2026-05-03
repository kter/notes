"""画像アップロード機能の入出力スキーマ。

責務: 画像アップロード API のレスポンスモデルを定義する。
主要なエクスポート: ImageUploadResponse
呼び出し関係: images/router.py のレスポンスモデルとして参照される。
"""

from pydantic import BaseModel


class ImageUploadResponse(BaseModel):
    """画像アップロード後に返すレスポンス。"""

    url: str
