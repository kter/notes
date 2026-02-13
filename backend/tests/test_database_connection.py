import os
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import text

# Set environment variables before importing database module
os.environ["DSQL_CLUSTER_ENDPOINT"] = "test-dsql-cluster"
os.environ["AWS_REGION"] = "ap-northeast-1"

from app.database import get_dsql_engine


@pytest.fixture
def mock_boto3():
    with patch("app.database.boto3") as mock:
        yield mock


@pytest.fixture
def mock_connect():
    # Patch psycopg2.connect globally
    with patch("psycopg2.connect") as mock:
        yield mock


@pytest.fixture
def mock_psycopg2_extras():
    # Patch various extras methods that check connection types
    with patch("psycopg2.extras.register_uuid") as mock_uuid, \
         patch("psycopg2.extras.HstoreAdapter.get_oids") as mock_hstore:
        yield mock_uuid, mock_hstore


def test_dsql_connection_creates_fresh_token(mock_boto3, mock_connect, mock_psycopg2_extras):
    """Test that a fresh token is generated for each new connection."""
    # Reset the engine cache
    import app.database
    app.database._engine = None
    
    # Setup mocks
    mock_uuid, mock_hstore = mock_psycopg2_extras
    mock_hstore.return_value = None 

    # Mock DSQL client and token generation
    mock_dsql_client = MagicMock()
    mock_boto3.client.return_value = mock_dsql_client
    mock_dsql_client.generate_db_connect_admin_auth_token.side_effect = [
        "token1",
        "token2",
    ]

    # Mock psycopg2 connection
    mock_conn = MagicMock()
    mock_connect.return_value = mock_conn
    
    # Mock cursor
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    # Return a version string that SQLAlchemy can parse
    mock_cursor.fetchone.return_value = ["PostgreSQL 14.0"]
    # For fetchall used by other things
    mock_cursor.fetchall.return_value = []

    # Get the engine
    engine = get_dsql_engine()

    # Create first connection
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))

    # Verify first token generation
    mock_boto3.client.assert_called_with("dsql", region_name="ap-northeast-1")
    mock_dsql_client.generate_db_connect_admin_auth_token.assert_called_with(
        Hostname="test-dsql-cluster.dsql.ap-northeast-1.on.aws",
        Region="ap-northeast-1",
    )
    
    # Verify connect call
    mock_connect.assert_called_with(
        host="test-dsql-cluster.dsql.ap-northeast-1.on.aws",
        port=5432,
        database="postgres",
        user="admin",
        password="token1",
        sslmode="require",
        connect_timeout=5,
    )

    # Dispose to invalidate pool
    engine.dispose()

    # Create second connection
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))

    # Verify second token generation (should be token2)
    # Note: connect might be called multiple times due to retry logic if first attempt fails
    # but here we mock success on first try, so it should be fine.
    
    # We need to check key word arguments for the *last* call
    call_args = mock_connect.call_args
    assert call_args.kwargs["password"] == "token2"


def test_dsql_connection_retries_on_signature_error(mock_boto3, mock_connect, mock_psycopg2_extras):
    """Test that connection retries on 'Signature expired' error."""
    # Reset the engine cache
    import app.database
    app.database._engine = None
    
    # Setup mocks
    mock_uuid, mock_hstore = mock_psycopg2_extras
    mock_hstore.return_value = None 

    # Mock DSQL client
    mock_dsql_client = MagicMock()
    mock_boto3.client.return_value = mock_dsql_client
    mock_dsql_client.generate_db_connect_admin_auth_token.as_return_value = "mock_token"

    # Mock psycopg2 connection failure then success
    import psycopg2
    
    # First call raises Signature expired check, second succeeds
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    mock_cursor.fetchone.return_value = ["PostgreSQL 14.0"]
    
    mock_connect.side_effect = [
        psycopg2.OperationalError("FATAL: unable to accept connection, access denied\nHINT: Signature expired"),
        mock_conn
    ]

    # Get the engine and connect
    engine = get_dsql_engine()
    
    # This should succeed after one retry
    with patch("time.sleep") as mock_sleep:  # Mock sleep to speed up test
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            
        # Verify sleep was called
        mock_sleep.assert_called()

    # Verify connect was called twice
    assert mock_connect.call_count == 2
