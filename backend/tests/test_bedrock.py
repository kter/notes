import json
from unittest.mock import Mock, patch

import pytest
from botocore.exceptions import ClientError

from app.services.bedrock import BedrockService


@pytest.fixture
def mock_settings():
    with patch("app.services.bedrock.settings") as mock_settings:
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
    service = BedrockService()
    
    # Mock response from Bedrock
    mock_response_body = json.dumps({
        "content": [{"text": "This is a summary."}]
    })
    mock_boto_client.invoke_model.return_value = {
        "body": Mock(read=Mock(return_value=mock_response_body.encode()))
    }
    
    summary = await service.summarize("Original content")
    
    assert summary == "This is a summary."
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
    service = BedrockService()
    
    mock_response_body = json.dumps({
        "content": [{"text": "Chat answer."}]
    })
    mock_boto_client.invoke_model.return_value = {
        "body": Mock(read=Mock(return_value=mock_response_body.encode()))
    }
    
    answer = await service.chat(
        content="Context info",
        question="User question",
    )
    
    assert answer == "Chat answer."
    
    # Verify context and question are in the prompt
    call_args = mock_boto_client.invoke_model.call_args[1]
    body = json.loads(call_args["body"])
    messages_content = body["messages"][0]["content"]
    assert "Context info" in messages_content
    assert "User question" in messages_content

@pytest.mark.asyncio
async def test_bedrock_error(mock_boto_client, mock_settings):
    service = BedrockService()
    
    mock_boto_client.invoke_model.side_effect = ClientError(
        {"Error": {"Code": "ValidationException", "Message": "Bad request"}},
        "InvokeModel"
    )
    
    with pytest.raises(ClientError):
        await service.summarize("Fail content")
