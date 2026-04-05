import hashlib
import logging

import boto3
from botocore.exceptions import ClientError

from app.config import get_settings
from app.logging_utils import log_event

logger = logging.getLogger(__name__)
settings = get_settings()


class SummaryCache:
    def __init__(self):
        self.s3 = boto3.client("s3", region_name=settings.aws_region)
        self.bucket = settings.cache_bucket_name

    def _calculate_hash(self, content: str, model_id: str) -> str:
        """Calculate SHA256 hash of content and model_id."""
        return hashlib.sha256(f"{content}:{model_id}".encode()).hexdigest()

    def get_cached_summary(self, content: str, model_id: str) -> str | None:
        """Retrieve cached summary from S3 if it exists."""
        content_hash = self._calculate_hash(content, model_id)
        s3_key = f"{content_hash}"

        try:
            response = self.s3.get_object(Bucket=self.bucket, Key=s3_key)
            log_event(
                logger,
                logging.INFO,
                "ops.ai.summary_cache.hit",
                cache_key=content_hash,
                outcome="success",
            )
            return response["Body"].read().decode("utf-8")

        except ClientError as exc:
            if exc.response["Error"]["Code"] == "NoSuchKey":
                log_event(
                    logger,
                    logging.DEBUG,
                    "ops.ai.summary_cache.miss",
                    cache_key=content_hash,
                    outcome="miss",
                )
                return None

            log_event(
                logger,
                logging.ERROR,
                "ops.ai.summary_cache.read_failed",
                cache_key=content_hash,
                outcome="error",
                reason=exc.response["Error"]["Code"],
            )
            return None

    def save_summary(self, content: str, model_id: str, summary: str):
        """Save summary to S3 cache."""
        content_hash = self._calculate_hash(content, model_id)
        s3_key = f"{content_hash}"

        try:
            self.s3.put_object(
                Bucket=self.bucket, Key=s3_key, Body=summary.encode("utf-8")
            )
            log_event(
                logger,
                logging.INFO,
                "ops.ai.summary_cache.saved",
                cache_key=content_hash,
                outcome="success",
            )

        except ClientError as exc:
            log_event(
                logger,
                logging.ERROR,
                "ops.ai.summary_cache.write_failed",
                cache_key=content_hash,
                outcome="error",
                reason=exc.response["Error"]["Code"],
            )


summary_cache = SummaryCache()


def get_summary_cache() -> SummaryCache:
    return summary_cache
