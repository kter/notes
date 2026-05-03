"""アプリケーション設定を環境変数および .env ファイルから読み込むモジュール。

責務: pydantic-settings を用いた設定値の一元管理と型安全な提供。
主要なエクスポート: Settings, get_settings。
呼び出し関係: ほぼ全モジュールから get_settings() 経由で参照される。
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """環境変数から読み込むアプリケーション全体の設定クラス。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # アプリケーション基本設定
    app_name: str = "Notes API"
    environment: str = "local"
    debug: bool = False
    log_level: str = ""
    sentry_dsn: str = ""
    sentry_dsn_parameter_name: str = ""
    sentry_traces_sample_rate: float | None = None

    # データベース接続設定
    database_url: str = "postgresql://notes:notes@localhost:5432/notes"

    # AWS 共通設定
    aws_region: str = "ap-northeast-1"

    # Amazon Cognito 認証設定
    cognito_region: str = "ap-northeast-1"
    cognito_user_pool_id: str = ""
    cognito_app_client_id: str = ""

    # Amazon Bedrock (AI) 設定
    bedrock_region: str = "us-east-1"
    bedrock_model_id: str = "anthropic.claude-3-5-sonnet-20241022-v2:0"

    # CORS 設定
    cors_origins: list[str] = ["http://localhost:3000"]

    # S3 キャッシュバケット設定
    cache_bucket_name: str = "notes-app-cache-local"

    # 画像・CDN 設定
    image_bucket_name: str = ""
    cdn_domain: str = "localhost:8000"
    bootstrap_admin_emails: str = ""
    bootstrap_admin_user_ids: str = ""

    @property
    def bootstrap_admin_email_list(self) -> list[str]:
        """カンマ区切りの管理者メールアドレスをリストに変換して返す。"""
        return [
            item.strip()
            for item in self.bootstrap_admin_emails.split(",")
            if item.strip()
        ]

    @property
    def bootstrap_admin_user_id_list(self) -> list[str]:
        """カンマ区切りの管理者ユーザーIDをリストに変換して返す。"""
        return [
            item.strip()
            for item in self.bootstrap_admin_user_ids.split(",")
            if item.strip()
        ]

    @property
    def effective_sentry_traces_sample_rate(self) -> float:
        """有効な Sentry トレースサンプリングレートを返す。

        明示設定がない場合、local/dev は 1.0、本番は 0.1 をデフォルトとする。
        """
        if self.sentry_traces_sample_rate is not None:
            return self.sentry_traces_sample_rate
        return 1.0 if self.environment in {"local", "dev"} else 0.1

    @property
    def effective_log_level(self) -> str:
        """有効なログレベル文字列を返す。

        明示設定がない場合、local/dev は DEBUG、本番は INFO をデフォルトとする。
        """
        if self.log_level:
            return self.log_level.upper()
        return "DEBUG" if self.environment in {"local", "dev"} else "INFO"


@lru_cache
def get_settings() -> Settings:
    """キャッシュ済みの Settings インスタンスを返す。"""
    return Settings()
