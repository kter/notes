"""Mangum を使用して FastAPI アプリを AWS Lambda で動かすエントリーポイント。

責務: コールドスタート時のDB初期化と API Gateway イベントの ASGI 変換。
主要なエクスポート: handler (Lambda 関数ハンドラー)。
呼び出し関係: API Gateway から直接呼び出される。内部で app.main.app を使用。
"""

import logging

from mangum import Mangum

from app.bootstrap import run_cold_start_database_bootstrap
from app.bootstrap.database_bootstrap import create_database_schema
from app.database import get_dsql_engine
from app.logging_utils import configure_logging
from app.main import app

# 構造化ロギングを設定（コールドスタート時に一度だけ実行）
configure_logging()
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# コールドスタート時にDBスキーマを初期化
run_cold_start_database_bootstrap(
    initialize_database=lambda: create_database_schema(get_dsql_engine, logger=logger),
    logger=logger,
    context_label="Lambda cold start",
)

# API Gateway のイベントを ASGI に変換するハンドラーを生成
asgi_handler = Mangum(
    app,
    lifespan="off",
    api_gateway_base_path="/",
)


def handler(event, context):
    """API Gateway からのリクエストイベントを受け取り FastAPI アプリに委譲する。"""
    return asgi_handler(event, context)
