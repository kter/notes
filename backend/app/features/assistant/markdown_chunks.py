"""AI 編集のための Markdown 分割とタグ抽出。

責務: 長い Markdown を構造を壊さずに編集単位へ分割し、モデル応答から
    タグで囲まれた本文を取り出す。AWS にも Bedrock にも依存しない純粋なテキスト処理。
主要なエクスポート: needs_chunking, chunk_for_edit, extract_tagged
呼び出し関係: features/assistant/gateway.py の edit 経路から呼ばれる。

このモジュールが独立している理由:
    以前この処理は BedrockGateway の private クラスメソッドとしてのみ到達可能で、
    テキスト分割のテストが boto3 クライアントのモックを経由していた。AWS と無関係な
    ロジックは AWS アダプタの外に置き、モックなしで直接テストできるようにする。

不変条件:
    chunk_for_edit は分割のみを行い、内容を書き換えない。
    すなわち常に ``"".join(chunk_for_edit(text)) == text`` が成り立つ。
"""

import re

# この文字数以下のコンテンツはチャンク分割せずに1回のAPI呼び出しで処理する
EDIT_SINGLE_PASS_MAX_CHARS = 12_000
# チャンク分割時の目標文字数（この値を超えたら新チャンクを開始する）
EDIT_CHUNK_TARGET_CHARS = 4_000
# チャンク分割時の上限文字数（セグメントがこれを超える場合は強制分割する）
EDIT_CHUNK_MAX_CHARS = 6_000


def needs_chunking(content: str) -> bool:
    """チャンク分割が必要な長さかどうかを返す。

    短いコンテンツはシングルパスで処理する（チャンク分割のオーバーヘッドを回避）。
    """
    return len(content) > EDIT_SINGLE_PASS_MAX_CHARS


def extract_tagged(text: str, tag: str, *, preserve_whitespace: bool = False) -> str:
    """モデル応答から <tag> ... </tag> で囲まれた本文を抽出する。

    タグが見つからない場合は応答全体を返す（モデルがタグを省略した場合の保険）。
    チャンク結合時は前後の空白を保持する（preserve_whitespace=True）。
    """
    match = re.search(rf"<{tag}>(.*?)</{tag}>", text, re.DOTALL)
    if match:
        content = match.group(1)
        return content if preserve_whitespace else content.strip()
    return text.strip()


def chunk_for_edit(content: str) -> list[str]:
    """Markdown構造を保ちながらコンテンツをチャンクに分割する。

    見出し行（#）をセグメント境界として優先的に分割し、
    コードフェンス（``` / ~~~）内では分割しない。
    最終的に EDIT_CHUNK_TARGET_CHARS を目安にセグメントを結合してチャンクを生成する。

    分割のみを行い内容は書き換えないため、結果を連結すると入力と一致する。
    """
    if len(content) <= EDIT_CHUNK_MAX_CHARS:
        return [content]

    segments = _split_into_segments(content)

    # 超過サイズのセグメントを強制分割して正規化する
    normalized_segments: list[str] = []
    for segment in segments:
        normalized_segments.extend(
            _split_oversized_segment(segment, EDIT_CHUNK_MAX_CHARS)
        )

    return _merge_segments(normalized_segments, EDIT_CHUNK_TARGET_CHARS)


def _split_into_segments(content: str) -> list[str]:
    """見出しと空行を境界にセグメント分割する。コードフェンス内では区切らない。"""
    segments: list[str] = []
    current: list[str] = []
    in_code_fence = False

    for line in content.splitlines(keepends=True):
        stripped = line.lstrip()
        is_fence = stripped.startswith("```") or stripped.startswith("~~~")

        # コードフェンス外の見出し行でセグメントを区切る
        if current and not in_code_fence and stripped.startswith("#"):
            segments.append("".join(current))
            current = [line]
            if is_fence:
                in_code_fence = not in_code_fence
            continue

        current.append(line)

        if is_fence:
            in_code_fence = not in_code_fence

        # コードフェンス外の空行でセグメントを区切る
        if not in_code_fence and line.strip() == "":
            segments.append("".join(current))
            current = []

    if current:
        segments.append("".join(current))

    return segments


def _split_oversized_segment(segment: str, max_chars: int) -> list[str]:
    """EDIT_CHUNK_MAX_CHARS を超えるセグメントを行単位で強制分割する。"""
    if len(segment) <= max_chars:
        return [segment]

    parts: list[str] = []
    current: list[str] = []
    current_len = 0

    for line in segment.splitlines(keepends=True):
        line_len = len(line)
        if line_len > max_chars:
            # 1行がmax_charsを超える場合は文字単位でスライスする
            if current:
                parts.append("".join(current))
                current = []
                current_len = 0
            for start in range(0, line_len, max_chars):
                parts.append(line[start : start + max_chars])
            continue

        if current_len + line_len > max_chars and current:
            parts.append("".join(current))
            current = [line]
            current_len = line_len
            continue

        current.append(line)
        current_len += line_len

    if current:
        parts.append("".join(current))

    return parts


def _merge_segments(segments: list[str], target_chars: int) -> list[str]:
    """セグメントを target_chars を目安に結合してチャンクを生成する。"""
    chunks: list[str] = []
    chunk_parts: list[str] = []
    chunk_len = 0

    for segment in segments:
        segment_len = len(segment)

        if chunk_parts and chunk_len + segment_len > target_chars:
            chunks.append("".join(chunk_parts))
            chunk_parts = [segment]
            chunk_len = segment_len
            continue

        chunk_parts.append(segment)
        chunk_len += segment_len

    if chunk_parts:
        chunks.append("".join(chunk_parts))

    return chunks
