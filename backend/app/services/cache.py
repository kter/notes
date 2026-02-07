import hashlib
import logging

import boto3
from botocore.exceptions import ClientError

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class CacheService:
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
            logger.info(f"Cache hit (S3) for hash: {content_hash}")
            return response["Body"].read().decode("utf-8")

        except ClientError as e:
            # S3 returns NoSuchKey error if object doesn't exist
            if e.response['Error']['Code'] == "NoSuchKey":
                return None
            
            logger.error(f"Error retrieving cache: {e}")
            return None

    def save_summary(self, content: str, model_id: str, summary: str):
        """Save summary to S3 cache."""
        content_hash = self._calculate_hash(content, model_id)
        s3_key = f"{content_hash}"

        try:
            self.s3.put_object(
                Bucket=self.bucket,
                Key=s3_key,
                Body=summary.encode("utf-8")
            )
            logger.info(f"Cache saved to S3 for hash: {content_hash}")

        except ClientError as e:
            logger.error(f"Error saving cache: {e}")


# Singleton
cache_service = CacheService()


def get_cache_service() -> CacheService:
    return cache_service
