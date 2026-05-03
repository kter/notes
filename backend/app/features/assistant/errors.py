"""assistantフィーチャで使用するエラーメッセージ定数と例外クラスの定義。

責務: AI操作に関するエラー種別を一元管理する。
主要なエクスポート: AITokenLimitExceededError, AIApplicationTimeoutError,
    TOKEN_LIMIT_EXCEEDED_MESSAGE, AI_TIMEOUT_MESSAGE, AI_EDIT_JOB_TIMEOUT_MESSAGE。
呼び出し関係: usage_policy, job_runner, use_cases から参照される。
"""

# ユーザー向けエラーメッセージ定数
TOKEN_LIMIT_EXCEEDED_MESSAGE = "Monthly token limit exceeded. Your usage will reset at the beginning of next month."  # noqa: S105
AI_TIMEOUT_MESSAGE = (
    "AI request timed out. Try a shorter note or edit a smaller section."
)
AI_EDIT_JOB_TIMEOUT_MESSAGE = "AI request timed out. Try editing a smaller section."


class AITokenLimitExceededError(RuntimeError):
    """ユーザーの月間トークン使用量が上限に達した場合に送出される。"""


class AIApplicationTimeoutError(RuntimeError):
    """上流AIプロバイダー（Bedrock等）がタイムアウトした場合に送出される。"""
