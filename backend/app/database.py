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
        from app.models import Folder, Note, UserSettings  # noqa: F401

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
                            # Step 1: Add the column without DEFAULT or constraints
                            try:
                                conn.execute(
                                    text(
                                        "ALTER TABLE user_settings ADD COLUMN language VARCHAR(10)"
                                    )
                                )
                                conn.commit()
                                logger.info(
                                    "Successfully added 'language' column to 'user_settings'"
                                )

                                # Step 2: Set the default value for existing rows
                                conn.execute(
                                    text(
                                        "UPDATE user_settings SET language = 'auto' WHERE language IS NULL"
                                    )
                                )
                                conn.commit()
                                logger.info(
                                    "Successfully initialized 'language' column values"
                                )
                            except Exception as add_error:
                                if (
                                    "already exists" in str(add_error).lower()
                                    or "duplicate column" in str(add_error).lower()
                                ):
                                    logger.info(
                                        "Column 'language' already exists in 'user_settings'"
                                    )
                                else:
                                    raise add_error
                    except Exception as alter_error:
                        logger.warning(
                            f"Failed to migrate 'user_settings' table: {alter_error}"
                        )

                # Self-healing migration: Change 'content' column to TEXT in 'notes' table
                if table_name == "notes":
                    logger.info("Checking 'content' column type in 'notes' table...")
                    try:
                        with engine.connect() as conn:
                            # Check actual data type
                            result = conn.execute(
                                text(
                                    "SELECT data_type FROM information_schema.columns "
                                    "WHERE table_name = 'notes' AND column_name = 'content'"
                                )
                            )
                            row = result.fetchone()
                            if row:
                                current_type = row[0]
                                logger.info(f"Current 'content' column type: {current_type}")
                                
                                if current_type.lower() != 'text':
                                    logger.info("Migrating 'content' column to TEXT using batch add/copy/drop/rename dance...")
                                    # DSQL workaround since ALTER COLUMN TYPE is not supported and 10s init limit exists
                                    try:
                                        # Use the existing 'conn' from line 152
                                        # 1. Check if content_new already exists
                                        check_res = conn.execute(text(
                                            "SELECT count(*) FROM information_schema.columns "
                                            "WHERE table_name = 'notes' AND column_name = 'content_new'"
                                        ))
                                        if check_res.fetchone()[0] == 0:
                                            logger.info("Step 1: Adding 'content_new' column...")
                                            conn.execute(text("ALTER TABLE notes ADD COLUMN content_new TEXT"))
                                            conn.commit()

                                        # 2. Copy data in small batches to stay under 10s init limit
                                        # Each cold start will copy another batch
                                        logger.info("Step 2: Copying data batch to 'content_new'...")
                                        conn.execute(text(
                                            "UPDATE notes SET content_new = content "
                                            "WHERE id IN (SELECT id FROM notes WHERE content_new IS NULL LIMIT 500)"
                                        ))
                                        conn.commit()

                                        # 3. Check if all rows are copied
                                        res = conn.execute(text("SELECT count(*) FROM notes WHERE content_new IS NULL"))
                                        remaining = res.fetchone()[0]
                                        
                                        if remaining == 0:
                                            logger.info("Step 3: Verification passed. Dropping 'content' and renaming 'content_new'...")
                                            conn.execute(text("ALTER TABLE notes DROP COLUMN content"))
                                            conn.commit()
                                            conn.execute(text("ALTER TABLE notes RENAME COLUMN content_new TO content"))
                                            conn.commit()

                                            try:
                                                conn.execute(text("ALTER TABLE notes ALTER COLUMN content SET NOT NULL"))
                                                conn.commit()
                                            except Exception:
                                                pass # DSQL might not support SET NOT NULL

                                            logger.info("Successfully migrated 'content' column to TEXT")
                                        else:
                                            logger.info(f"Step 2 incomplete: {remaining} rows left. Migration will continue on next start.")
                                    except Exception as migration_error:
                                        # Log but don't re-raise to allow app to start using old column
                                        logger.error(f"Migration dance step failed: {migration_error}")
                                else:
                                     logger.info("'content' column is already TEXT. No migration needed.")
                            else:
                                logger.warning("Could not find 'content' column in 'notes' table")
                                
                    except Exception as alter_error:
                        logger.warning(
                            f"Failed to migrate 'notes' table: {alter_error}"
                        )
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
