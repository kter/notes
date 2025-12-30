"""Test fixtures and configuration."""

from collections.abc import Callable, Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.auth.dependencies import get_user_id
from app.database import get_session
from app.main import app

# Mock user ID for testing
TEST_USER_ID = "test-user-123"
OTHER_USER_ID = "other-user-456"


# Test database engine (SQLite in-memory)
@pytest.fixture(name="engine")
def engine_fixture():
    """Create a test database engine."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture(name="session")
def session_fixture(engine) -> Generator[Session, None, None]:
    """Create a test database session."""
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session) -> Generator[TestClient, None, None]:
    """Create a test client with mocked dependencies for the default test user."""

    def get_session_override():
        yield session

    def get_user_id_override() -> str:
        return TEST_USER_ID

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_user_id] = get_user_id_override

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture(name="make_client")
def make_client_fixture(
    session: Session,
) -> Generator[Callable[[str], TestClient], None, None]:
    """Factory fixture to create test clients for specific users.

    Usage:
        client = make_client("user-123")
        # or
        client = make_client(TEST_USER_ID)
    """
    clients = []

    def _make_client(user_id: str) -> TestClient:
        def get_session_override():
            yield session

        def get_user_id_override() -> str:
            return user_id

        app.dependency_overrides[get_session] = get_session_override
        app.dependency_overrides[get_user_id] = get_user_id_override

        client = TestClient(app)
        clients.append(client)
        return client

    yield _make_client

    for client in clients:
        client.close()
    app.dependency_overrides.clear()
