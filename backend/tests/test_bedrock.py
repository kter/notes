import json
import re
from unittest.mock import Mock, patch

import pytest
from botocore.exceptions import ClientError

from app.features.assistant.gateway import EDIT_SINGLE_PASS_MAX_CHARS, BedrockGateway


@pytest.fixture
def mock_settings():
    with patch("app.features.assistant.gateway.settings") as mock_settings:
        mock_settings.aws_region = "us-east-1"
        yield mock_settings


@pytest.fixture
def mock_boto_client():
    with patch("boto3.client") as mock_client:
        client_instance = Mock()
        mock_client.return_value = client_instance
        yield client_instance


@pytest.mark.asyncio
async def test_summarize_success(mock_boto_client, mock_settings):
    service = BedrockGateway()

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

    summary, total_tokens = await service.summarize("Original content")

    assert summary == "This is a summary."
    assert isinstance(total_tokens, int)
    mock_boto_client.invoke_model.assert_called_once()

    # Verify call args
    call_args = mock_boto_client.invoke_model.call_args[1]
    # Check if modelId is correct (default from None in settings mock, assuming mock_settings allows usage)
    # The code: effective_model_id = model_id or self.model_id
    # mock_settings.bedrock_model_id calls. I need to make sure mock_settings has that attr
    # Current mock_settings fixture only sets aws_region.
    # Default behavior of MagicMock (settings) is to return Mocks for attributes.
    # So self.model_id will be a Mock object.

    body = json.loads(call_args["body"])
    assert "Original content" in body["messages"][0]["content"]


@pytest.mark.asyncio
async def test_chat_success(mock_boto_client, mock_settings):
    service = BedrockGateway()

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
async def test_edit_success(mock_boto_client, mock_settings):
    service = BedrockGateway()

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
    )

    assert edited == "Edited text here."
    assert isinstance(total_tokens, int)

    # Verify max_tokens is 8192 for edit
    call_args = mock_boto_client.invoke_model.call_args[1]
    body = json.loads(call_args["body"])
    assert body["max_tokens"] == 8192
    assert "<current_content>" in body["messages"][0]["content"]


@pytest.mark.asyncio
async def test_edit_fallback_no_tags(mock_boto_client, mock_settings):
    service = BedrockGateway()

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
    )

    assert edited == "Edited text without tags."


def test_extract_edited_content():
    service = BedrockGateway()

    # With tags
    result = service._extract_edited_content(
        "Some preamble\n<edited_content>\nHello world\n</edited_content>\nSome postamble"
    )
    assert result == "Hello world"

    # Without tags (fallback)
    result = service._extract_edited_content("Just plain text")
    assert result == "Just plain text"

    # Empty tags
    result = service._extract_edited_content("<edited_content></edited_content>")
    assert result == ""

    # Preserve whitespace for chunk joins
    result = service._extract_edited_content(
        "<edited_content>\nHello world\n</edited_content>",
        preserve_whitespace=True,
    )
    assert result == "\nHello world\n"


@pytest.mark.asyncio
async def test_bedrock_error(mock_boto_client, mock_settings):
    service = BedrockGateway()

    mock_boto_client.invoke_model.side_effect = ClientError(
        {"Error": {"Code": "ValidationException", "Message": "Bad request"}},
        "InvokeModel",
    )

    with pytest.raises(ClientError):
        await service.summarize("Fail content")


def test_chunk_content_for_edit_preserves_text():
    service = BedrockGateway()
    content = (
        "# Title\n\n"
        "Paragraph 1\n\n"
        "## Section A\n\n"
        + ("Line in section A.\n" * 300)
        + "\n## Section B\n\n"
        + ("Line in section B.\n" * 300)
    )

    chunks = service._chunk_content_for_edit(content)

    assert len(chunks) > 1
    assert "".join(chunks) == content


@pytest.mark.asyncio
async def test_edit_large_content_uses_chunking(mock_boto_client, mock_settings):
    service = BedrockGateway()
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
    )

    assert len(content) > EDIT_SINGLE_PASS_MAX_CHARS
    assert len(calls) > 1
    assert edited == content.replace("teh", "the")
    assert total_tokens == 11 * len(calls)
