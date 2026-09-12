"""ユーザー設定（UserSettings）の唯一の所有者となるリポジトリ。

責務: UserSettings の取得・作成・検証付き更新・読み出し表現への変換、
    および AI 呼び出し向けのモデル/言語解決を一箇所で担う。
主要なエクスポート: UserSettingsRepository
呼び出し関係: settings/use_cases.py・admin/use_cases.py・assistant/use_cases/common.py
    から利用される。ADR 0001 のリポジトリ規約に従い user_id スコープを持つ。

このモジュールが存在する理由:
    以前は 4 つの箇所がそれぞれ `session.get(UserSettings, user_id)` を直接呼び、
    許可モデル一覧の検証と `resolve_model_id` の適用を各々で再実装していた。結果として
    settings は退役モデルを既定値に丸めて返す一方、admin は生値を返すという食い違いが
    生じ、管理コンソールが settings API 自身は 400 で弾く ID を表示しうる状態だった。
    ポリシーの所有者をこのモジュールに一本化する。
"""

from datetime import UTC, datetime

from sqlmodel import Session

from app.db_commit import commit_with_error_handling
from app.models import (
    AVAILABLE_LANGUAGES,
    AVAILABLE_MODELS,
    DEFAULT_LANGUAGE,
    DEFAULT_LLM_MODEL_ID,
    UserSettings,
    UserSettingsRead,
    resolve_model_id,
)
from app.models.token_usage import MONTHLY_TOKEN_LIMIT
from app.shared import ValidationFailed


class UserSettingsRepository:
    """user_id スコープの UserSettings リポジトリ。

    許可値の検証・退役モデルの解決・未作成ユーザーの既定値・更新日時の更新は
    すべて実装側に隠す。生の行は外に出さない（読み出しは `read()` を通す）。

    `UserScopedRepository` を継承しないのは、UserSettings が user_id を主キーとする
    1 行きりのレコードで、UUID 主キー・ソフトデリート・version を前提とした共通 CRUD
    ヘルパーが噛み合わないため。
    """

    def __init__(self, session: Session, user_id: str):
        self.session = session
        self.user_id = user_id

    def get_or_create(self) -> UserSettings:
        """UserSettings を返す。未作成の場合はデフォルト値で作成してから返す。"""
        settings = self._get()
        if settings is not None:
            return settings

        settings = UserSettings(user_id=self.user_id)
        self.session.add(settings)
        commit_with_error_handling(self.session, "UserSettings")
        self.session.refresh(settings)
        return settings

    def stage_update(
        self,
        *,
        llm_model_id: str | None = None,
        language: str | None = None,
        token_limit: int | None = None,
    ) -> UserSettings:
        """検証済みの変更をセッションに載せる（コミットはしない）。

        None を渡したフィールドは変更しない。未作成ユーザーの場合はこの場で
        インスタンスを組み立てる。新規作成でも既存更新でも同じ検証を通る点が
        重要で、以前は新規作成パスだけが許可モデル検証を素通りしていた。

        呼び出し側が同一トランザクションで他エンティティも更新する場合
        （admin のユーザー更新など）に使う。単独の更新には `apply_update` を使う。
        """
        settings = self._get()
        if settings is None:
            settings = UserSettings(user_id=self.user_id)

        if llm_model_id is not None:
            settings.llm_model_id = self._validated(
                llm_model_id, AVAILABLE_MODELS, "model ID"
            )

        if language is not None:
            settings.language = self._validated(
                language, AVAILABLE_LANGUAGES, "language"
            )

        if token_limit is not None:
            settings.token_limit = token_limit

        settings.updated_at = datetime.now(UTC)
        self.session.add(settings)
        return settings

    def apply_update(
        self,
        *,
        llm_model_id: str | None = None,
        language: str | None = None,
        token_limit: int | None = None,
    ) -> UserSettings:
        """検証済みの変更を適用してコミットし、更新後の UserSettings を返す。"""
        settings = self.stage_update(
            llm_model_id=llm_model_id,
            language=language,
            token_limit=token_limit,
        )
        commit_with_error_handling(self.session, "UserSettings")
        self.session.refresh(settings)
        return settings

    def read(self, settings: UserSettings | None = None) -> UserSettingsRead:
        """設定を API 表現で返す。未作成の場合は既定値で構築する。

        `settings` を渡すとその行を変換する（更新直後の再読み込みを避けるため）。
        省略した場合は保存済みの行を読みに行く。

        退役したモデル ID は必ず `resolve_model_id` を通して既定値に丸める。
        生の値を返すと、この API 自身が受け付けない ID を返すことになり、
        読み出した値をそのまま書き戻すと 400 になってしまう。
        """
        settings = settings if settings is not None else self._get()
        if settings is None:
            now = datetime.now(UTC)
            return UserSettingsRead(
                user_id=self.user_id,
                llm_model_id=DEFAULT_LLM_MODEL_ID,
                language=DEFAULT_LANGUAGE,
                token_limit=UserSettings.model_fields["token_limit"].default,
                created_at=now,
                updated_at=now,
            )

        return UserSettingsRead(
            user_id=settings.user_id,
            llm_model_id=resolve_model_id(settings.llm_model_id),
            language=settings.language,
            token_limit=settings.token_limit,
            created_at=settings.created_at,
            updated_at=settings.updated_at,
        )

    def resolve_for_ai(self) -> tuple[str, str]:
        """AI 呼び出しに使う (llm_model_id, language) を返す。

        未作成ユーザーには既定値を返す。退役モデルは既定値に丸めるため、
        InvokeModel が存在しないモデル ID で失敗し続けることはない。
        """
        settings = self._get()
        if settings is None:
            return DEFAULT_LLM_MODEL_ID, DEFAULT_LANGUAGE
        return resolve_model_id(settings.llm_model_id), settings.language

    def token_limit(self) -> int:
        """ユーザー固有の月次トークン上限を返す。未設定の場合はグローバル既定値。"""
        settings = self._get()
        if settings is None:
            return MONTHLY_TOKEN_LIMIT
        return settings.token_limit

    def _get(self) -> UserSettings | None:
        """保存済みの UserSettings 行を返す。未作成の場合は None。"""
        return self.session.get(UserSettings, self.user_id)

    @staticmethod
    def _validated(value: str, allowed: list[dict], label: str) -> str:
        """許可一覧に含まれる値のみを返し、それ以外は ValidationFailed を送出する。"""
        valid = [item["id"] for item in allowed]
        if value not in valid:
            raise ValidationFailed(f"Invalid {label}. Must be one of: {valid}")
        return value
