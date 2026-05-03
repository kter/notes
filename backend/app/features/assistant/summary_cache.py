"""要約結果をS3にキャッシュするモジュール。

責務: コンテンツとモデルIDのハッシュをキーとしてS3に要約を保存・取得する。
    キャッシュヒット時はBedrockを呼び出さないためトークン消費を抑制できる。
主要なエクスポート: SummaryCache, get_summary_cache。
呼び出し関係: gateway.py の BedrockGateway.summarize から呼ばれる。
"""

import hashlib
import logging

import boto3
from botocore.exceptions import ClientError

from app.config import get_settings
from app.logging_utils import log_event

logger = logging.getLogger(__name__)
settings = get_settings()


class SummaryCache:
    """S3を使った要約キャッシュ。キー = SHA256(content:model_id)。"""

    def __init__(self):
        # S3クライアントをシングルトンで保持する
        self.s3 = boto3.client("s3", region_name=settings.aws_region)
        self.bucket = settings.cache_bucket_name

    def _calculate_hash(self, content: str, model_id: str) -> str:
        """コンテンツとモデルIDを結合したSHA256ハッシュを返す。S3オブジェクトキーに使用する。"""
        return hashlib.sha256(f"{content}:{model_id}".encode()).hexdigest()

    def get_cached_summary(self, content: str, model_id: str) -> str | None:
        """S3から要約キャッシュを取得する。存在しない場合は None を返す。

        NoSuchKey エラーはキャッシュミスとして扱い None を返す。
        その他のS3エラーもキャッシュ不在として扱い、処理を継続させる。
        """
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
                # キャッシュミスは正常系なのでDEBUGレベルで記録する
                log_event(
                    logger,
                    logging.DEBUG,
                    "ops.ai.summary_cache.miss",
                    cache_key=content_hash,
                    outcome="miss",
                )
                return None

            # その他のS3エラー（権限不足など）はERRORで記録してキャッシュミス扱いにする
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
        """要約をS3キャッシュに保存する。書き込みエラーは記録するが例外は再送出しない。"""
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
            # キャッシュ書き込み失敗はサービス継続に影響しないためERRORのみ記録する
            log_event(
                logger,
                logging.ERROR,
                "ops.ai.summary_cache.write_failed",
                cache_key=content_hash,
                outcome="error",
                reason=exc.response["Error"]["Code"],
            )


# モジュール起動時にシングルトンインスタンスを生成する
summary_cache = SummaryCache()


def get_summary_cache() -> SummaryCache:
    """アプリケーション全体で共有するSummaryCacheのシングルトンを返す。"""
    return summary_cache
