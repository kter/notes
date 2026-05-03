"""Aurora DSQL およびローカル開発向けのデータベース接続設定モジュール。

責務: SQLModel エンジンの生成とセッション提供。
主要なエクスポート: get_dsql_engine, create_db_and_tables, get_session。
呼び出し関係: lambda_handler / worker_lambda_handler から初期化時に呼ばれ、
    各ルーターでは FastAPI の Depends(get_session) 経由で使用される。
"""

import logging
import os
import time
from collections.abc import Generator

import boto3
import psycopg2
from sqlmodel import Session, create_engine

from app.bootstrap.database_bootstrap import create_database_schema
from app.config import get_settings
from app.logging_utils import log_event

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

settings = get_settings()

_engine = None


def get_dsql_engine():
    """DSQL またはローカル PostgreSQL 用のデータベースエンジンを返す。

    エンジンはモジュールスコープの _engine にキャッシュされ、
    2 回目以降の呼び出しでは既存インスタンスをそのまま返す。
    """
    global _engine
    if _engine is not None:
        log_event(
            logger,
            logging.INFO,
            "ops.db.engine.reused",
            outcome="success",
        )
        return _engine

    dsql_endpoint = os.environ.get("DSQL_CLUSTER_ENDPOINT")

    if dsql_endpoint:
        region = os.environ.get("AWS_REGION", "ap-northeast-1")
        log_event(
            logger,
            logging.INFO,
            "ops.db.engine.initializing",
            database_mode="dsql",
            region=region,
            outcome="running",
        )

        def get_connection():
            """DSQL への psycopg2 接続を生成して返す。

            署名期限切れや時刻ズレによる OperationalError は
            max_retries 回まで指数バックオフで再試行する。
            """
            max_retries = 3
            base_delay = 0.5

            for attempt in range(max_retries):
                try:
                    client = boto3.client("dsql", region_name=region)
                    token = client.generate_db_connect_admin_auth_token(
                        Hostname=f"{dsql_endpoint}.dsql.{region}.on.aws",
                        Region=region,
                    )

                    return psycopg2.connect(
                        host=f"{dsql_endpoint}.dsql.{region}.on.aws",
                        port=5432,
                        database="postgres",
                        user="admin",
                        password=token,
                        sslmode="require",
                        connect_timeout=5,
                    )
                except psycopg2.OperationalError as exc:
                    error_message = str(exc)
                    if (
                        "Signature expired" in error_message
                        or "Signature not yet current" in error_message
                        # Lambda の時刻とAWS認証基盤の時刻がズレた場合に発生する
                    ):
                        log_event(
                            logger,
                            logging.WARNING,
                            "ops.db.connection.retrying",
                            database_mode="dsql",
                            attempt=attempt + 1,
                            max_retries=max_retries,
                            outcome="retry",
                            reason="signature_time_skew",
                        )
                        if attempt < max_retries - 1:
                            sleep_time = base_delay * (attempt + 1)
                            time.sleep(sleep_time)
                            continue

                    log_event(
                        logger,
                        logging.ERROR,
                        "ops.db.connection.failed",
                        database_mode="dsql",
                        attempt=attempt + 1,
                        outcome="error",
                        reason=exc.__class__.__name__,
                    )
                    raise
                except Exception as exc:
                    log_event(
                        logger,
                        logging.ERROR,
                        "ops.db.connection.failed",
                        database_mode="dsql",
                        attempt=attempt + 1,
                        outcome="error",
                        reason=exc.__class__.__name__,
                    )
                    raise

        try:
            _engine = create_engine(
                "postgresql+psycopg2://",
                creator=get_connection,
                echo=settings.debug,
                pool_pre_ping=True,
                pool_size=5,
                max_overflow=10,
                pool_recycle=300,
            )
            log_event(
                logger,
                logging.INFO,
                "ops.db.engine.created",
                database_mode="dsql",
                outcome="success",
            )
        except Exception as exc:
            log_event(
                logger,
                logging.ERROR,
                "ops.db.engine.failed",
                database_mode="dsql",
                outcome="error",
                reason=exc.__class__.__name__,
                exc_info=True,
            )
            raise
    else:
        log_event(
            logger,
            logging.INFO,
            "ops.db.engine.initializing",
            database_mode="postgresql",
            outcome="running",
        )
        _engine = create_engine(
            settings.database_url,
            echo=settings.debug,
            pool_pre_ping=True,
        )
        log_event(
            logger,
            logging.INFO,
            "ops.db.engine.created",
            database_mode="postgresql",
            outcome="success",
        )

    return _engine


def create_db_and_tables() -> None:
    """ハンドラーおよびテストから呼ばれるスキーマ初期化の互換ラッパー。

    実装は app.bootstrap.database_bootstrap.create_database_schema に委譲する。
    """
    create_database_schema(get_dsql_engine, logger=logger)


def get_session() -> Generator[Session, None, None]:
    """FastAPI の Depends で使用するデータベースセッションを提供するジェネレータ。"""
    engine = get_dsql_engine()
    with Session(engine) as session:
        yield session
