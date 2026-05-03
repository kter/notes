"""ユーザー設定のDBモデルおよびAPIスキーマを定義するモジュール。

責務: LLMモデル選択・言語設定・トークン上限などのユーザー固有設定の永続化と提供。
主要なエクスポート: UserSettings, UserSettingsUpdate, UserSettingsRead,
                   AvailableModel, AvailableLanguage.
呼び出し関係: routers/user_settings.py および services/user_settings_service.py から参照される。
"""

from datetime import UTC, datetime

from sqlmodel import Field, SQLModel

from app.models.token_usage import MONTHLY_TOKEN_LIMIT

# デフォルトLLMモデルID（クロスリージョン推論プロファイル経由のClaude 3.5 Haiku）
DEFAULT_LLM_MODEL_ID = "us.anthropic.claude-3-5-haiku-20241022-v1:0"

# ユーザーが選択可能なモデル一覧
# "us." プレフィックス付きモデルはUSリージョンのクロスリージョン推論プロファイルを使用
# プレフィックスなしは旧モデル向けのオンデマンド呼び出し
#
# 注意: 現時点ではコスト効率を優先してHaikuモデルのみ提供。
# Sonnetモデルは将来のプレミアムプランで追加予定。
AVAILABLE_MODELS = [
    {
        "id": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        "name": "Claude Haiku 4.5",
        "description": "最新・高性能・低コスト",
    },
    {
        "id": "us.anthropic.claude-3-5-haiku-20241022-v1:0",
        "name": "Claude 3.5 Haiku",
        "description": "高速・低コスト（推奨）",
    },
    {
        "id": "anthropic.claude-3-haiku-20240307-v1:0",
        "name": "Claude 3 Haiku",
        "description": "高速・最低コスト",
    },
]

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
