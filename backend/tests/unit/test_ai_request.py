"""AIRequest のユニットテスト。

model_id と language は UserSettings 由来の値で、以前はゲートウェイの全メソッドに
2 引数として個別に流し込まれ、"auto" → "en" の解決がアダプタ内部で毎回行われていた。
今はこの値オブジェクトが両方を所有する。
"""

from app.features.assistant.gateway import AIRequest


class TestResolvedLanguage:
    def test_auto_falls_back_to_english(self):
        """ユーザーが言語を選んでいない場合のプロンプト言語は英語。"""
        assert AIRequest(language="auto").resolved_language == "en"

    def test_explicit_language_is_kept(self):
        assert AIRequest(language="ja").resolved_language == "ja"

    def test_default_request_is_auto(self):
        assert AIRequest().language == "auto"
        assert AIRequest().resolved_language == "en"
        assert AIRequest().model_id is None
