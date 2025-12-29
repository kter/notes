from unittest.mock import patch

from sqlalchemy import inspect, text
from sqlmodel import create_engine
from sqlmodel.pool import StaticPool

from app.database import create_db_and_tables


def test_migration_adds_language_column():
    """Test that create_db_and_tables adds the language column to an existing table."""
    # 1. Create a database with an old schema (missing 'language' column)
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Manually create the table without the language column
    with engine.connect() as conn:
        conn.execute(
            text("""
            CREATE TABLE user_settings (
                user_id VARCHAR PRIMARY KEY,
                llm_model_id VARCHAR,
                created_at DATETIME,
                updated_at DATETIME
            )
        """)
        )
        conn.execute(
            text("""
            INSERT INTO user_settings (user_id, llm_model_id) VALUES ('user1', 'gpt-4')
        """)
        )
        conn.commit()

    # 2. Patch get_dsql_engine to return our test engine
    with patch("app.database.get_dsql_engine", return_value=engine):
        # 3. Run the migration
        create_db_and_tables()

    # 4. Verify the column exists and has the default value
    with engine.connect() as conn:
        # Check column existence
        inspector = inspect(engine)
        columns = [c["name"] for c in inspector.get_columns("user_settings")]
        assert "language" in columns

        # Check existing row values
        result = conn.execute(
            text("SELECT language FROM user_settings WHERE user_id = 'user1'")
        ).fetchone()
        assert result[0] == "auto"


def test_migration_idempotent():
    """Test that running migration multiple times doesn't fail."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    with patch("app.database.get_dsql_engine", return_value=engine):
        # Run first time
        create_db_and_tables()

        # Run second time
        create_db_and_tables()

    # Verify column exists
    inspector = inspect(engine)
    columns = [c["name"] for c in inspector.get_columns("user_settings")]
    assert "language" in columns
