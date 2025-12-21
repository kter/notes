from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

settings = get_settings()

# Create engine with connection pooling
engine = create_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
)


def create_db_and_tables() -> None:
    """Create database tables if they don't exist."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """Dependency to get database session."""
    with Session(engine) as session:
        yield session
