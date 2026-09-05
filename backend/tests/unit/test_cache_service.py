import hashlib
import unittest
from unittest.mock import MagicMock, patch

from app.features.assistant.summary_cache import (
    SummaryCache,
    _reset_summary_cache,
    get_summary_cache,
)


class TestCacheService(unittest.TestCase):
    def setUp(self):
        self.mock_s3 = MagicMock()
        self.cache_service = SummaryCache(s3_client=self.mock_s3)

    def test_get_cached_summary_s3_hit(self):
        content = "test content"
        model_id = "test-model"
        expected_summary = "test summary"
        content_hash = hashlib.sha256(f"{content}:{model_id}".encode()).hexdigest()

        mock_body = MagicMock()
        mock_body.read.return_value = expected_summary.encode("utf-8")
        self.mock_s3.get_object.return_value = {"Body": mock_body}

        summary = self.cache_service.get_cached_summary(content, model_id)

        self.assertEqual(summary, expected_summary)
        self.mock_s3.get_object.assert_called_with(
            Bucket="notes-app-cache-local", Key=content_hash
        )

    def test_get_cached_summary_miss(self):
        content = "test content"
        model_id = "test-model"

        # Simulate NoSuchKey error
        error_response = {"Error": {"Code": "NoSuchKey"}}
        self.mock_s3.get_object.side_effect = Exception(
            error_response
        )  # ClientError is complex to mock fully, simplest way is to check handling
        # Actually, let's look at how we implemented it. We import ClientError.
        # So we should raise ClientError.
        from botocore.exceptions import ClientError

        self.mock_s3.get_object.side_effect = ClientError(error_response, "GetObject")

        summary = self.cache_service.get_cached_summary(content, model_id)
        self.assertIsNone(summary)

    def test_save_summary(self):
        content = "test content"
        model_id = "test-model"
        summary = "test summary"
        content_hash = hashlib.sha256(f"{content}:{model_id}".encode()).hexdigest()

        self.cache_service.save_summary(content, model_id, summary)

        self.mock_s3.put_object.assert_called_once_with(
            Bucket="notes-app-cache-local",
            Key=content_hash,
            Body=summary.encode("utf-8"),
        )

    def test_get_summary_cache_caches_until_reset(self):
        first_cache = MagicMock()
        second_cache = MagicMock()
        _reset_summary_cache()

        try:
            with patch(
                "app.features.assistant.summary_cache.SummaryCache",
                side_effect=[first_cache, second_cache],
            ) as cache_factory:
                self.assertIs(get_summary_cache(), first_cache)
                self.assertIs(get_summary_cache(), first_cache)
                cache_factory.assert_called_once_with()

                _reset_summary_cache()

                self.assertIs(get_summary_cache(), second_cache)
                self.assertEqual(cache_factory.call_count, 2)
        finally:
            _reset_summary_cache()
