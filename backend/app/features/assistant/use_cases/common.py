"""assistant ユースケース群で共有するヘルパー関数。

責務: 入力値の空チェックを提供する。
主要なエクスポート: require_non_empty
呼び出し関係: AIInteractionUseCases および EditJobUseCases から呼ばれる。
    トークン上限のガードは token_budget.TokenBudget が持つ。
"""

from app.shared import ValidationFailed


def require_non_empty(value: str, detail: str) -> None:
    """値が空文字またはホワイトスペースのみの場合に ValidationFailed を送出する。"""
    if not value.strip():
        raise ValidationFailed(detail)
