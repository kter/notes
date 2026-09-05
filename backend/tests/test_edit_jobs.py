import json
from uuid import uuid4

import pytest

from app.features.assistant.job_runner import (
    EDIT_JOB_TOPIC_ARN_ENV,
    PROCESS_CHAT_JOB_TASK,
    PROCESS_EDIT_JOB_TASK,
    PROCESS_SUMMARIZE_JOB_TASK,
    dispatch_edit_job,
    process_edit_job,
    process_edit_job_queue_records,
)


class StubBackgroundTasks:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def add_task(self, func, *args, **kwargs) -> None:
        self.calls.append((func, args, kwargs))


class StubSNSClient:
    def __init__(self) -> None:
        self.published: list[dict] = []

    def publish(self, **kwargs) -> None:
        self.published.append(kwargs)


@pytest.mark.asyncio
async def test_dispatch_edit_job_publishes_to_sns(monkeypatch: pytest.MonkeyPatch):
    job_id = uuid4()
    sns_client = StubSNSClient()

    monkeypatch.setenv(
        EDIT_JOB_TOPIC_ARN_ENV, "arn:aws:sns:ap-northeast-1:123456789012:edit-jobs"
    )
    await dispatch_edit_job(job_id, publisher=sns_client)

    assert len(sns_client.published) == 1
    publish_call = sns_client.published[0]
    assert publish_call["TopicArn"].endswith(":edit-jobs")
    assert json.loads(publish_call["Message"]) == {
        "task": PROCESS_EDIT_JOB_TASK,
        "job_id": str(job_id),
    }


@pytest.mark.asyncio
async def test_dispatch_edit_job_falls_back_to_background_tasks(
    monkeypatch: pytest.MonkeyPatch,
):
    job_id = uuid4()
    background_tasks = StubBackgroundTasks()

    monkeypatch.delenv(EDIT_JOB_TOPIC_ARN_ENV, raising=False)

    await dispatch_edit_job(job_id, background_tasks=background_tasks)

    assert background_tasks.calls == [
        (process_edit_job, (job_id,), {}),
    ]


@pytest.mark.asyncio
async def test_process_edit_job_queue_records_reports_partial_failures():
    processed: list[str] = []

    async def fake_process_job(job_id: str) -> None:
        if job_id == "job-2":
            raise RuntimeError("boom")
        processed.append(job_id)

    records = [
        {
            "messageId": "msg-1",
            "body": json.dumps({"task": PROCESS_EDIT_JOB_TASK, "job_id": "job-1"}),
        },
        {
            "messageId": "msg-2",
            "body": json.dumps({"task": PROCESS_EDIT_JOB_TASK, "job_id": "job-2"}),
        },
        {
            "messageId": "msg-3",
            "body": json.dumps({"task": "unknown"}),
        },
    ]

    result = await process_edit_job_queue_records(
        records,
        handlers={PROCESS_EDIT_JOB_TASK: fake_process_job},
    )

    assert processed == ["job-1"]
    assert result == {
        "batchItemFailures": [
            {"itemIdentifier": "msg-2"},
            {"itemIdentifier": "msg-3"},
        ]
    }


@pytest.mark.asyncio
async def test_process_queue_records_routes_by_task():
    """編集・要約・チャットの各 task が既定のディスパッチ表で正しい handler に振り分けられる。"""
    routed: list[str] = []

    def make_handler(label: str):
        async def handler(job_id: str) -> None:
            routed.append(f"{label}:{job_id}")

        return handler

    records = [
        {
            "messageId": "m1",
            "body": json.dumps({"task": PROCESS_EDIT_JOB_TASK, "job_id": "edit-1"}),
        },
        {
            "messageId": "m2",
            "body": json.dumps({"task": PROCESS_SUMMARIZE_JOB_TASK, "job_id": "sum-1"}),
        },
        {
            "messageId": "m3",
            "body": json.dumps({"task": PROCESS_CHAT_JOB_TASK, "job_id": "chat-1"}),
        },
    ]

    result = await process_edit_job_queue_records(
        records,
        handlers={
            PROCESS_EDIT_JOB_TASK: make_handler("edit"),
            PROCESS_SUMMARIZE_JOB_TASK: make_handler("summarize"),
            PROCESS_CHAT_JOB_TASK: make_handler("chat"),
        },
    )

    assert routed == ["edit:edit-1", "summarize:sum-1", "chat:chat-1"]
    assert result == {"batchItemFailures": []}
