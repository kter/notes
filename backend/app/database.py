"""Database connection setup for Aurora DSQL and local development."""

import logging
import os
import time
from collections.abc import Generator

import boto3
import psycopg2
from sqlmodel import Session, create_engine

from app.bootstrap.database_bootstrap import create_database_schema
from app.config import get_settings

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

settings = get_settings()

_engine = None


def get_dsql_engine():
    """Create database engine for DSQL or local PostgreSQL."""
    global _engine
    if _engine is not None:
        logger.info("Reusing cached database engine")
        return _engine

    dsql_endpoint = os.environ.get("DSQL_CLUSTER_ENDPOINT")

    if dsql_endpoint:
        region = os.environ.get("AWS_REGION", "ap-northeast-1")
        logger.info(
            f"Initializing DSQL engine: endpoint={dsql_endpoint}, region={region}"
        )

        def get_connection():
            max_retries = 3
            base_delay = 0.5

            for attempt in range(max_retries):
                try:
                    import datetime

                    now = datetime.datetime.now()
                    logger.info(
                        f"Attempt {attempt + 1}/{max_retries}: Generating auth token at {now} (timestamp: {now.timestamp()})"
                    )

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
                    ):
                        logger.warning(
                            f"DSQL connection failed with signature error (likely clock skew): {exc}"
                        )
                        if attempt < max_retries - 1:
                            sleep_time = base_delay * (attempt + 1)
                            logger.info(
                                f"Sleeping for {sleep_time}s to allow clock synchronization..."
                            )
                            time.sleep(sleep_time)
                            continue

                    logger.error(f"Failed to create DSQL connection: {exc}")
                    raise
                except Exception as exc:
                    logger.error(f"Unexpected error connecting to DSQL: {exc}")
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
            logger.info("DSQL engine created successfully")
        except Exception as exc:
            logger.error(f"Failed to initialize DSQL engine: {exc}", exc_info=True)
            raise
    else:
        logger.info("Initializing local PostgreSQL engine")
        _engine = create_engine(
            settings.database_url,
            echo=settings.debug,
            pool_pre_ping=True,
        )
        logger.info("Local PostgreSQL engine created successfully")

    return _engine


def create_db_and_tables() -> None:
    """Compatibility wrapper for schema bootstrap used by handlers and tests."""
    create_database_schema(get_dsql_engine, logger=logger)


def get_session() -> Generator[Session, None, None]:
    """Dependency to get database session."""
    engine = get_dsql_engine()
    with Session(engine) as session:
        yield session
