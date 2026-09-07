"""認証された呼び出し元と、その資格情報の種類。

責務: 「誰が」だけでなく「何で認証したか」を型として持ち、ルートが受け付ける
    資格情報の種類を宣言できるようにする。
主要なエクスポート: Credential, Principal, require_principal。
呼び出し関係: auth/dependencies.py が依存関数の実体としてこれを使う。

このモジュールが存在する理由:
    以前は `UserId` と `FolderNoteUserId` という 2 つの型エイリアスがあり、
    どちらも `str` に解決されるのに意味が違った。前者は Bearer のみ、後者は
    X-API-Key も受け付ける。名前が示しているのは「今たまたまどのルートで
    使われているか」であって、能力ではない。新しいエンドポイントの作者は
    補完でどちらかを選び、その瞬間に認証面の設計判断を無自覚に下していた。

    どの資格情報を受け付けるかをルート側の宣言にすることで、認証面が
    grep できる事実になる。
"""

from dataclasses import dataclass
from typing import Literal

# 資格情報の種類。Bearer は Cognito の JWT、api_key は X-API-Key ヘッダー。
Credential = Literal["bearer", "api_key"]

# 既定で許可する資格情報。API キーは明示的に許可したルートだけが受け付ける。
DEFAULT_ALLOWED: tuple[Credential, ...] = ("bearer",)


@dataclass(frozen=True)
class Principal:
    """認証された呼び出し元。

    user_id は Cognito のサブジェクト。credential はそれをどう証明したか。
    """

    user_id: str
    credential: Credential
