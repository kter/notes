from app.bootstrap import RequestDatabaseInitializer


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
