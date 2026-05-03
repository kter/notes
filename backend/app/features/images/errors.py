"""images 機能固有の例外クラス。

責務: 画像アップロード処理で発生するエラーを表すクラスを定義する。
主要なエクスポート: ImageUploadFailedError
呼び出し関係: ImageUploadUseCases で送出され、
    images/router.py で HTTP 500 に変換される。
"""


class ImageUploadFailedError(RuntimeError):
    """画像のストレージ保存に失敗した場合に送出される。"""
