"""job_payloads のユニットテスト。

以前は AIJob.input と SNS/SQS 通知のどちらも型を持たず、書き手（ai_jobs）と
読み手（job_runner）が別モジュールで手作業により組み立て・分解していた。
片方のフィールド名を変えても全ユニットテストは通り、本番でだけ壊れる状態だった。
ここではその往復と、既存 pending ジョブの後方互換性を固定する。
"""

import json
from uuid import uuid4

import pytest

from app.features.assistant.job_payloads import (
    ChatJobInput,
    JobEnvelope,
    SummarizeJobInput,
    UnsupportedJobKind,
    decode_as,
    encode,
)
from app.features.assistant.schemas import BedrockMessage
from app.models.enums import ChatScope


class TestRoundTrip:
    def test_summarize_round_trip(self):
        note_id = uuid4()
        job_input = SummarizeJobInput(note_id=note_id)

        restored = decode_as(
            SummarizeJobInput.kind, encode(job_input), SummarizeJobInput
        )

        assert restored.note_id == note_id

    def test_chat_round_trip_preserves_history_and_scope(self):
        """history が BedrockMessage として復元されること。

        gateway.chat は各メッセージで .model_dump() を呼ぶため、dict のまま
        渡すと実行時に落ちる。
        """
        job_input = ChatJobInput(
            scope=ChatScope.FOLDER,
            question="What is this?",
            history=[
                BedrockMessage(role="user", content="hi"),
                BedrockMessage(role="assistant", content="hello"),
            ],
            folder_id=uuid4(),
        )

        restored = decode_as(ChatJobInput.kind, encode(job_input), ChatJobInput)

        assert restored == job_input
        assert restored.scope is ChatScope.FOLDER
        assert all(isinstance(msg, BedrockMessage) for msg in restored.history)

    def test_chat_round_trip_without_history(self):
        job_input = ChatJobInput(
            scope=ChatScope.SELECTION,
            question="Explain",
            selected_content="some text",
        )

        restored = decode_as(ChatJobInput.kind, encode(job_input), ChatJobInput)

        assert restored.history is None
        assert restored.note_id is None
        assert restored.selected_content == "some text"


class TestBackwardCompatibility:
    """型を導入する前の手書き JSON を、そのままデコードできること。

    ジョブは pending 状態で永続化されるので、デプロイをまたいで
    旧フォーマットの行が残りうる。
    """

    def test_legacy_summarize_payload(self):
        note_id = uuid4()
        legacy = json.dumps({"note_id": str(note_id)})

        assert decode_as("summarize", legacy, SummarizeJobInput).note_id == note_id

    def test_legacy_chat_payload_with_explicit_nulls(self):
        legacy = json.dumps(
            {
                "scope": "note",
                "question": "Why?",
                "history": None,
                "note_id": None,
                "folder_id": None,
                "selected_content": None,
            }
        )

        restored = decode_as("chat", legacy, ChatJobInput)

        assert restored.scope is ChatScope.NOTE
        assert restored.question == "Why?"
        assert restored.history is None

    def test_legacy_chat_payload_with_dict_history(self):
        legacy = json.dumps(
            {
                "scope": "all",
                "question": "Why?",
                "history": [{"role": "user", "content": "hi"}],
            }
        )

        restored = decode_as("chat", legacy, ChatJobInput)

        assert restored.history == [BedrockMessage(role="user", content="hi")]


class TestDecodeGuards:
    def test_unknown_kind_is_rejected(self):
        with pytest.raises(UnsupportedJobKind):
            decode_as("translate", "{}", SummarizeJobInput)

    def test_kind_mismatch_is_rejected(self):
        """要約ハンドラーにチャットのペイロードが届いたら止める。"""
        chat_payload = encode(ChatJobInput(scope=ChatScope.ALL, question="q"))

        with pytest.raises(UnsupportedJobKind):
            decode_as("chat", chat_payload, SummarizeJobInput)

    def test_missing_required_field_is_rejected(self):
        """以前は params["question"] が素の KeyError になっていた。"""
        with pytest.raises(ValueError):
            decode_as("chat", json.dumps({"scope": "note"}), ChatJobInput)


class TestJobEnvelope:
    def test_sqs_record_published_directly(self):
        record = {
            "body": json.dumps(
                {"task": "process_ai_chat_job", "job_id": "abc", "user_id": "u1"}
            )
        }

        envelope = JobEnvelope.from_sqs_record(record)

        assert envelope.task == "process_ai_chat_job"
        assert envelope.job_id == "abc"
        assert envelope.user_id == "u1"

    def test_sqs_record_wrapped_by_sns(self):
        """SNS → SQS 経由では body が SNS 通知で、実体は Message の中にある。"""
        inner = json.dumps(
            {"task": "process_ai_edit_job", "job_id": "xyz", "user_id": "u2"}
        )
        record = {"body": json.dumps({"Type": "Notification", "Message": inner})}

        envelope = JobEnvelope.from_sqs_record(record)

        assert envelope.task == "process_ai_edit_job"
        assert envelope.job_id == "xyz"

    def test_legacy_record_without_user_id(self):
        """user_id が付く前に発行されたメッセージも受け付ける。"""
        record = {"body": json.dumps({"task": "process_ai_edit_job", "job_id": "old"})}

        assert JobEnvelope.from_sqs_record(record).user_id is None

    @pytest.mark.parametrize(
        "body",
        ["", "not json", "{}", json.dumps({"task": "process_ai_edit_job"})],
        ids=["empty", "not-json", "no-fields", "missing-job-id"],
    )
    def test_malformed_records_raise(self, body):
        with pytest.raises(ValueError):
            JobEnvelope.from_sqs_record({"body": body})

    def test_message_round_trip(self):
        envelope = JobEnvelope(task="process_ai_chat_job", job_id="1", user_id="u")

        assert JobEnvelope.from_sqs_record({"body": envelope.to_message()}) == envelope
