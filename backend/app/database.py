"""Database connection for Aurora DSQL."""

import logging
import os
import time
from collections.abc import Generator

import boto3
import psycopg2
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
        from app.models import AppUser, Folder, MCPToken, Note, NoteShare, TokenUsage, UserSettings  # noqa: E401, I001, F401

        logger.info(f"Models loaded: {list(SQLModel.metadata.tables.keys())}")

        engine = get_dsql_engine()

        # For DSQL: create each table individually in separate transactions
        # This works around the "multiple ddl statements not supported in a transaction" error
        for table_name, table in SQLModel.metadata.tables.items():
            logger.info(f"Creating table '{table_name}' if not exists...")
            try:
                table.create(engine, checkfirst=True)
                logger.info(f"Table '{table_name}' created or already exists")
            except Exception as e:
                logger.warning(f"Failed to create table '{table_name}': {e}")
                
        # Force explicit creation of missing tables
        try:
            from app.models.token_usage import TokenUsage
            TokenUsage.__table__.create(engine, checkfirst=True)
            logger.info("TokenUsage table initialized")
        except Exception as e:
            logger.warning(f"Failed to create TokenUsage table: {e}")

        try:
            from app.models.mcp_token import MCPToken
            # Match the class name to the table name
            MCPToken.__table__.create(engine, checkfirst=True)
            logger.info("MCPToken table initialized")
        except Exception as e:
            logger.warning(f"Failed to create MCPToken table: {e}")
        
        for table_name, table in SQLModel.metadata.tables.items():
            try:

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

                # Self-healing migration: Add 'token_limit' column to 'user_settings' if missing
                if table_name == "user_settings":
                    logger.info("Checking for 'token_limit' column in 'user_settings'...")
                    try:
                        with engine.connect() as conn:
                            try:
                                conn.execute(text("ALTER TABLE user_settings ADD COLUMN token_limit INTEGER"))
                                conn.commit()
                                conn.execute(text(f"UPDATE user_settings SET token_limit = {30_000} WHERE token_limit IS NULL"))
                                conn.commit()
                                logger.info("Added 'token_limit' column to 'user_settings' table")
                            except Exception as add_error:
                                if "already exists" in str(add_error).lower() or "duplicate column" in str(add_error).lower():
                                    pass
                                else:
                                    logger.warning(f"Failed to add token_limit column: {add_error}")
                    except Exception as alter_error:
                        logger.warning(f"Failed to migrate user_settings token_limit: {alter_error}")

                # Self-healing migration: Add 'last_used_at' column to 'mcp_tokens' if missing
                if table_name == "mcp_tokens":
                    logger.info("Checking for 'last_used_at' column in 'mcp_tokens'...")
                    try:
                        with engine.connect() as conn:
                            try:
                                conn.execute(text("ALTER TABLE mcp_tokens ADD COLUMN last_used_at TIMESTAMP WITH TIME ZONE"))
                                conn.commit()
                                logger.info("Added 'last_used_at' column to 'mcp_tokens' table")
                            except Exception as add_error:
                                if "already exists" in str(add_error).lower() or "duplicate column" in str(add_error).lower():
                                    pass
                                else:
                                    logger.warning(f"Failed to add last_used_at column: {add_error}")
                    except Exception as alter_error:
                        logger.warning(f"Failed to migrate mcp_tokens: {alter_error}")

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
