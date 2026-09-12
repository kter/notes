"""ユーザーのトークン予算の唯一の所有者。

責務: 「まだ使ってよいか」の判定と「使った分の計上」を 1 つのインターフェースに
    まとめ、AI 呼び出しとの前後関係を型で表す。
主要なエクスポート: TokenBudget, BudgetTicket。
呼び出し関係: AIInteractionUseCases が reserve を、ジョブ作成ユースケースが
    assert_available を使う。使用量の永続化は usage_policy に委譲する。

このモジュールが存在する理由:
    以前は「上限チェック」と「使用量の記録」が別々の自由関数で、しかも
    呼び出し順を守る責任が各ユースケースに散っていた。結果として:

    - チェックは呼び出し前の 1 回きり、記録は全部終わってから 1 回きり。
      その間に gateway.edit が内部でチャンクを最大 3 並列で投げるため、
      上限の 99% まで使ったユーザーが 1 リクエストで大きく超過できた。
    - ジョブ経路ではチェックが 2 回（作成時と実行時）走る一方、
      要約のキャッシュヒットでは 0 回だった。
    - 「キャッシュヒットは 0 トークン」という課金上の判断が
      AWS アダプタ（BedrockGateway.summarize）の中にあった。

    reserve() が返すチケットに settle() を集約し、消費の計上点を 1 つにする。
    分割編集はチャンクごとに settle するため、超過は「静かに起きる」ものから
    「記録に残り、次のリクエストで止まる」ものになる。
"""

import logging
from collections.abc import Iterator
from contextlib import contextmanager

from sqlmodel import Session

from app.features.assistant.errors import (
    TOKEN_LIMIT_EXCEEDED_MESSAGE,
    AITokenLimitExceededError,
)
from app.features.assistant.usage_policy import check_limit, record_usage
from app.logging_utils import log_event

logger = logging.getLogger(__name__)


class BudgetTicket:
    """1 回の AI 呼び出しに対する消費の計上口。

    settle は複数回呼べる。分割編集はチャンクごとに実際の消費を報告するため、
    1 リクエスト内で何度も計上が起きる。
    """

    def __init__(self, session: Session, user_id: str):
        self._session = session
        self._user_id = user_id
        self.settled = 0

    def settle(self, tokens_used: int) -> None:
        """実際に消費したトークンを計上する。

        0 は計上しない。要約のキャッシュヒットがこれに当たる。以前この判断は
        BedrockGateway.summarize の中にあった。
        """
        if tokens_used <= 0:
            return
        self.settled += tokens_used
        record_usage(self._session, self._user_id, tokens_used)


class TokenBudget:
    """user_id スコープの月次トークン予算。"""

    def __init__(self, session: Session, user_id: str):
        self.session = session
        self.user_id = user_id

    def assert_available(self) -> None:
        """上限を超過していれば AITokenLimitExceededError を送出する。

        ジョブを受け付けてよいかの判断に使う。実行時には reserve が
        同じ検査を行うため、ここを通ったジョブが実行時に弾かれることはある。
        """
        if not check_limit(self.session, self.user_id):
            raise AITokenLimitExceededError(TOKEN_LIMIT_EXCEEDED_MESSAGE)

    @contextmanager
    def reserve(self) -> Iterator[BudgetTicket]:
        """予算を確認し、消費を計上するためのチケットを渡す。

        入口で上限に達していれば AI を一度も呼ばずに送出する。ブロックを抜けた
        時点で予算を使い切っていた場合は、次のリクエストが弾かれるよう記録を残す
        （このリクエスト自体は完了させる。途中で捨てるとユーザーは
        トークンを消費したのに結果を得られない）。
        """
        self.assert_available()
        ticket = BudgetTicket(self.session, self.user_id)

        yield ticket

        if ticket.settled and not check_limit(self.session, self.user_id):
            log_event(
                logger,
                logging.WARNING,
                "ops.ai.token_budget.exhausted",
                user_id=self.user_id,
                tokens_settled=ticket.settled,
                outcome="warning",
            )
