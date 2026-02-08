from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import create_db_and_tables
from app.routers import ai, folders, notes, settings, share

settings_app = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # We move database initialization to the first request to avoid Lambda's 10s init timeout
    yield
    # Shutdown: cleanup


app = FastAPI(
    title=settings_app.app_name,
    description="Mac Notes Clone API with AI features",
    version="0.1.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings_app.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(folders.router, prefix="/api/folders", tags=["folders"])
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(share.router, prefix="/api", tags=["share"])


_db_initialized = False


@app.middleware("http")
async def db_init_middleware(request: Request, call_next):
    """Ensure database is initialized on the first request."""
    global _db_initialized
    if not _db_initialized and not request.url.path.endswith("/health"):
        create_db_and_tables()
        _db_initialized = True
    return await call_next(request)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
