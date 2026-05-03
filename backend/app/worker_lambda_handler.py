"""SQS キューからの AI 編集ジョブを処理する Worker Lambda のエントリーポイント。

責務: SQS イベントの検証とコールドスタート初期化、AI 編集ジョブキューの実行。
主要なエクスポート: handler (Lambda 関数ハンドラー)。
呼び出し関係: SQS トリガーから呼び出され、app.features.assistant の処理に委譲する。
"""

import logging

from app.bootstrap import run_cold_start_database_bootstrap
from app.database import create_db_and_tables
from app.features.assistant import run_edit_job_queue_records
from app.logging_utils import bind_log_context, configure_logging, reset_log_context
from app.observability import init_sentry

# 構造化ロギングを設定（コールドスタート時に一度だけ実行）
configure_logging()
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Sentry のエラー監視を初期化
init_sentry()

# コールドスタート時にDBスキーマを初期化
run_cold_start_database_bootstrap(
    initialize_database=create_db_and_tables,
    logger=logger,
    context_label="AI edit worker cold start",
)


def handler(event, context):
    """SQS イベントを受け取り、キューイングされた AI 編集ジョブを処理する。

    ログコンテキストをリクエストIDで束縛し、処理後に必ずリセットする。
    SQS 以外のイベントソースや不正な形式の場合は ValueError を送出する。
    """
    context_tokens = bind_log_context(
        request_id=getattr(context, "aws_request_id", None),
    )
    try:
        if not isinstance(event, dict) or not event.get("Records"):
            raise ValueError("AI edit worker expects SQS records")

        first_record = event["Records"][0]
        if first_record.get("eventSource") != "aws:sqs":
            # SQS 以外のイベントソース（SNS等）は受け付けない
            raise ValueError("AI edit worker only supports SQS events")

        return run_edit_job_queue_records(event["Records"])
    finally:
        reset_log_context(context_tokens)
