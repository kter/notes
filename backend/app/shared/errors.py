"""ドメイン層で発生するエラー階層を定義するモジュール。

責務: アプリケーション全体で共有するドメインエラーの基底クラスと
    サブクラスを提供する。
主要なエクスポート: DomainError, NotFound, Forbidden, ConflictDetected,
    QuotaExceeded, ValidationFailed, ShareExpired
呼び出し関係: ユースケース・リポジトリ層で送出され、
    app.http_errors の to_http_exception で HTTP 例外へ変換される。
"""


class DomainError(Exception):
    """ドメイン層の障害を表す基底クラス。"""

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class NotFound(DomainError):
    """呼び出し元のスコープにリソースが存在しない場合に送出される。"""


class Forbidden(DomainError):
    """ユーザーが操作を実行できない場合に送出される。"""


class ConflictDetected(DomainError):
    """楽観的書き込みまたは一意性制約が失敗した場合に送出される。"""


class QuotaExceeded(DomainError):
    """呼び出し元がクォータまたは制限を超過した場合に送出される。"""


class ValidationFailed(DomainError):
    """リクエストが意味的に無効な場合に送出される。"""


class ShareExpired(DomainError):
    """共有リソースの有効期限が切れた場合に送出される。"""
