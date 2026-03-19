from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.bootstrap import RequestDatabaseInitializer
from app.config import get_settings
from app.database import create_db_and_tables, get_session
from app.features import admin, assistant, images, mcp, settings, share
from app.features.workspace import folders_router, notes_router, snapshot_router
from app.http_errors import to_http_exception
from app.observability import init_sentry
from app.shared import DomainError

settings_app = get_settings()
init_sentry(with_fastapi=True)


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
app.include_router(folders_router, prefix="/api/folders", tags=["folders"])
app.include_router(notes_router, prefix="/api/notes", tags=["notes"])
app.include_router(snapshot_router, prefix="/api/workspace", tags=["workspace"])
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(assistant.router, prefix="/api/ai", tags=["ai"])
app.include_router(mcp.router)
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(share.router, prefix="/api", tags=["share"])
app.include_router(admin.router)


@app.exception_handler(DomainError)
async def handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
    http_error = to_http_exception(exc)
    return JSONResponse(
        status_code=http_error.status_code,
        content={"detail": http_error.detail},
        headers=http_error.headers,
    )


database_initializer = RequestDatabaseInitializer(create_db_and_tables)


@app.middleware("http")
async def db_init_middleware(request: Request, call_next):
    """Ensure database migrations have run on the first request."""
    database_initializer.ensure_ready(
        path=request.url.path,
        dependency_overrides=app.dependency_overrides,
        session_dependency=get_session,
    )
    return await call_next(request)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
