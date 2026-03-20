from types import SimpleNamespace

from app.bootstrap import DatabaseSchemaBootstrapper, RequestDatabaseInitializer


def test_request_database_initializer_runs_once_for_first_non_health_request():
    calls: list[str] = []
    initializer = RequestDatabaseInitializer(lambda: calls.append("initialized"))

    initializer.ensure_ready(
        path="/api/notes",
        dependency_overrides={},
        session_dependency=object(),
    )
    initializer.ensure_ready(
        path="/api/folders",
        dependency_overrides={},
        session_dependency=object(),
    )

    assert calls == ["initialized"]


def test_request_database_initializer_skips_healthcheck_and_dependency_override():
    calls: list[str] = []
    session_dependency = object()
    initializer = RequestDatabaseInitializer(lambda: calls.append("initialized"))

    initializer.ensure_ready(
        path="/health",
        dependency_overrides={},
        session_dependency=session_dependency,
    )
    initializer.ensure_ready(
        path="/api/notes",
        dependency_overrides={session_dependency: lambda: None},
        session_dependency=session_dependency,
    )

    assert calls == []


def test_bootstrap_commits_between_dsql_ddl_and_updates(monkeypatch):
    executed: list[tuple[str, dict | None]] = []
    commit_calls = 0

    class FakeConnection:
        dialect = SimpleNamespace(name="postgresql")

        def execute(self, statement, params=None):
            nonlocal commit_calls
            sql = str(statement).strip()
            executed.append((sql, params))
            if "information_schema.columns" in sql:
                return SimpleNamespace(scalar_one_or_none=lambda: None)
            return None

        def commit(self):
            nonlocal commit_calls
            commit_calls += 1

    monkeypatch.setattr(
        DatabaseSchemaBootstrapper,
        "_uses_dsql_runtime",
        staticmethod(lambda: True),
    )

    bootstrapper = DatabaseSchemaBootstrapper(lambda: None)
    bootstrapper._ensure_legacy_column_portable(
        FakeConnection(),
        table_name="folders",
        column_name="version",
        alter_sql="ALTER TABLE folders ADD COLUMN version INTEGER",
        update_sql="UPDATE folders SET version = 1 WHERE version IS NULL",
    )

    assert executed == [
        (
            "SELECT column_name\n            FROM information_schema.columns\n            WHERE table_name = :table_name AND column_name = :column_name",
            {"table_name": "folders", "column_name": "version"},
        ),
        ("ALTER TABLE folders ADD COLUMN version INTEGER", None),
        ("UPDATE folders SET version = 1 WHERE version IS NULL", {}),
    ]
    assert commit_calls == 2


def test_bootstrap_commits_after_each_table_create_on_dsql(monkeypatch):
    commit_calls = 0

    class FakeTable:
        def create(self, *, bind, checkfirst):
            assert bind is connection
            assert checkfirst is True

    class FakeConnection:
        def commit(self):
            nonlocal commit_calls
            commit_calls += 1

    connection = FakeConnection()
    bootstrapper = DatabaseSchemaBootstrapper(lambda: None)

    monkeypatch.setattr(
        DatabaseSchemaBootstrapper,
        "_uses_dsql_runtime",
        staticmethod(lambda: True),
    )
    monkeypatch.setattr(
        "app.models.token_usage.MONTHLY_TOKEN_LIMIT",
        1000,
        raising=False,
    )
    monkeypatch.setattr(
        bootstrapper,
        "_sorted_tables",
        lambda: [FakeTable(), FakeTable()],
    )
    monkeypatch.setattr(
        bootstrapper,
        "_ensure_legacy_column_portable",
        lambda *args, **kwargs: None,
    )

    bootstrapper._bootstrap_legacy_schema(connection)

    assert commit_calls == 2
