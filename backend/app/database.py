"""Database connection for Aurora DSQL."""

import logging
import os
from collections.abc import Generator

import boto3
from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

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

        try:
            # Generate IAM auth token
            client = boto3.client("dsql", region_name=region)
            token = client.generate_db_connect_admin_auth_token(
                Hostname=f"{dsql_endpoint}.dsql.{region}.on.aws",
                Region=region,
            )
            logger.info("Successfully generated DSQL auth token")

            # DSQL connection URL
            database_url = (
                f"postgresql://admin:{token}@"
                f"{dsql_endpoint}.dsql.{region}.on.aws:5432/postgres"
                f"?sslmode=require"
            )

            _engine = create_engine(
                database_url,
                echo=settings.debug,
                pool_pre_ping=True,
                pool_size=5,
                max_overflow=10,
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


def create_db_and_tables() -> None:
    """Create database tables if they don't exist.

    Aurora DSQL has the following limitations:
    1. Multiple DDL statements not supported in a single transaction
    2. Synchronous index creation not supported (must use CREATE INDEX ASYNC)

    To work around these, we create each table in a separate transaction.
    """
    logger.info("Starting database table creation...")

    try:
        # Import models to register them with SQLModel.metadata
        from app.models import Folder, Note, NoteShare, UserSettings  # noqa: F401

        logger.info(f"Models loaded: {list(SQLModel.metadata.tables.keys())}")

        engine = get_dsql_engine()

        # For DSQL: create each table individually in separate transactions
        # This works around the "multiple ddl statements not supported in a transaction" error
        for table_name, table in SQLModel.metadata.tables.items():
            logger.info(f"Creating table '{table_name}' if not exists...")
            try:
                table.create(engine, checkfirst=True)
                logger.info(f"Table '{table_name}' created or already exists")

                # Self-healing migration: Add 'language' column to 'user_settings' if missing
                if table_name == "user_settings":
                    logger.info("Checking for 'language' column in 'user_settings'...")
                    try:
                        with engine.connect() as conn:
                            # Step 1: Add the column
                            try:
                                conn.execute(text("ALTER TABLE user_settings ADD COLUMN language VARCHAR(10)"))
                                conn.commit()
                                # Step 2: Set the default value
                                conn.execute(text("UPDATE user_settings SET language = 'auto' WHERE language IS NULL"))
                                conn.commit()
                            except Exception as add_error:
                                if "already exists" in str(add_error).lower() or "duplicate column" in str(add_error).lower():
                                    pass
                                else:
                                    logger.warning(f"Failed to add language column: {add_error}")
                    except Exception as alter_error:
                        logger.warning(f"Failed to migrate user_settings: {alter_error}")

                # Note: 'content' column in 'notes' table needs to be migrated to TEXT manually in DSQL
                # because ALTER COLUMN TYPE is not supported and it may timeout in Lambda.
            except Exception as table_error:
                # Log but continue if table already exists or other non-critical error
                logger.warning(f"Table '{table_name}' creation: {table_error}")

        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Failed to create database tables: {e}", exc_info=True)
        raise


def get_session() -> Generator[Session, None, None]:
    """Dependency to get database session."""
    engine = get_dsql_engine()
    with Session(engine) as session:
        yield session
