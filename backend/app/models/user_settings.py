"""ユーザー設定のDBモデルおよびAPIスキーマを定義するモジュール。

責務: LLMモデル選択・言語設定・トークン上限などのユーザー固有設定の永続化と提供。
主要なエクスポート: UserSettings, UserSettingsUpdate, UserSettingsRead,
                   AvailableModel, AvailableLanguage.
呼び出し関係: routers/user_settings.py および services/user_settings_service.py から参照される。
"""

from datetime import UTC, datetime

from sqlmodel import Field, SQLModel

from app.models.token_usage import MONTHLY_TOKEN_LIMIT

# デフォルトLLMモデルID。
#
# ここは実際に InvokeModel へ渡る値であり、`BEDROCK_MODEL_ID` 環境変数ではない。
# 環境変数のほうはフォールバック用の既定値にすぎない点に注意すること。
#
# `jp.` は日本国内に閉じた推論プロファイル。ユーザーのノート本文を送信するため
# これを採用している。`jp.` プロファイルは ap-northeast-1 にしか存在しないので、
# BEDROCK_REGION（terraform/lambda.tf・config.py）と必ず一組で変更する。
DEFAULT_LLM_MODEL_ID = "jp.anthropic.claude-haiku-4-5-20251001-v1:0"

# ユーザーが選択可能なモデル一覧
#
# 注意: コスト効率を優先してHaikuモデルのみ提供する方針は維持している。
# Sonnetモデルは将来のプレミアムプランで追加予定。
#
# 履歴: 以前ここに並んでいた `us.anthropic.claude-3-5-haiku-20241022-v1:0` と
# `anthropic.claude-3-haiku-20240307-v1:0` は退役・退役予定で、前者は既定値だった
# ため AI 機能が全面停止していた。退役日を書き添えて交換すること。
AVAILABLE_MODELS = [
    {
        "id": "jp.anthropic.claude-haiku-4-5-20251001-v1:0",
        "name": "Claude Haiku 4.5",
        "description": "高速・低コスト（推奨）",
    },
]


def resolve_model_id(stored_model_id: str | None) -> str:
    """保存済みモデル ID が現在も選択可能ならそれを、そうでなければ既定値を返す。

    AVAILABLE_MODELS からモデルを外す（退役・リージョン移行など）と、その ID を
    保存していたユーザーは InvokeModel が失敗し続ける。設定 API が「自分では
    受け付けない ID」を返してしまう問題も同じ原因なので、読み出し側と AI 呼び出し
    側の両方でここを通す。
    """
    if any(model["id"] == stored_model_id for model in AVAILABLE_MODELS):
        return stored_model_id  # type: ignore[return-value]
    return DEFAULT_LLM_MODEL_ID


# Default language setting (auto-detect from browser)
DEFAULT_LANGUAGE = "auto"

# Available language options
AVAILABLE_LANGUAGES = [
    {
        "id": "auto",
        "name": "Auto",
        "description": "ブラウザの言語設定に従う",
    },
    {
        "id": "ja",
        "name": "日本語",
        "description": "Japanese",
    },
    {
        "id": "en",
        "name": "English",
        "description": "英語",
    },
]


class UserSettingsBase(SQLModel):
    """UserSettings スキーマ間で共有するフィールドを持つ基底クラス。"""

    llm_model_id: str = Field(
        default=DEFAULT_LLM_MODEL_ID, max_length=255
    )  # 選択中LLMモデルID
    language: str = Field(default=DEFAULT_LANGUAGE, max_length=10)  # UI表示言語
    token_limit: int = Field(
        default=MONTHLY_TOKEN_LIMIT, ge=1, le=10_000_000
    )  # 月次トークン上限


class UserSettings(UserSettingsBase, table=True):
    """ユーザー設定を永続化するテーブルモデル。

    user_id（Cognito ユーザーサブ）を主キーとし、ユーザーごとに1レコードが存在する。
    """

    __tablename__ = "user_settings"

    user_id: str = Field(primary_key=True)  # Cognito ユーザーサブ
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class UserSettingsUpdate(SQLModel):
    """ユーザー設定更新リクエストスキーマ。未指定フィールドは変更しない。"""

    model_config = {"extra": "forbid"}  # 未定義フィールドの送信を禁止

    llm_model_id: str | None = None  # 変更するモデルID（省略時は変更なし）
    language: str | None = None  # 変更する言語設定（省略時は変更なし）


class UserSettingsRead(UserSettingsBase):
    """ユーザー設定取得レスポンススキーマ。"""

    user_id: str
    created_at: datetime
    updated_at: datetime


class AvailableModel(SQLModel):
    """選択可能なLLMモデル情報のスキーマ。"""

    id: str  # モデルID（Bedrock ARN形式）
    name: str  # 表示名
    description: str  # モデルの特徴説明


class AvailableLanguage(SQLModel):
    """選択可能な言語設定情報のスキーマ。"""

    id: str  # 言語コード（例: "ja", "en", "auto"）
    name: str  # 表示名
    description: str  # 言語の説明
