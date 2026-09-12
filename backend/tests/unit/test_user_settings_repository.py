"""UserSettingsRepository のユニットテスト。

UserSettings のポリシー（許可値の検証・退役モデルの解決・未作成ユーザーの既定値）は
このリポジトリが唯一の所有者である。以前は settings / admin / assistant / usage_policy の
4 箇所が UserSettings を直接読んでおり、admin だけが resolve_model_id を通していなかった。
"""

import pytest
from sqlmodel import Session

from app.features.settings.repository import UserSettingsRepository
from app.models import (
    DEFAULT_LANGUAGE,
    DEFAULT_LLM_MODEL_ID,
    UserSettings,
)
from app.models.token_usage import MONTHLY_TOKEN_LIMIT
from app.shared import ValidationFailed

USER_ID = "settings-repo-user"

# 退役済みモデル ID。AVAILABLE_MODELS には含まれないが、過去に保存されえた値。
RETIRED_MODEL_ID = "us.anthropic.claude-3-5-haiku-20241022-v1:0"


@pytest.fixture(name="repo")
def repo_fixture(session: Session) -> UserSettingsRepository:
    return UserSettingsRepository(session, USER_ID)


class TestGetOrCreate:
    def test_creates_defaults_when_missing(self, repo: UserSettingsRepository):
        settings = repo.get_or_create()
        assert settings.user_id == USER_ID
        assert settings.llm_model_id == DEFAULT_LLM_MODEL_ID

    def test_returns_existing_without_creating_a_second_row(
        self, repo: UserSettingsRepository
    ):
        first = repo.get_or_create()
        first.language = "ja"
        second = repo.get_or_create()
        assert second.language == "ja"


class TestRead:
    def test_missing_settings_yields_defaults(self, repo: UserSettingsRepository):
        read = repo.read()
        assert read.user_id == USER_ID
        assert read.llm_model_id == DEFAULT_LLM_MODEL_ID
        assert read.language == DEFAULT_LANGUAGE

    def test_retired_model_is_resolved_to_the_default(
        self, session: Session, repo: UserSettingsRepository
    ):
        """退役モデルを保存済みのユーザーには既定値を見せる。

        生の値を返すと、設定 API 自身が 400 で弾く ID を返すことになる。
        admin 側のパスがこの解決を飛ばしていたのが実際の不整合だった。
        """
        session.add(UserSettings(user_id=USER_ID, llm_model_id=RETIRED_MODEL_ID))
        session.commit()

        assert repo.read().llm_model_id == DEFAULT_LLM_MODEL_ID

    def test_available_model_is_returned_as_is(
        self, session: Session, repo: UserSettingsRepository
    ):
        session.add(UserSettings(user_id=USER_ID, llm_model_id=DEFAULT_LLM_MODEL_ID))
        session.commit()

        assert repo.read().llm_model_id == DEFAULT_LLM_MODEL_ID


class TestStageUpdate:
    def test_rejects_unavailable_model_on_create(self, repo: UserSettingsRepository):
        """新規作成パスでも許可モデル検証を通る。

        以前は設定が未作成のユーザーだけが検証を素通りしていた。
        """
        with pytest.raises(ValidationFailed):
            repo.stage_update(llm_model_id=RETIRED_MODEL_ID)

    def test_rejects_unavailable_model_on_update(
        self, session: Session, repo: UserSettingsRepository
    ):
        session.add(UserSettings(user_id=USER_ID))
        session.commit()

        with pytest.raises(ValidationFailed):
            repo.stage_update(llm_model_id="not-a-model")

    def test_rejects_unavailable_language(self, repo: UserSettingsRepository):
        with pytest.raises(ValidationFailed):
            repo.stage_update(language="klingon")

    def test_none_fields_are_left_untouched(
        self, session: Session, repo: UserSettingsRepository
    ):
        session.add(UserSettings(user_id=USER_ID, language="ja", token_limit=42))
        session.commit()

        staged = repo.stage_update(llm_model_id=DEFAULT_LLM_MODEL_ID)
        assert staged.language == "ja"
        assert staged.token_limit == 42

    def test_does_not_commit(self, session: Session, repo: UserSettingsRepository):
        """stage_update はセッションに載せるだけで、コミットは呼び出し側が行う。"""
        repo.stage_update(language="en")
        session.rollback()
        assert session.get(UserSettings, USER_ID) is None


class TestApplyUpdate:
    def test_commits_and_returns_updated_settings(
        self, session: Session, repo: UserSettingsRepository
    ):
        updated = repo.apply_update(language="en", token_limit=100)
        assert updated.language == "en"
        assert updated.token_limit == 100
        assert session.get(UserSettings, USER_ID) is not None


class TestTokenLimit:
    def test_global_default_when_settings_missing(self, repo: UserSettingsRepository):
        assert repo.token_limit() == MONTHLY_TOKEN_LIMIT

    def test_per_user_override(self, session: Session, repo: UserSettingsRepository):
        session.add(UserSettings(user_id=USER_ID, token_limit=7))
        session.commit()

        assert repo.token_limit() == 7


class TestResolveForAi:
    def test_defaults_when_settings_missing(self, repo: UserSettingsRepository):
        assert repo.resolve_for_ai() == (DEFAULT_LLM_MODEL_ID, DEFAULT_LANGUAGE)

    def test_retired_model_never_reaches_invoke_model(
        self, session: Session, repo: UserSettingsRepository
    ):
        session.add(
            UserSettings(user_id=USER_ID, llm_model_id=RETIRED_MODEL_ID, language="ja")
        )
        session.commit()

        assert repo.resolve_for_ai() == (DEFAULT_LLM_MODEL_ID, "ja")
