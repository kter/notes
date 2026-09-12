"""TokenBudget のユニットテスト。

以前は「上限チェック」と「使用量の記録」が別々の自由関数で、呼び出し順を守る
責任が各ユースケースに散っていた。テストされていたのは check_limit という
最も単純な部分だけで、実際にお金を失いうる並び順は誰も検証していなかった。
"""

import pytest
from sqlmodel import Session

from app.features.assistant.errors import AITokenLimitExceededError
from app.features.assistant.token_budget import TokenBudget
from app.features.assistant.usage_policy import get_usage_info
from app.models import UserSettings

USER_ID = "budget-user"


@pytest.fixture(name="budget")
def budget_fixture(session: Session) -> TokenBudget:
    return TokenBudget(session, USER_ID)


def _set_limit(session: Session, limit: int) -> None:
    session.add(UserSettings(user_id=USER_ID, token_limit=limit))
    session.commit()


class TestAssertAvailable:
    def test_passes_when_under_the_limit(self, session: Session, budget: TokenBudget):
        _set_limit(session, 100)

        budget.assert_available()

    def test_raises_when_the_limit_is_reached(
        self, session: Session, budget: TokenBudget
    ):
        _set_limit(session, 10)
        with budget.reserve() as ticket:
            ticket.settle(10)

        with pytest.raises(AITokenLimitExceededError):
            budget.assert_available()


class TestReserve:
    def test_settled_tokens_are_recorded_once(
        self, session: Session, budget: TokenBudget
    ):
        _set_limit(session, 1000)

        with budget.reserve() as ticket:
            ticket.settle(30)

        assert ticket.settled == 30
        assert get_usage_info(session, USER_ID).tokens_used == 30

    def test_zero_settlement_is_not_charged(
        self, session: Session, budget: TokenBudget
    ):
        """要約のキャッシュヒットはトークンを消費しない。

        以前この判断は BedrockGateway.summarize の中にあった。
        """
        _set_limit(session, 1000)

        with budget.reserve() as ticket:
            ticket.settle(0)

        assert ticket.settled == 0
        assert get_usage_info(session, USER_ID).tokens_used == 0

    def test_the_ai_is_never_called_when_the_limit_is_already_reached(
        self, session: Session, budget: TokenBudget
    ):
        """入口で弾く。上限に達したユーザーのリクエストは Bedrock に届かない。"""
        _set_limit(session, 5)
        with budget.reserve() as ticket:
            ticket.settle(5)

        called = []
        with pytest.raises(AITokenLimitExceededError):
            with budget.reserve():
                called.append(True)

        assert called == []

    def test_chunked_settlements_accumulate(
        self, session: Session, budget: TokenBudget
    ):
        """分割編集はチャンクごとに計上される。

        以前は全チャンク完了後に 1 回だけ計上していたため、上限の 99% まで
        使ったユーザーが 1 リクエストで並列にどこまでも超過でき、しかも
        その事実がどこにも残らなかった。
        """
        _set_limit(session, 1000)

        with budget.reserve() as ticket:
            for _ in range(4):
                ticket.settle(300)

        assert ticket.settled == 1200
        assert get_usage_info(session, USER_ID).tokens_used == 1200

    def test_overspending_blocks_the_next_request(
        self, session: Session, budget: TokenBudget
    ):
        """超過したリクエスト自体は完了させ、次のリクエストで止める。

        途中で捨てると、ユーザーはトークンを消費したのに結果を得られない。
        """
        _set_limit(session, 1000)

        with budget.reserve() as ticket:
            ticket.settle(400)
            ticket.settle(400)
            ticket.settle(400)

        assert get_usage_info(session, USER_ID).tokens_used == 1200
        with pytest.raises(AITokenLimitExceededError):
            budget.assert_available()

    def test_exceptions_inside_the_reservation_propagate(
        self, session: Session, budget: TokenBudget
    ):
        _set_limit(session, 1000)

        with pytest.raises(RuntimeError):
            with budget.reserve() as ticket:
                ticket.settle(10)
                raise RuntimeError("gateway blew up")

        # 例外が出ても、すでに消費した分は記録されている
        assert get_usage_info(session, USER_ID).tokens_used == 10
