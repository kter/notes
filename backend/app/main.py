from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.bootstrap import RequestDatabaseInitializer
from app.config import get_settings
from app.database import create_db_and_tables, get_session
from app.features.admin.router import router as admin_router
from app.features.mcp.router import router as mcp_router
from app.features.settings.router import router as settings_router
from app.features.share.router import router as share_router
from app.http_errors import to_http_exception
from app.observability import init_sentry
from app.routers import ai, folders, images, notes
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
app.include_router(folders.router, prefix="/api/folders", tags=["folders"])
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(mcp_router)
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
app.include_router(share_router, prefix="/api", tags=["share"])
app.include_router(admin_router)


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
