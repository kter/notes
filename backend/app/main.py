"""FastAPIアプリケーションのエントリポイント。

責務: HTTPミドルウェア・ルーター登録・例外ハンドラの組み立て。
主要なエクスポート: app (FastAPIインスタンス)。
呼び出し関係: lambda_handler.py から Mangum 経由で呼ばれる。各 features ルーターを束ねる。
"""

import logging
from contextlib import asynccontextmanager
from time import perf_counter
from uuid import uuid4

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.bootstrap import RequestDatabaseInitializer
from app.config import get_settings
from app.database import create_db_and_tables, get_session
from app.features import admin, assistant, images, settings, share
from app.features.workspace import (
    changes_router,
    folders_router,
    notes_router,
    snapshot_router,
)
from app.http_errors import to_http_exception
from app.logging_utils import (
    bind_log_context,
    configure_logging,
    log_event,
    reset_log_context,
)
from app.observability import (
    init_sentry,
    set_sentry_request_context,
    set_sentry_user_context,
)
from app.shared import DomainError

settings_app = get_settings()
configure_logging()
init_sentry(with_fastapi=True)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """アプリケーションのライフサイクルを管理する。

    DBの初期化はコールドスタート時の10秒タイムアウトを避けるため
    最初のリクエスト受信時まで遅延させる。
    """
    # DB初期化は最初のリクエストで遅延実行するため、ここでは何もしない
    yield
    # シャットダウン時のクリーンアップ（現時点では不要）


app = FastAPI(
    title=settings_app.app_name,
    description="Mac Notes Clone API with AI features",
    version="0.1.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

# CORSミドルウェアを設定（フロントエンドからのクロスオリジンリクエストを許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings_app.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Request-ID"],
)

# 各機能ルーターをAPIパスプレフィックスに紐付けて登録
app.include_router(folders_router, prefix="/api/folders", tags=["folders"])
app.include_router(notes_router, prefix="/api/notes", tags=["notes"])
app.include_router(changes_router, prefix="/api/workspace", tags=["workspace"])
app.include_router(snapshot_router, prefix="/api/workspace", tags=["workspace"])
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(assistant.router, prefix="/api/ai", tags=["ai"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(share.router, prefix="/api", tags=["share"])
app.include_router(admin.router)


@app.exception_handler(DomainError)
async def handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
    """DomainError をキャッチして適切なHTTPステータスコードのJSONレスポンスを返す。"""
    http_error = to_http_exception(exc)
    return JSONResponse(
        status_code=http_error.status_code,
        content={"detail": http_error.detail},
        headers=http_error.headers,
    )


database_initializer = RequestDatabaseInitializer(create_db_and_tables)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """リクエストコンテキストをバインドし、DBの準備を確認したうえでアクセスログを1件出力する。"""
    request_id = request.headers.get("x-request-id") or str(uuid4())
    sentry_trace = request.headers.get("sentry-trace", "")
    traceparent = request.headers.get("traceparent", "")
    trace_id = None

    # sentry-trace ヘッダーが優先。なければ W3C traceparent から trace_id を抽出する
    if sentry_trace:
        trace_id = sentry_trace.split("-", maxsplit=1)[0] or None
    elif traceparent:
        segments = traceparent.split("-")
        if len(segments) >= 2:
            trace_id = segments[1] or None

    context_tokens = bind_log_context(
        request_id=request_id,
        trace_id=trace_id,
        method=request.method,
        path=request.url.path,
    )
    request.state.request_id = request_id
    request.state.trace_id = trace_id
    set_sentry_user_context(None)
    set_sentry_request_context(
        request_id=request_id,
        route=request.url.path,
        method=request.method,
        trace_id=trace_id,
    )

    started = perf_counter()
    outcome = "success"
    reason = None

    try:
        database_initializer.ensure_ready(
            path=request.url.path,
            dependency_overrides=app.dependency_overrides,
            session_dependency=get_session,
        )
        response = await call_next(request)
    except Exception as exc:
        sentry_sdk.capture_exception(exc)
        outcome = "error"
        reason = "unhandled_exception"
        # ミドルウェア層で補足されなかった例外は500で返却
        response = JSONResponse(
            status_code=500,
            content={"detail": "Internal Server Error"},
        )

    latency_ms = round((perf_counter() - started) * 1000, 2)
    response.headers["X-Request-ID"] = request_id

    status_code = response.status_code
    # /health はノイズ抑制のため DEBUG レベルに落とす
    if request.url.path == "/health":
        level = logging.DEBUG
    elif status_code >= 500:
        level = logging.ERROR
    elif status_code >= 400:
        level = logging.WARNING
        outcome = "failure"
    else:
        level = logging.INFO

    log_event(
        logger,
        level,
        "ops.http.request.completed",
        method=request.method,
        path=request.url.path,
        status_code=status_code,
        latency_ms=latency_ms,
        outcome=outcome,
        reason=reason,
    )
    reset_log_context(context_tokens)
    return response


@app.get("/health")
async def health_check():
    """ロードバランサー・デプロイ検証用のヘルスチェックエンドポイント。"""
    return {"status": "healthy"}
