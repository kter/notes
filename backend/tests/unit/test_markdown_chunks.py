"""markdown_chunks のユニットテスト。

このモジュールは AWS に依存しない純粋なテキスト処理なので、boto3 のモックを
一切使わずに直接テストできる。以前は BedrockGateway の private クラスメソッド
としてしか到達できず、テキスト分割の検証が AWS クライアントのモック越しだった。
"""

from app.features.assistant.markdown_chunks import (
    EDIT_CHUNK_MAX_CHARS,
    EDIT_SINGLE_PASS_MAX_CHARS,
    chunk_for_edit,
    extract_tagged,
    needs_chunking,
)


class TestNeedsChunking:
    def test_short_content_is_single_pass(self):
        assert needs_chunking("a" * EDIT_SINGLE_PASS_MAX_CHARS) is False

    def test_long_content_needs_chunking(self):
        assert needs_chunking("a" * (EDIT_SINGLE_PASS_MAX_CHARS + 1)) is True


class TestExtractTagged:
    def test_extracts_tagged_body(self):
        result = extract_tagged(
            "Some preamble\n<edited_content>\nHello world\n</edited_content>\nPost",
            "edited_content",
        )
        assert result == "Hello world"

    def test_falls_back_to_the_whole_response_without_tags(self):
        assert extract_tagged("Just plain text", "edited_content") == "Just plain text"

    def test_empty_tags_yield_empty_string(self):
        assert (
            extract_tagged("<edited_content></edited_content>", "edited_content") == ""
        )

    def test_preserve_whitespace_keeps_chunk_boundaries(self):
        """チャンク結合時に前後の空白を落とすと、連結後の Markdown が壊れる。"""
        result = extract_tagged(
            "<edited_content>\nHello world\n</edited_content>",
            "edited_content",
            preserve_whitespace=True,
        )
        assert result == "\nHello world\n"


class TestChunkForEdit:
    def test_short_content_is_one_chunk(self):
        content = "# Title\n\nJust a short note.\n"
        assert chunk_for_edit(content) == [content]

    def test_splitting_is_lossless(self):
        """不変条件: 分割は内容を書き換えない。"""
        content = (
            "# Title\n\n"
            "Paragraph 1\n\n"
            "## Section A\n\n" + ("Line in section A.\n" * 300) + "\n"
            "## Section B\n\n" + ("Line in section B.\n" * 300)
        )

        chunks = chunk_for_edit(content)

        assert len(chunks) > 1
        assert "".join(chunks) == content

    def test_code_fences_are_never_split(self):
        """コードフェンス内で分割すると、片側だけ閉じていない Markdown が出来る。"""
        fenced = "```python\n" + ("x = 1\n" * 400) + "```\n"
        content = "# Title\n\n" + fenced + "\n## After\n\n" + ("tail\n" * 400)

        chunks = chunk_for_edit(content)

        assert "".join(chunks) == content
        for chunk in chunks:
            # 各チャンク内のフェンス数が偶数なら、フェンスをまたいで割れていない。
            # （フェンス自体が EDIT_CHUNK_MAX_CHARS を超えて強制分割される場合を除く）
            if len(chunk) < EDIT_CHUNK_MAX_CHARS:
                assert chunk.count("```") % 2 == 0

    def test_oversized_single_line_is_sliced(self):
        """1行が上限を超える場合でも、連結すれば元に戻る。"""
        content = "x" * (EDIT_CHUNK_MAX_CHARS * 3)

        chunks = chunk_for_edit(content)

        assert len(chunks) > 1
        assert all(len(chunk) <= EDIT_CHUNK_MAX_CHARS for chunk in chunks)
        assert "".join(chunks) == content

    def test_chunks_break_on_line_boundaries(self):
        """行の途中で割ると、モデルに壊れた Markdown を渡すことになる。

        1行が上限を超えて強制スライスされる場合を除き、各チャンクは
        改行の直後から始まる。
        """
        section = "Body line.\n" * 500
        content = "".join(f"## Section {i}\n\n{section}\n" for i in range(4))

        chunks = chunk_for_edit(content)

        assert len(chunks) > 1
        assert "".join(chunks) == content
        for chunk in chunks[:-1]:
            assert chunk.endswith("\n")
