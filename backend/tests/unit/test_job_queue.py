"""job_queue のユニットテスト。

トランスポートが実体のあるアダプタになったため、送り先ごとの振る舞いを
環境変数の monkeypatch なしで直接組み立てて検証できる。
"""

import json

import pytest

from app.features.assistant.job_payloads import JobEnvelope
from app.features.assistant.job_queue import (
    EDIT_JOB_TOPIC_ARN_ENV,
    BackgroundTaskQueue,
    InlineQueue,
    SNSQueue,
    select_job_queue,
)

ENVELOPE = JobEnvelope(task="process_ai_chat_job", job_id="job-1", user_id="user-1")


class RecordingPublisher:
    def __init__(self) -> None:
        self.published: list[dict] = []

    def publish(self, *, TopicArn: str, Message: str) -> object:
        self.published.append({"TopicArn": TopicArn, "Message": Message})
        return {}


class StubBackgroundTasks:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def add_task(self, fn, *args, **kwargs) -> None:
        self.calls.append((fn, args, kwargs))


@pytest.fixture(name="handlers")
def handlers_fixture():
    calls: list[tuple] = []

    async def handler(job_id, *, expected_user_id=None):
        calls.append((job_id, expected_user_id))

    return {"process_ai_chat_job": handler}, calls


class TestSNSQueue:
    async def test_publishes_the_envelope_to_the_topic(self):
        publisher = RecordingPublisher()

        await SNSQueue("arn:aws:sns:topic", publisher).enqueue(ENVELOPE)

        assert len(publisher.published) == 1
        published = publisher.published[0]
        assert published["TopicArn"] == "arn:aws:sns:topic"
        assert json.loads(published["Message"]) == {
            "task": "process_ai_chat_job",
            "job_id": "job-1",
            "user_id": "user-1",
        }

    async def test_published_message_round_trips_through_from_sqs_record(self):
        """publish した本文がそのままワーカー側でデコードできること。"""
        publisher = RecordingPublisher()

        await SNSQueue("arn:aws:sns:topic", publisher).enqueue(ENVELOPE)

        record = {"body": publisher.published[0]["Message"]}
        assert JobEnvelope.from_sqs_record(record) == ENVELOPE


class TestInlineQueue:
    async def test_runs_the_handler_immediately(self, handlers):
        table, calls = handlers

        await InlineQueue(table).enqueue(ENVELOPE)

        assert calls == [("job-1", "user-1")]

    async def test_unknown_task_raises(self, handlers):
        table, _ = handlers

        with pytest.raises(ValueError, match="Unsupported queue task"):
            await InlineQueue(table).enqueue(
                JobEnvelope(task="process_nothing", job_id="job-1")
            )


class TestBackgroundTaskQueue:
    async def test_defers_the_handler(self, handlers):
        table, calls = handlers
        background_tasks = StubBackgroundTasks()

        await BackgroundTaskQueue(background_tasks, table).enqueue(ENVELOPE)

        # レスポンス返却後に走るので、この時点ではまだ実行されていない
        assert calls == []
        assert background_tasks.calls == [
            (table["process_ai_chat_job"], ("job-1",), {"expected_user_id": "user-1"}),
        ]


class TestSelectJobQueue:
    def test_topic_arn_selects_sns(self, handlers, monkeypatch: pytest.MonkeyPatch):
        table, _ = handlers
        monkeypatch.setenv(EDIT_JOB_TOPIC_ARN_ENV, "arn:aws:sns:topic")

        assert isinstance(select_job_queue(table), SNSQueue)

    def test_background_tasks_used_when_no_topic(
        self, handlers, monkeypatch: pytest.MonkeyPatch
    ):
        table, _ = handlers
        monkeypatch.delenv(EDIT_JOB_TOPIC_ARN_ENV, raising=False)

        queue = select_job_queue(table, background_tasks=StubBackgroundTasks())

        assert isinstance(queue, BackgroundTaskQueue)

    def test_falls_back_to_inline(self, handlers, monkeypatch: pytest.MonkeyPatch):
        table, _ = handlers
        monkeypatch.delenv(EDIT_JOB_TOPIC_ARN_ENV, raising=False)

        assert isinstance(select_job_queue(table), InlineQueue)
