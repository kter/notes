import json
import re
from unittest.mock import Mock, patch

import pytest
from botocore.exceptions import ClientError

from app.features.assistant.gateway import (
    AIRequest,
    BedrockGateway,
    _reset_ai_gateway_cache,
    get_ai_gateway,
)
from app.features.assistant.markdown_chunks import EDIT_SINGLE_PASS_MAX_CHARS


@pytest.fixture
def mock_settings():
    with patch("app.features.assistant.gateway.get_settings") as get_settings:
        mock_settings = Mock()
        mock_settings.bedrock_region = "us-east-1"
        mock_settings.bedrock_model_id = "test-model"
        get_settings.return_value = mock_settings
        yield mock_settings


@pytest.fixture
def mock_summary_cache():
    """summarize() が実 S3 を触らないように注入するキャッシュを返す。"""
    cache = Mock()
    cache.get_cached_summary.return_value = None
    return cache


@pytest.fixture
def mock_boto_client():
    with patch("boto3.client") as mock_client:
        client_instance = Mock()
        mock_client.return_value = client_instance
        yield client_instance


def test_get_ai_gateway_caches_until_reset():
    first_gateway = Mock()
    second_gateway = Mock()
    _reset_ai_gateway_cache()

    try:
        with patch(
            "app.features.assistant.gateway.BedrockGateway",
            side_effect=[first_gateway, second_gateway],
        ) as gateway_factory:
            assert get_ai_gateway() is first_gateway
            assert get_ai_gateway() is first_gateway
            gateway_factory.assert_called_once_with()

            _reset_ai_gateway_cache()

            assert get_ai_gateway() is second_gateway
            assert gateway_factory.call_count == 2
    finally:
        _reset_ai_gateway_cache()


@pytest.mark.asyncio
async def test_summarize_success(mock_boto_client, mock_settings, mock_summary_cache):
    service = BedrockGateway(summary_cache=mock_summary_cache)

    # Mock response from Bedrock
    mock_response_body = json.dumps(
        {
            "content": [{"text": "This is a summary."}],
            "usage": {"inputTokens": 10, "outputTokens": 10},
        }
    )
    mock_boto_client.invoke_model.return_value = {
        "body": Mock(read=Mock(return_value=mock_response_body.encode()))
    }

    summary, total_tokens = await service.summarize("Original content", AIRequest())

    assert summary == "This is a summary."
    assert isinstance(total_tokens, int)
    mock_boto_client.invoke_model.assert_called_once()

    # Verify call args
    call_args = mock_boto_client.invoke_model.call_args[1]
    body = json.loads(call_args["body"])
    assert "Original content" in body["messages"][0]["content"]
    mock_summary_cache.save_summary.assert_called_once_with(
        "Original content", None, "This is a summary."
    )


@pytest.mark.asyncio
async def test_chat_success(mock_boto_client, mock_settings, mock_summary_cache):
    service = BedrockGateway(summary_cache=mock_summary_cache)

    mock_response_body = json.dumps(
        {
            "content": [{"text": "Chat answer."}],
            "usage": {"inputTokens": 10, "outputTokens": 10},
        }
    )
    mock_boto_client.invoke_model.return_value = {
        "body": Mock(read=Mock(return_value=mock_response_body.encode()))
    }

    answer, total_tokens = await service.chat(
        content="Context info",
        question="User question",
        request=AIRequest(),
    )

    assert answer == "Chat answer."
    assert isinstance(total_tokens, int)

    # Verify context and question are in the prompt
    call_args = mock_boto_client.invoke_model.call_args[1]
    body = json.loads(call_args["body"])
    messages_content = body["messages"][0]["content"]
    assert "Context info" in messages_content
    assert "User question" in messages_content


@pytest.mark.asyncio
async def test_edit_success(mock_boto_client, mock_settings, mock_summary_cache):
    service = BedrockGateway(summary_cache=mock_summary_cache)

    mock_response_body = json.dumps(
        {
            "content": [{"text": "<edited_content>Edited text here.</edited_content>"}],
            "usage": {"input_tokens": 50, "output_tokens": 30},
        }
    )
    mock_boto_client.invoke_model.return_value = {
        "body": Mock(read=Mock(return_value=mock_response_body.encode()))
    }

    edited, total_tokens = await service.edit(
        content="Original text",
        instruction="Fix typos",
        request=AIRequest(),
    )

    assert edited == "Edited text here."
    assert isinstance(total_tokens, int)

    # Verify max_tokens is 8192 for edit
    call_args = mock_boto_client.invoke_model.call_args[1]
    body = json.loads(call_args["body"])
    assert body["max_tokens"] == 8192
    assert "<current_content>" in body["messages"][0]["content"]


@pytest.mark.asyncio
async def test_edit_fallback_no_tags(
    mock_boto_client, mock_settings, mock_summary_cache
):
    service = BedrockGateway(summary_cache=mock_summary_cache)

    mock_response_body = json.dumps(
        {
            "content": [{"text": "Edited text without tags."}],
            "usage": {"input_tokens": 50, "output_tokens": 30},
        }
    )
    mock_boto_client.invoke_model.return_value = {
        "body": Mock(read=Mock(return_value=mock_response_body.encode()))
    }

    edited, _ = await service.edit(
        content="Original text",
        instruction="Fix typos",
        request=AIRequest(),
    )

    assert edited == "Edited text without tags."


@pytest.mark.asyncio
async def test_bedrock_error(mock_boto_client, mock_settings, mock_summary_cache):
    service = BedrockGateway(summary_cache=mock_summary_cache)

    mock_boto_client.invoke_model.side_effect = ClientError(
        {"Error": {"Code": "ValidationException", "Message": "Bad request"}},
        "InvokeModel",
    )

    with pytest.raises(ClientError):
        await service.summarize("Fail content", AIRequest())


@pytest.mark.asyncio
async def test_edit_large_content_uses_chunking(
    mock_boto_client, mock_settings, mock_summary_cache
):
    service = BedrockGateway(summary_cache=mock_summary_cache)
    content = "# Title\n\n" + ("teh quick brown fox.\n\n" * 1200)
    calls: list[str] = []

    def fake_invoke_model(
        messages: list[dict],
        system: str | None = None,
        model_id: str | None = None,
        max_tokens: int = 4096,
    ) -> tuple[str, int]:
        message = messages[0]["content"]
        match = re.search(
            r"<current_content>\n(.*)\n</current_content>", message, re.DOTALL
        )
        assert match is not None
        chunk = match.group(1)
        calls.append(chunk)
        return (
            f"<edited_content>{chunk.replace('teh', 'the')}</edited_content>",
            11,
        )

    service._invoke_model = Mock(side_effect=fake_invoke_model)

    edited, total_tokens = await service.edit(
        content=content,
        instruction="Fix typos",
        request=AIRequest(),
    )

    assert len(content) > EDIT_SINGLE_PASS_MAX_CHARS
    assert len(calls) > 1
    assert edited == content.replace("teh", "the")
    assert total_tokens == 11 * len(calls)


# 退役済み Bedrock モデル ID の一覧。
# 2026-08-09 時点で、この2つは実際に InvokeModel が
# ResourceNotFoundException("This model version has reached the end of its life")
# を返す。以前これが本番に入り込み、AI 要約・チャットが停止した。
RETIRED_BEDROCK_MODEL_IDS = frozenset(
    {
        "anthropic.claude-3-5-sonnet-20240620-v1:0",
        "anthropic.claude-3-5-sonnet-20241022-v2:0",
        "anthropic.claude-3-sonnet-20240229-v1:0",
    }
)


def _declared_default(field_name: str) -> str:
    """Settings クラスが宣言している既定値を返す。

    `get_settings()` ではなくクラスの既定値を見るのは意図的。前者はローカルの
    `backend/.env` に上書きされるため、開発者の手元の設定次第で結果が変わって
    しまう。ここで検証したいのは「リポジトリが出荷する値」なので、環境に依存
    しないクラス既定値を対象にする。
    """
    from app.config import Settings

    return Settings.model_fields[field_name].default


def test_default_bedrock_model_is_not_retired():
    """既定のモデル ID が退役済みモデルに逆戻りしていないことを検査する。

    ここが通らない場合、AI 機能はデプロイした瞬間に沈黙する。
    """
    model_id = _declared_default("bedrock_model_id")
    assert model_id not in RETIRED_BEDROCK_MODEL_IDS, (
        f"BEDROCK_MODEL_ID={model_id!r} は退役済みで InvokeModel が失敗する。"
        " 現行世代の推論プロファイルに更新すること。"
    )


def test_jp_inference_profile_is_paired_with_its_region():
    """`jp.` 推論プロファイルは ap-northeast-1 にしか存在しない。

    リージョンとモデル ID は必ず一組で設定する必要があり、
    片方だけ変えると実行時に落ちる。
    """
    model_id = _declared_default("bedrock_model_id")
    region = _declared_default("bedrock_region")
    if model_id.startswith("jp."):
        assert region == "ap-northeast-1", (
            f"jp. プロファイル {model_id!r} には ap-northeast-1 が必要だが"
            f" bedrock_region={region!r} になっている。"
        )
