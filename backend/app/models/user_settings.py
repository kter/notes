from datetime import UTC, datetime

from sqlmodel import Field, SQLModel

# Default model ID (Claude Sonnet 4.5 via cross-region inference profile)
DEFAULT_LLM_MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"

# Available models for user selection
# Models with "us." prefix use cross-region inference profiles for US region
# Models without prefix use on-demand (only available for older models)
AVAILABLE_MODELS = [
    {
        "id": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        "name": "Claude Sonnet 4.5",
        "description": "最新・最高性能",
    },
    {
        "id": "us.anthropic.claude-sonnet-4-20250514-v1:0",
        "name": "Claude Sonnet 4",
        "description": "高性能",
    },
    {
        "id": "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
        "name": "Claude 3.5 Sonnet v2",
        "description": "高性能・安定",
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


class UserSettingsBase(SQLModel):
    """Base UserSettings schema."""

    llm_model_id: str = Field(default=DEFAULT_LLM_MODEL_ID, max_length=255)


class UserSettings(UserSettingsBase, table=True):
    """User settings database model."""

    __tablename__ = "user_settings"

    user_id: str = Field(primary_key=True)  # Cognito user sub
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class UserSettingsUpdate(SQLModel):
    """Schema for updating user settings."""

    llm_model_id: str | None = None


class UserSettingsRead(UserSettingsBase):
    """Schema for reading user settings."""

    user_id: str
    created_at: datetime
    updated_at: datetime


class AvailableModel(SQLModel):
    """Schema for available model info."""

    id: str
    name: str
    description: str
