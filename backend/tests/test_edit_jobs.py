import json
from uuid import uuid4

import pytest

from app.services.edit_jobs import (
    EDIT_JOB_TOPIC_ARN_ENV,
    PROCESS_EDIT_JOB_TASK,
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

    monkeypatch.setenv(EDIT_JOB_TOPIC_ARN_ENV, "arn:aws:sns:ap-northeast-1:123456789012:edit-jobs")
    monkeypatch.setattr("app.services.edit_jobs.boto3.client", lambda service_name: sns_client)

    await dispatch_edit_job(job_id)

    assert len(sns_client.published) == 1
    publish_call = sns_client.published[0]
    assert publish_call["TopicArn"].endswith(":edit-jobs")
    assert json.loads(publish_call["Message"]) == {
        "task": PROCESS_EDIT_JOB_TASK,
        "job_id": str(job_id),
    }


@pytest.mark.asyncio
async def test_dispatch_edit_job_falls_back_to_background_tasks(monkeypatch: pytest.MonkeyPatch):
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
            "body": json.dumps(
                {"task": PROCESS_EDIT_JOB_TASK, "job_id": "job-1"}
            ),
        },
        {
            "messageId": "msg-2",
            "body": json.dumps(
                {"task": PROCESS_EDIT_JOB_TASK, "job_id": "job-2"}
            ),
        },
        {
            "messageId": "msg-3",
            "body": json.dumps({"task": "unknown"}),
        },
    ]

    result = await process_edit_job_queue_records(
        records,
        process_job_fn=fake_process_job,
    )

    assert processed == ["job-1"]
    assert result == {
        "batchItemFailures": [
            {"itemIdentifier": "msg-2"},
            {"itemIdentifier": "msg-3"},
        ]
    }
