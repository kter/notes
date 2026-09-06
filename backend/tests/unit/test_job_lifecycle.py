"""job_lifecycle のユニットテスト。

状態機械が単独のモジュールになったので、process_* ラッパー越しではなく
レコード種別（AIJob / AIEditJob）でパラメータ化して直接検証できる。
"""

import asyncio

import pytest
from sqlmodel import Session

from app.features.assistant.errors import (
    AI_EDIT_JOB_TIMEOUT_MESSAGE,
    AIApplicationTimeoutError,
    AITokenLimitExceededError,
)
from app.features.assistant.job_lifecycle import run_job
from app.features.assistant.repositories import AIEditJobRepository, AIJobRepository
from app.models import AIEditJob, AIJob

OWNER = "lifecycle-owner"
OTHER = "lifecycle-intruder"
TASK = "process_ai_test_job"


def _make_ai_job(**overrides) -> AIJob:
    return AIJob(user_id=OWNER, kind="summarize", input="{}", **overrides)


def _make_edit_job(**overrides) -> AIEditJob:
    return AIEditJob(user_id=OWNER, content="body", instruction="fix", **overrides)


# (リポジトリ, 行のファクトリ, 結果が入る列名)
RECORD_TYPES = [
    pytest.param(AIJobRepository, _make_ai_job, "result", id="ai_job"),
    pytest.param(
        AIEditJobRepository, _make_edit_job, "edited_content", id="ai_edit_job"
    ),
]


@pytest.fixture(name="run")
def run_fixture(session: Session):
    """テスト用セッションを共有したまま run_job を同期実行するヘルパー。"""
    engine = session.get_bind()

    def _run(repository_cls, run_call, **kwargs):
        job_id = kwargs.pop("job_id")
        asyncio.run(
            run_job(
                job_id,
                repository_cls,
                run_call,
                TASK,
                session_factory=lambda: Session(engine),
                ai_gateway=object(),
                **kwargs,
            )
        )

    return _run


async def _succeeds(use_cases, job):
    return "the result", 42


@pytest.mark.parametrize(("repository_cls", "make_job", "result_field"), RECORD_TYPES)
class TestCompletion:
    def test_result_lands_in_the_record_specific_column(
        self, session: Session, run, repository_cls, make_job, result_field
    ):
        job = make_job()
        session.add(job)
        session.commit()

        run(repository_cls, _succeeds, job_id=job.id, expected_user_id=OWNER)

        session.expire_all()
        persisted = session.get(repository_cls.model, job.id)
        assert persisted.status == "completed"
        assert getattr(persisted, result_field) == "the result"
        assert persisted.tokens_used == 42
        assert persisted.error_message is None
        assert persisted.completed_at is not None

    def test_job_id_accepted_as_string(
        self, session: Session, run, repository_cls, make_job, result_field
    ):
        job = make_job()
        session.add(job)
        session.commit()

        run(repository_cls, _succeeds, job_id=str(job.id), expected_user_id=OWNER)

        session.expire_all()
        assert session.get(repository_cls.model, job.id).status == "completed"


@pytest.mark.parametrize(("repository_cls", "make_job", "result_field"), RECORD_TYPES)
class TestGuards:
    @pytest.mark.parametrize("status", ["running", "completed"])
    def test_already_started_jobs_are_not_rerun(
        self, session: Session, run, repository_cls, make_job, result_field, status
    ):
        """二重配信されたキューメッセージでジョブが二度走らないこと。"""
        job = make_job(status=status)
        session.add(job)
        session.commit()

        ran = []

        async def run_call(use_cases, job):
            ran.append(True)
            return "second run", 1

        run(repository_cls, run_call, job_id=job.id, expected_user_id=OWNER)

        assert ran == []
        session.expire_all()
        assert getattr(session.get(repository_cls.model, job.id), result_field) is None

    def test_other_users_job_is_not_processed(
        self, session: Session, run, repository_cls, make_job, result_field
    ):
        """所有者を偽るキューメッセージでは実行しない。"""
        job = make_job()
        session.add(job)
        session.commit()

        ran = []

        async def run_call(use_cases, job):
            ran.append(True)
            return "leaked", 1

        run(repository_cls, run_call, job_id=job.id, expected_user_id=OTHER)

        assert ran == []
        session.expire_all()
        assert session.get(repository_cls.model, job.id).status == "pending"

    def test_missing_expected_user_id_still_processes(
        self, session: Session, run, repository_cls, make_job, result_field
    ):
        """所有者の主張が無い旧形式メッセージは、警告のうえ処理を続ける移行措置。"""
        job = make_job()
        session.add(job)
        session.commit()

        run(repository_cls, _succeeds, job_id=job.id, expected_user_id=None)

        session.expire_all()
        assert session.get(repository_cls.model, job.id).status == "completed"

    def test_unknown_job_id_is_a_no_op(
        self, run, repository_cls, make_job, result_field
    ):
        from uuid import uuid4

        run(repository_cls, _succeeds, job_id=uuid4(), expected_user_id=OWNER)


@pytest.mark.parametrize(("repository_cls", "make_job", "result_field"), RECORD_TYPES)
class TestFailureClassification:
    def test_timeout_stores_the_user_facing_message(
        self, session: Session, run, repository_cls, make_job, result_field
    ):
        """上流の生メッセージではなく定型文を保存する。"""
        job = make_job()
        session.add(job)
        session.commit()

        async def times_out(use_cases, job):
            raise AIApplicationTimeoutError("raw upstream detail")

        run(repository_cls, times_out, job_id=job.id, expected_user_id=OWNER)

        session.expire_all()
        persisted = session.get(repository_cls.model, job.id)
        assert persisted.status == "failed"
        assert persisted.error_message == AI_EDIT_JOB_TIMEOUT_MESSAGE

    def test_token_limit_stores_the_exception_message(
        self, session: Session, run, repository_cls, make_job, result_field
    ):
        job = make_job()
        session.add(job)
        session.commit()

        async def over_limit(use_cases, job):
            raise AITokenLimitExceededError("limit reached")

        run(repository_cls, over_limit, job_id=job.id, expected_user_id=OWNER)

        session.expire_all()
        persisted = session.get(repository_cls.model, job.id)
        assert persisted.status == "failed"
        assert persisted.error_message == "limit reached"

    def test_unexpected_error_is_persisted_as_failed(
        self, session: Session, run, repository_cls, make_job, result_field
    ):
        job = make_job()
        session.add(job)
        session.commit()

        async def explodes(use_cases, job):
            raise RuntimeError("boom")

        run(repository_cls, explodes, job_id=job.id, expected_user_id=OWNER)

        session.expire_all()
        persisted = session.get(repository_cls.model, job.id)
        assert persisted.status == "failed"
        assert persisted.error_message == "boom"
        assert persisted.completed_at is not None
