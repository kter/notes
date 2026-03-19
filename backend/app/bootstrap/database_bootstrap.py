"""Database schema bootstrap and runtime initialization helpers."""

import logging
import os
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlmodel import SQLModel

from alembic import command

ALEMBIC_VERSION_TABLE = "alembic_version"


class DatabaseSchemaBootstrapper:
    """Encapsulate schema bootstrap and Alembic handoff logic."""

    def __init__(
        self,
        engine_factory: Callable[[], Any],
        *,
        logger: logging.Logger | None = None,
    ) -> None:
        self.engine_factory = engine_factory
        self.logger = logger or logging.getLogger(__name__)

    def run(self) -> None:
        """Bring the database schema to the current Alembic revision."""
        self.logger.info("Starting database schema initialization...")

        try:
            self._import_models()
            self.logger.info(f"Models loaded: {list(SQLModel.metadata.tables.keys())}")
            engine = self.engine_factory()
            with engine.connect() as connection:
                table_names = set(inspect(connection).get_table_names())
                existing_tables = set(SQLModel.metadata.tables.keys()) & table_names
                alembic_config = self._get_alembic_config(connection=connection)
                head_revision = self._get_alembic_head_revision()
                current_revision = self._get_current_alembic_revision(connection)
                dsql_runtime = self._uses_dsql_runtime()

                if current_revision is not None:
                    if dsql_runtime:
                        if current_revision == head_revision:
                            self.logger.info(
                                "Alembic head revision already applied on DSQL; skipping upgrade"
                            )
                            return
                        self.logger.info(
                            "DSQL revision %s is behind head %s; bootstrapping current schema and stamping head",
                            current_revision,
                            head_revision,
                        )
                        self._bootstrap_legacy_schema(connection)
                        connection.commit()
                        self._stamp_head_manually(connection, head_revision)
                        return
                    self.logger.info(
                        "Alembic version table found; upgrading schema to head"
                    )
                    command.upgrade(alembic_config, "head")
                    connection.commit()
                elif dsql_runtime:
                    self.logger.info(
                        "DSQL database without Alembic version table detected; bootstrapping schema and stamping head"
                    )
                    self._bootstrap_legacy_schema(connection)
                    connection.commit()
                    self._stamp_head_manually(connection, head_revision)
                elif existing_tables:
                    self.logger.info(
                        "Existing schema without Alembic detected; bootstrapping and stamping head"
                    )
                    self._bootstrap_legacy_schema(connection)
                    connection.commit()
                    command.stamp(alembic_config, "head")
                    connection.commit()
                else:
                    self.logger.info(
                        "Fresh database detected; applying Alembic migrations"
                    )
                    command.upgrade(alembic_config, "head")
                    connection.commit()

            self.logger.info("Database schema initialization completed successfully")
        except Exception as exc:
            self.logger.error(
                f"Failed to initialize database schema: {exc}",
                exc_info=True,
            )
            raise

    @staticmethod
    def _import_models() -> None:
        import app.models  # noqa: F401

    @staticmethod
    def _get_backend_root() -> Path:
        return Path(__file__).resolve().parent.parent.parent

    def _get_alembic_config(self, connection=None) -> Config:
        config = Config(str(self._get_backend_root() / "alembic.ini"))
        config.set_main_option(
            "script_location", str(self._get_backend_root() / "alembic")
        )
        if connection is not None:
            config.attributes["connection"] = connection
        return config

    @staticmethod
    def _is_duplicate_column_error(error: Exception) -> bool:
        message = str(error).lower()
        return "already exists" in message or "duplicate column" in message

    def _ensure_legacy_column(
        self,
        connection,
        *,
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
            if self._is_duplicate_column_error(error):
                return
            raise

        if update_sql is not None:
            connection.execute(text(update_sql), params or {})

    def _ensure_legacy_column_portable(
        self,
        connection,
        *,
        table_name: str,
        column_name: str,
        alter_sql: str,
        update_sql: str | None = None,
        params: dict | None = None,
    ) -> None:
        dialect_name = connection.dialect.name
        if dialect_name == "sqlite":
            self._ensure_legacy_column(
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
            if self._is_duplicate_column_error(error):
                return
            raise

        if update_sql is not None:
            connection.execute(text(update_sql), params or {})

    def _bootstrap_legacy_schema(self, connection) -> None:
        from app.models.token_usage import MONTHLY_TOKEN_LIMIT

        self.logger.info("Bootstrapping legacy schema before Alembic stamp")

        for table in SQLModel.metadata.sorted_tables:
            table.create(bind=connection, checkfirst=True)

        self._ensure_legacy_column_portable(
            connection,
            table_name="user_settings",
            column_name="language",
            alter_sql="ALTER TABLE user_settings ADD COLUMN language VARCHAR(10)",
            update_sql="UPDATE user_settings SET language = 'auto' WHERE language IS NULL",
        )
        self._ensure_legacy_column_portable(
            connection,
            table_name="user_settings",
            column_name="token_limit",
            alter_sql="ALTER TABLE user_settings ADD COLUMN token_limit INTEGER",
            update_sql="UPDATE user_settings SET token_limit = :token_limit WHERE token_limit IS NULL",
            params={"token_limit": MONTHLY_TOKEN_LIMIT},
        )
        self._ensure_legacy_column_portable(
            connection,
            table_name="mcp_tokens",
            column_name="last_used_at",
            alter_sql="ALTER TABLE mcp_tokens ADD COLUMN last_used_at TIMESTAMP WITH TIME ZONE",
        )
        self._ensure_legacy_column_portable(
            connection,
            table_name="folders",
            column_name="version",
            alter_sql="ALTER TABLE folders ADD COLUMN version INTEGER",
            update_sql="UPDATE folders SET version = 1 WHERE version IS NULL",
        )
        self._ensure_legacy_column_portable(
            connection,
            table_name="folders",
            column_name="deleted_at",
            alter_sql="ALTER TABLE folders ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE",
        )
        self._ensure_legacy_column_portable(
            connection,
            table_name="notes",
            column_name="version",
            alter_sql="ALTER TABLE notes ADD COLUMN version INTEGER",
            update_sql="UPDATE notes SET version = 1 WHERE version IS NULL",
        )
        self._ensure_legacy_column_portable(
            connection,
            table_name="notes",
            column_name="deleted_at",
            alter_sql="ALTER TABLE notes ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE",
        )

    def _get_alembic_head_revision(self) -> str:
        script = ScriptDirectory.from_config(self._get_alembic_config())
        head = script.get_current_head()
        if head is None:
            raise RuntimeError("Alembic head revision could not be determined")
        return head

    @staticmethod
    def _get_current_alembic_revision(connection) -> str | None:
        if ALEMBIC_VERSION_TABLE not in inspect(connection).get_table_names():
            return None

        return connection.execute(
            text(f"SELECT version_num FROM {ALEMBIC_VERSION_TABLE}")  # noqa: S608
        ).scalar_one_or_none()

    @staticmethod
    def _uses_dsql_runtime() -> bool:
        return bool(os.environ.get("DSQL_CLUSTER_ENDPOINT"))

    def _stamp_head_manually(self, connection, revision: str) -> None:
        if ALEMBIC_VERSION_TABLE not in inspect(connection).get_table_names():
            connection.execute(
                text(
                    """
                    CREATE TABLE alembic_version (
                        version_num VARCHAR(32) NOT NULL PRIMARY KEY
                    )
                    """
                )
            )
            connection.commit()

        current_revision = self._get_current_alembic_revision(connection)
        if current_revision is None:
            connection.execute(
                text("INSERT INTO alembic_version (version_num) VALUES (:version_num)"),
                {"version_num": revision},
            )
        else:
            connection.execute(
                text("UPDATE alembic_version SET version_num = :version_num"),
                {"version_num": revision},
            )
        connection.commit()


class RequestDatabaseInitializer:
    """Run database bootstrap lazily on the first non-health request."""

    def __init__(
        self,
        initialize_database: Callable[[], None],
        *,
        healthcheck_path: str = "/health",
    ) -> None:
        self.initialize_database = initialize_database
        self.healthcheck_path = healthcheck_path
        self._initialized = False

    def ensure_ready(
        self,
        *,
        path: str,
        dependency_overrides: Mapping[object, object],
        session_dependency: object,
    ) -> None:
        if session_dependency in dependency_overrides:
            return
        if self._initialized or path.endswith(self.healthcheck_path):
            return
        self.initialize_database()
        self._initialized = True


def create_database_schema(
    engine_factory: Callable[[], Any],
    *,
    logger: logging.Logger | None = None,
) -> None:
    DatabaseSchemaBootstrapper(engine_factory, logger=logger).run()


def run_cold_start_database_bootstrap(
    *,
    initialize_database: Callable[[], None],
    logger: logging.Logger,
    context_label: str,
) -> None:
    logger.info("%s: initializing database schema...", context_label)
    try:
        initialize_database()
        logger.info("%s: database schema initialization complete", context_label)
    except Exception as exc:
        logger.error(
            "%s: database schema initialization failed: %s",
            context_label,
            exc,
            exc_info=True,
        )
        raise
