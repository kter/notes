"""AI ジョブがプロセス境界を越えるときの 2 つの契約。

責務: AIJob.input に載せる実行パラメータと、SNS/SQS を渡るジョブ通知の
    それぞれを型として所有し、エンコードとデコードを一箇所に閉じる。
主要なエクスポート: SummarizeJobInput, ChatJobInput, AIJobInput, encode, decode_as,
    JobEnvelope。
呼び出し関係: use_cases/ai_jobs.py が encode を、job_runner.py が decode_as と
    JobEnvelope.from_sqs_record を使う。

このモジュールが存在する理由:
    以前は 2 つのシリアライズ契約がどちらも型を持たず、書き手（ai_jobs）と
    読み手（job_runner）が別モジュールで手作業により組み立て・分解していた。

        payload = {"scope": scope.value, "question": question, "history": [...]}
        ...
        scope=ChatScope(params["scope"])      # 3 フレーム離れた場所、KeyError 無防備
        history = [BedrockMessage(**msg) for msg in raw_history] or None

    どちらか片方のフィールド名を変えても全ユニットテストは通り、本番でだけ壊れる。
    さらに SQS レコードは「SNS 通知に包まれた JSON」という 3 つ目の暗黙の形を持ち、
    その展開もここに集約する。

後方互換性:
    フィールド名と JSON 表現は旧実装と同一なので、既に pending 状態で保存済みの
    ジョブもそのままデコードできる。
"""

import json
from typing import ClassVar
from uuid import UUID

from pydantic import BaseModel

from app.features.assistant.errors import UnsupportedJobKind
from app.features.assistant.schemas import BedrockMessage
from app.models.enums import ChatScope


class SummarizeJobInput(BaseModel):
    """要約ジョブの実行パラメータ。"""

    kind: ClassVar[str] = "summarize"

    note_id: UUID


class ChatJobInput(BaseModel):
    """チャットジョブの実行パラメータ。

    scope が SELECTION のとき selected_content が必須である、という制約は
    作成時（ai_jobs）に検証する。ここでは形だけを保証する。
    """

    kind: ClassVar[str] = "chat"

    scope: ChatScope
    question: str
    history: list[BedrockMessage] | None = None
    note_id: UUID | None = None
    folder_id: UUID | None = None
    selected_content: str | None = None


AIJobInput = SummarizeJobInput | ChatJobInput

# AIJob.kind 列の値と入力モデルの対応。kind の正は列であり、
# ペイロード側には重複して持たせない。
_INPUT_BY_KIND: dict[str, type[SummarizeJobInput] | type[ChatJobInput]] = {
    SummarizeJobInput.kind: SummarizeJobInput,
    ChatJobInput.kind: ChatJobInput,
}


def encode(job_input: AIJobInput) -> str:
    """実行パラメータを AIJob.input に格納する JSON 文字列へ変換する。"""
    return job_input.model_dump_json()


def decode_as[T: AIJobInput](kind: str, raw: str, expected: type[T]) -> T:
    """AIJob.kind と AIJob.input から、期待する種別の実行パラメータを復元する。

    kind が未知の場合と、ハンドラーが期待する種別と食い違う場合の両方で
    UnsupportedJobKind を送出する。後者は要約ハンドラーにチャットの
    ペイロードが届くようなキュー振り分けの取り違えを捕まえる。
    """
    model = _INPUT_BY_KIND.get(kind)
    if model is None:
        raise UnsupportedJobKind(f"Unsupported AI job kind: {kind}")

    job_input = model.model_validate_json(raw)
    if not isinstance(job_input, expected):
        raise UnsupportedJobKind(
            f"Expected {expected.kind} job input, got kind={kind!r}"
        )
    return job_input


class JobEnvelope(BaseModel):
    """ワーカーに「どのジョブを実行するか」を伝える通知。

    SNS トピックへ publish され、SQS 経由で Lambda に届く。job_id を文字列で
    持つのは、SNS メッセージが JSON でありワーカー側が UUID 変換前に
    ログを出せるようにするため。
    """

    task: str
    job_id: str
    user_id: str | None = None

    @classmethod
    def from_sqs_record(cls, record: dict) -> "JobEnvelope":
        """SQS レコードから SNS ラップを展開して通知を復元する。

        SNS → SQS 経由のレコードは body が SNS 通知 JSON で、実際の
        メッセージはその Message フィールドに入っている。SQS へ直接
        publish された場合は body がそのまま通知になる。
        """
        payload = json.loads(record.get("body", ""))

        if payload.get("Type") == "Notification" and "Message" in payload:
            payload = json.loads(payload["Message"])

        return cls.model_validate(payload)

    def to_message(self) -> str:
        """SNS publish 用の JSON 文字列に変換する。"""
        return self.model_dump_json()
