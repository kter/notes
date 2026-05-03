"""設定エンドポイント向けのレスポンススキーマを定義するモジュール。

責務: 設定取得・更新 API のレスポンス形式を Pydantic モデルとして提供する。
主要なエクスポート: SettingsResponse
呼び出し関係: settings/router.py・settings/use_cases.py から参照される。
"""

from pydantic import BaseModel

from app.models import (
    AvailableLanguage,
    AvailableModel,
    TokenUsageRead,
    UserSettingsRead,
)


class SettingsResponse(BaseModel):
    """設定取得・更新エンドポイントのレスポンススキーマ。設定値・選択肢・トークン使用量を含む。"""

    settings: UserSettingsRead
    available_models: list[AvailableModel]
    available_languages: list[AvailableLanguage]
    token_usage: TokenUsageRead
