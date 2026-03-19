import os
from unittest.mock import patch

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlmodel import create_engine
from sqlmodel.pool import StaticPool

from app.database import create_db_and_tables


def _get_alembic_head() -> str:
    config = Config("alembic.ini")
    config.set_main_option("script_location", "alembic")
    return ScriptDirectory.from_config(config).get_current_head()


ALEMBIC_HEAD = _get_alembic_head()


def _make_engine():
    return create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


def test_migration_bootstraps_legacy_schema_and_stamps_head():
    """Legacy schemas are normalized once and brought under Alembic control."""
    engine = _make_engine()

    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE user_settings (
                    user_id VARCHAR PRIMARY KEY,
                    llm_model_id VARCHAR,
                    created_at DATETIME,
                    updated_at DATETIME
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE mcp_tokens (
                    id VARCHAR PRIMARY KEY,
                    user_id VARCHAR,
                    token_hash VARCHAR,
                    name VARCHAR,
                    created_at DATETIME,
                    expires_at DATETIME,
                    revoked_at DATETIME
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO user_settings (user_id, llm_model_id)
                VALUES ('user1', 'gpt-4')
                """
            )
        )
        conn.commit()

    with patch("app.database.get_dsql_engine", return_value=engine):
        create_db_and_tables()

    inspector = inspect(engine)
    user_settings_columns = {
        column["name"] for column in inspector.get_columns("user_settings")
    }
    mcp_tokens_columns = {
        column["name"] for column in inspector.get_columns("mcp_tokens")
    }
    folder_columns = {column["name"] for column in inspector.get_columns("folders")}
    note_columns = {column["name"] for column in inspector.get_columns("notes")}

    assert "language" in user_settings_columns
    assert "token_limit" in user_settings_columns
    assert "last_used_at" in mcp_tokens_columns
    assert "version" in folder_columns
    assert "deleted_at" in folder_columns
    assert "version" in note_columns
    assert "deleted_at" in note_columns
    assert "alembic_version" in inspector.get_table_names()

    with engine.connect() as conn:
        language = conn.execute(
            text("SELECT language FROM user_settings WHERE user_id = 'user1'")
        ).scalar_one()
        token_limit = conn.execute(
            text("SELECT token_limit FROM user_settings WHERE user_id = 'user1'")
        ).scalar_one()
        version = conn.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()

    assert language == "auto"
    assert token_limit == 30_000
    assert version == ALEMBIC_HEAD


def test_migration_applies_initial_revision_to_fresh_db():
    """Fresh databases should be created from the Alembic revision history."""
    engine = _make_engine()

    with patch("app.database.get_dsql_engine", return_value=engine):
        create_db_and_tables()

    inspector = inspect(engine)
    expected_tables = {
        "alembic_version",
        "ai_edit_jobs",
        "applied_mutations",
        "app_users",
        "folders",
        "mcp_tokens",
        "note_shares",
        "notes",
        "token_usage",
        "user_settings",
    }

    assert expected_tables.issubset(set(inspector.get_table_names()))
    folder_columns = {column["name"] for column in inspector.get_columns("folders")}
    note_columns = {column["name"] for column in inspector.get_columns("notes")}
    assert "version" in folder_columns
    assert "deleted_at" in folder_columns
    assert "version" in note_columns
    assert "deleted_at" in note_columns

    with engine.connect() as conn:
        version = conn.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()

    assert version == ALEMBIC_HEAD


def test_migration_bootstraps_fresh_db_for_dsql_runtime():
    """DSQL bootstrap should stamp head without relying on Alembic DDL/DML mixing."""
    engine = _make_engine()

    with patch("app.database.get_dsql_engine", return_value=engine):
        with patch.dict(os.environ, {"DSQL_CLUSTER_ENDPOINT": "test-cluster"}):
            create_db_and_tables()

    inspector = inspect(engine)
    assert "alembic_version" in inspector.get_table_names()

    with engine.connect() as conn:
        version = conn.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()

    assert version == ALEMBIC_HEAD


def test_migration_bootstraps_existing_dsql_revision_to_head():
    """DSQL databases should bootstrap model metadata instead of Alembic upgrade."""
    engine = _make_engine()

    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE app_users (
                    user_id VARCHAR PRIMARY KEY,
                    admin BOOLEAN,
                    created_at DATETIME,
                    updated_at DATETIME,
                    last_seen_at DATETIME,
                    email VARCHAR,
                    display_name VARCHAR
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE alembic_version (
                    version_num VARCHAR(32) NOT NULL PRIMARY KEY
                )
                """
            )
        )
        conn.execute(
            text("INSERT INTO alembic_version (version_num) VALUES ('20260310_01')")
        )
        conn.commit()

    with patch("app.database.get_dsql_engine", return_value=engine):
        with patch.dict(os.environ, {"DSQL_CLUSTER_ENDPOINT": "test-cluster"}):
            create_db_and_tables()

    inspector = inspect(engine)
    assert "ai_edit_jobs" in inspector.get_table_names()
    assert "applied_mutations" in inspector.get_table_names()
    folder_columns = {column["name"] for column in inspector.get_columns("folders")}
    note_columns = {column["name"] for column in inspector.get_columns("notes")}
    assert "version" in folder_columns
    assert "deleted_at" in folder_columns
    assert "version" in note_columns
    assert "deleted_at" in note_columns

    with engine.connect() as conn:
        version = conn.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()

    assert version == ALEMBIC_HEAD


def test_migration_idempotent():
    """Running schema initialization multiple times should be safe."""
    engine = _make_engine()

    with patch("app.database.get_dsql_engine", return_value=engine):
        create_db_and_tables()
        create_db_and_tables()

    with engine.connect() as conn:
        version = conn.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()

    assert version == ALEMBIC_HEAD
