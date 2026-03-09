from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application settings
    app_name: str = "Notes API"
    environment: str = "local"
    debug: bool = False

    # Database settings
    database_url: str = "postgresql://notes:notes@localhost:5432/notes"

    # AWS settings
    aws_region: str = "ap-northeast-1"

    # Cognito settings
    cognito_region: str = "ap-northeast-1"
    cognito_user_pool_id: str = ""
    cognito_app_client_id: str = ""

    # Bedrock settings
    bedrock_region: str = "us-east-1"
    bedrock_model_id: str = "anthropic.claude-3-5-sonnet-20241022-v2:0"

    # CORS settings
    cors_origins: list[str] = ["http://localhost:3000"]

    # Cache settings
    cache_bucket_name: str = "notes-app-cache-local"

    # Image settings
    image_bucket_name: str = ""
    cdn_domain: str = "localhost:8000"
    bootstrap_admin_emails: list[str] = []
    bootstrap_admin_user_ids: list[str] = []

    @field_validator("bootstrap_admin_emails", "bootstrap_admin_user_ids", mode="before")
    @classmethod
    def parse_csv_list(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        if not value:
            return []
        return [item.strip() for item in value.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
