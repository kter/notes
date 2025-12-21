from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import create_db_and_tables
from app.routers import ai, folders, notes

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup: create database tables
    create_db_and_tables()
    yield
    # Shutdown: cleanup


app = FastAPI(
    title=settings.app_name,
    description="Mac Notes Clone API with AI features",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(folders.router, prefix="/api/folders", tags=["folders"])
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
