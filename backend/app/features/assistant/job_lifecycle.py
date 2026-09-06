"""AI ジョブの状態機械。

責務: pending → running → completed / failed の遷移、二重実行の冪等ガード、
    所有者アサーション、例外から失敗理由への分類を担う。ジョブをどこで実行するか
    （job_queue）とも、AI をどう呼ぶか（use_cases）とも独立している。
主要なエクスポート: run_job。
呼び出し関係: job_runner.py の process_* から呼ばれる。

このモジュールが独立している理由:
    以前は 507 行の job_runner に、トランスポート・状態機械・レコード種別の
    3 つの無関係な軸が同居していた。レコード種別ごとの差分は AIJobRecordSpec
    という 5 フィールドの記述子が吸収していたが、実際の差は「結果をどの列に
    書くか」「ログに kind を出すか」の 2 点だけで、どちらもモデル自身が
    答えられる。記述子を消し、リポジトリ 1 つを渡す形にした。
"""

import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlmodel import Session

from app.database import get_dsql_engine
from app.features.assistant.errors import (
    AI_EDIT_JOB_TIMEOUT_MESSAGE,
    AIApplicationTimeoutError,
    AITokenLimitExceededError,
)
from app.features.assistant.gateway import AIGateway, get_ai_gateway
from app.features.assistant.use_cases import AIInteractionUseCases
from app.features.workspace.use_cases import WorkspaceQueryUseCases
from app.logging_utils import log_event
from app.shared import NotFound

logger = logging.getLogger(__name__)

# 全ジョブ種別で共通のログイベント名前空間。
# レコードの違いは job.log_fields() が返す record / kind で表す。
EVENT_PREFIX = "ops.ai_job"


def get_session() -> Session:
    """DSQL エンジンから新しいデータベースセッションを生成して返す。"""
    return Session(get_dsql_engine())


def assert_job_owner(
    session: Session,
    job: Any,
    *,
    expected_user_id: str | None,
    repository_cls: type,
    task: str,
) -> Any | None:
    """キューメッセージが主張する所有者と行の所有者が一致することを確認する。

    一致すればリポジトリ経由で取得し直した行を返す。一致しなければ None を返し、
    呼び出し元はジョブを処理してはならない。expected_user_id が None の場合は
    主張自体が無いため、警告を残したうえで従来どおり処理を継続する（デプロイ時に
    キューへ滞留している旧形式メッセージのための移行措置）。
    """
    if expected_user_id is None:
        log_event(
            logger,
            logging.WARNING,
            f"{EVENT_PREFIX}.owner_assertion_missing",
            job_id=job.id,
            task=task,
            outcome="warning",
            reason="missing_expected_user_id",
        )
        return job

    try:
        return repository_cls(session, expected_user_id).get_owned(job.id)
    except NotFound:
        log_event(
            logger,
            logging.ERROR,
            f"{EVENT_PREFIX}.owner_mismatch",
            job_id=job.id,
            task=task,
            outcome="error",
        )
        return None


async def run_job(
    job_id: UUID | str,
    repository_cls: type,
    run_call: Callable[[AIInteractionUseCases, Any], Awaitable[tuple[str, int]]],
    task: str,
    *,
    expected_user_id: str | None = None,
    session_factory=get_session,
    ai_gateway: AIGateway | None = None,
) -> None:
    """AI ジョブを処理し結果を永続化する共通状態機械。

    run_call(use_cases, job) は (結果テキスト, 消費トークン数) を返す async 呼び出し。
    トークン計上は AIInteractionUseCases 内で行われる。

    扱う行のモデルは repository_cls.model から決まる。結果の書き込み先と
    追加ログフィールドはモデル自身（apply_result / log_fields）が知っている。
    """
    model = repository_cls.model
    resource_id = UUID(job_id) if isinstance(job_id, str) else job_id

    with session_factory() as session:
        job = session.get(model, resource_id)
        if job is None:
            log_event(
                logger,
                logging.WARNING,
                f"{EVENT_PREFIX}.not_found",
                job_id=job_id,
                outcome="failure",
            )
            return

        job = assert_job_owner(
            session,
            job,
            expected_user_id=expected_user_id,
            repository_cls=repository_cls,
            task=task,
        )
        if job is None:
            return

        # 二重実行を防ぐ冪等ガード
        if job.status in {"running", "completed"}:
            return

        ai_gateway = ai_gateway or get_ai_gateway()

        job.status = "running"
        job.started_at = datetime.now(UTC)
        job.updated_at = job.started_at
        session.add(job)
        session.commit()
        log_event(
            logger,
            logging.INFO,
            f"{EVENT_PREFIX}.started",
            job_id=job.id,
            **job.log_fields(),
            outcome="running",
        )

        try:
            interaction_use_cases = AIInteractionUseCases(
                session=session,
                user_id=job.user_id,
                ai_gateway=ai_gateway,
                workspace_queries=WorkspaceQueryUseCases(session, job.user_id),
            )
            result, tokens_used = await run_call(interaction_use_cases, job)

            job.status = "completed"
            job.apply_result(result)
            job.tokens_used = tokens_used
            job.error_message = None
            log_event(
                logger,
                logging.INFO,
                f"{EVENT_PREFIX}.completed",
                job_id=job.id,
                **job.log_fields(),
                tokens_used=tokens_used,
                outcome="success",
            )
        except AIApplicationTimeoutError:
            job.status = "failed"
            # 上流の生メッセージではなく、ユーザー向けの定型文を保存する
            job.error_message = AI_EDIT_JOB_TIMEOUT_MESSAGE
            log_event(
                logger,
                logging.ERROR,
                f"{EVENT_PREFIX}.failed",
                job_id=job.id,
                **job.log_fields(),
                outcome="timeout",
                reason="ai_timeout",
            )
        except AITokenLimitExceededError as exc:
            job.status = "failed"
            job.error_message = str(exc)
            log_event(
                logger,
                logging.WARNING,
                f"{EVENT_PREFIX}.failed",
                job_id=job.id,
                **job.log_fields(),
                outcome="failure",
                reason="token_limit_exceeded",
            )
        except Exception as exc:
            log_event(
                logger,
                logging.ERROR,
                f"{EVENT_PREFIX}.failed",
                job_id=job_id,
                outcome="error",
                reason=exc.__class__.__name__,
                exc_info=True,
            )
            job.status = "failed"
            job.error_message = str(exc)
        finally:
            now = datetime.now(UTC)
            job.completed_at = now if job.status in {"completed", "failed"} else None
            job.updated_at = now
            session.add(job)
            session.commit()
