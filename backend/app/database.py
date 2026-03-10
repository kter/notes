"""Database connection for Aurora DSQL."""

import logging
import os
import time
from collections.abc import Generator
from pathlib import Path

import boto3
import psycopg2
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from alembic import command
from app.config import get_settings

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

settings = get_settings()

# Cached engine to reuse connections
_engine = None


def get_dsql_engine():
    """Create database engine for DSQL or local PostgreSQL."""
    global _engine
    if _engine is not None:
        logger.info("Reusing cached database engine")
        return _engine

    dsql_endpoint = os.environ.get("DSQL_CLUSTER_ENDPOINT")

    if dsql_endpoint:
        # Running in Lambda - use DSQL with IAM auth
        region = os.environ.get("AWS_REGION", "ap-northeast-1")
        logger.info(
            f"Initializing DSQL engine: endpoint={dsql_endpoint}, region={region}"
        )

        def get_connection():
            
            max_retries = 3
            base_delay = 0.5
            
            for attempt in range(max_retries):
                try:
                    # Log system time to diagnose clock skew issues
                    import datetime
                    now = datetime.datetime.now()
                    logger.info(f"Attempt {attempt+1}/{max_retries}: Generating auth token at {now} (timestamp: {now.timestamp()})")
                    
                    # Generate IAM auth token
                    client = boto3.client("dsql", region_name=region)
                    token = client.generate_db_connect_admin_auth_token(
                        Hostname=f"{dsql_endpoint}.dsql.{region}.on.aws",
                        Region=region,
                    )
                    
                    # Connect using psycopg2
                    conn = psycopg2.connect(
                        host=f"{dsql_endpoint}.dsql.{region}.on.aws",
                        port=5432,
                        database="postgres",
                        user="admin",
                        password=token,
                        sslmode="require",
                        connect_timeout=5
                    )
                    return conn
                except psycopg2.OperationalError as e:
                    error_msg = str(e)
                    # Check for signature expired error which indicates clock skew
                    if "Signature expired" in error_msg or "Signature not yet current" in error_msg:
                        logger.warning(f"DSQL connection failed with signature error (likely clock skew): {e}")
                        if attempt < max_retries - 1:
                            sleep_time = base_delay * (attempt + 1)
                            logger.info(f"Sleeping for {sleep_time}s to allow clock synchronization...")
                            time.sleep(sleep_time)
                            continue
                    
                    # For other errors or if retries exhausted
                    logger.error(f"Failed to create DSQL connection: {e}")
                    raise
                except Exception as e:
                    logger.error(f"Unexpected error connecting to DSQL: {e}")
                    raise

        try:
            _engine = create_engine(
                "postgresql+psycopg2://",
                creator=get_connection,
                echo=settings.debug,
                pool_pre_ping=True,
                pool_size=5,
                max_overflow=10,
                pool_recycle=300,  # Recycle connections every 5 minutes
            )
            logger.info("DSQL engine created successfully")
        except Exception as e:
            logger.error(f"Failed to initialize DSQL engine: {e}", exc_info=True)
            raise
    else:
        # Running locally - use local PostgreSQL
        logger.info("Initializing local PostgreSQL engine")
        _engine = create_engine(
            settings.database_url,
            echo=settings.debug,
            pool_pre_ping=True,
        )
        logger.info("Local PostgreSQL engine created successfully")

    return _engine


def _import_models() -> None:
    """Import models so SQLModel metadata is populated."""
    from app.models import AppUser, Folder, MCPToken, Note, NoteShare, TokenUsage, UserSettings  # noqa: E401, I001, F401


def _get_backend_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _get_alembic_config(connection=None) -> Config:
    config = Config(str(_get_backend_root() / "alembic.ini"))
    config.set_main_option("script_location", str(_get_backend_root() / "alembic"))
    if connection is not None:
        config.attributes["connection"] = connection
    return config


def _is_duplicate_column_error(error: Exception) -> bool:
    message = str(error).lower()
    return "already exists" in message or "duplicate column" in message


def _ensure_legacy_column(
    connection,
    table_name: str,
    column_name: str,
    alter_sql: str,
    update_sql: str | None = None,
    params: dict | None = None,
) -> None:
    columns_result = connection.execute(text(f"PRAGMA table_info({table_name})"))
    columns = {row[1] for row in columns_result}
    if column_name in columns:
        return

    try:
        connection.execute(text(alter_sql))
    except Exception as error:
        if _is_duplicate_column_error(error):
            return
        raise

    if update_sql is not None:
        connection.execute(text(update_sql), params or {})


def _ensure_legacy_column_portable(
    connection,
    table_name: str,
    column_name: str,
    alter_sql: str,
    update_sql: str | None = None,
    params: dict | None = None,
) -> None:
    dialect_name = connection.dialect.name
    if dialect_name == "sqlite":
        _ensure_legacy_column(
            connection,
            table_name=table_name,
            column_name=column_name,
            alter_sql=alter_sql,
            update_sql=update_sql,
            params=params,
        )
        return

    query = text(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = :table_name AND column_name = :column_name
        """
    )
    exists = connection.execute(
        query,
        {"table_name": table_name, "column_name": column_name},
    ).scalar_one_or_none()
    if exists:
        return

    try:
        connection.execute(text(alter_sql))
    except Exception as error:
        if _is_duplicate_column_error(error):
            return
        raise

    if update_sql is not None:
        connection.execute(text(update_sql), params or {})


def _bootstrap_legacy_schema(connection) -> None:
    """Bring a pre-Alembic database schema up to the current baseline."""
    from app.models.token_usage import MONTHLY_TOKEN_LIMIT

    logger.info("Bootstrapping legacy schema before Alembic stamp")

    for table in SQLModel.metadata.sorted_tables:
        table.create(bind=connection, checkfirst=True)

    _ensure_legacy_column_portable(
        connection,
        table_name="user_settings",
        column_name="language",
        alter_sql="ALTER TABLE user_settings ADD COLUMN language VARCHAR(10)",
        update_sql="UPDATE user_settings SET language = 'auto' WHERE language IS NULL",
    )
    _ensure_legacy_column_portable(
        connection,
        table_name="user_settings",
        column_name="token_limit",
        alter_sql="ALTER TABLE user_settings ADD COLUMN token_limit INTEGER",
        update_sql="UPDATE user_settings SET token_limit = :token_limit WHERE token_limit IS NULL",
        params={"token_limit": MONTHLY_TOKEN_LIMIT},
    )
    _ensure_legacy_column_portable(
        connection,
        table_name="mcp_tokens",
        column_name="last_used_at",
        alter_sql="ALTER TABLE mcp_tokens ADD COLUMN last_used_at TIMESTAMP WITH TIME ZONE",
    )


def create_db_and_tables() -> None:
    """Bring the database schema to the current Alembic revision.

    Databases that predate Alembic are bootstrapped once and stamped at the
    current head revision so future schema changes are managed by Alembic.
    """
    logger.info("Starting database schema initialization...")

    try:
        _import_models()
        logger.info(f"Models loaded: {list(SQLModel.metadata.tables.keys())}")
        engine = get_dsql_engine()
        with engine.connect() as connection:
            table_names = set(inspect(connection).get_table_names())
            existing_tables = set(SQLModel.metadata.tables.keys()) & table_names
            alembic_config = _get_alembic_config(connection=connection)

            if "alembic_version" in table_names:
                logger.info("Alembic version table found; upgrading schema to head")
                command.upgrade(alembic_config, "head")
                connection.commit()
            elif existing_tables:
                logger.info(
                    "Existing schema without Alembic detected; bootstrapping and stamping head"
                )
                _bootstrap_legacy_schema(connection)
                connection.commit()
                command.stamp(alembic_config, "head")
                connection.commit()
            else:
                logger.info("Fresh database detected; applying Alembic migrations")
                command.upgrade(alembic_config, "head")
                connection.commit()

        logger.info("Database schema initialization completed successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database schema: {e}", exc_info=True)
        raise


def get_session() -> Generator[Session, None, None]:
    """Dependency to get database session."""
    engine = get_dsql_engine()
    with Session(engine) as session:
        yield session
