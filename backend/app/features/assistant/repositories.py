"""ユーザースコープの AI ジョブ永続化リポジトリ。

責務: AI ジョブと AI 編集ジョブの所有権を検証し、安全な取得境界を提供する。
主要なエクスポート: AIJobRepository, AIEditJobRepository
呼び出し関係: assistant のユースケースおよび job_runner から利用され、
    UserScopedRepository の共通所有権チェックを継承する。
"""

from app.core.persistence import UserScopedRepository
from app.models import AIEditJob, AIJob


class AIJobRepository(UserScopedRepository[AIJob]):
    """要約・チャット用 AI ジョブのユーザースコープ取得を提供する。"""

    model = AIJob
    resource_name = "AI job"


class AIEditJobRepository(UserScopedRepository[AIEditJob]):
    """AI 編集ジョブのユーザースコープ取得を提供する。"""

    model = AIEditJob
    resource_name = "Edit job"
