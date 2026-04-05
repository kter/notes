from functools import lru_cache

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
    log_level: str = ""
    sentry_dsn: str = ""
    sentry_dsn_parameter_name: str = ""
    sentry_traces_sample_rate: float | None = None

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
    bootstrap_admin_emails: str = ""
    bootstrap_admin_user_ids: str = ""

    @property
    def bootstrap_admin_email_list(self) -> list[str]:
        return [
            item.strip()
            for item in self.bootstrap_admin_emails.split(",")
            if item.strip()
        ]

    @property
    def bootstrap_admin_user_id_list(self) -> list[str]:
        return [
            item.strip()
            for item in self.bootstrap_admin_user_ids.split(",")
            if item.strip()
        ]

    @property
    def effective_sentry_traces_sample_rate(self) -> float:
        if self.sentry_traces_sample_rate is not None:
            return self.sentry_traces_sample_rate
        return 1.0 if self.environment in {"local", "dev"} else 0.1

    @property
    def effective_log_level(self) -> str:
        if self.log_level:
            return self.log_level.upper()
        return "DEBUG" if self.environment in {"local", "dev"} else "INFO"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
