"""批次進度 Pub/Sub 服務"""

import asyncio
import json
import time
from typing import AsyncGenerator

import redis.asyncio as redis

from app.config import settings


def _get_redis_client() -> redis.Redis:
    return redis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)


async def publish_batch_event(batch_id: str, payload: dict) -> None:
    """發布批次進度事件到 Redis channel"""

    channel = f"progress:{batch_id}"
    client = _get_redis_client()
    try:
        await client.publish(channel, json.dumps(payload, ensure_ascii=False, default=str))
    finally:
        await client.close()


async def subscribe_batch_events(
    batch_id: str,
    heartbeat_interval_seconds: float = 15.0,
) -> AsyncGenerator[str | None, None]:
    """訂閱批次事件，輸出 JSON 字串；空閒時回傳 None 作為 heartbeat 訊號"""

    channel = f"progress:{batch_id}"
    client = _get_redis_client()
    pubsub = client.pubsub()

    await pubsub.subscribe(channel)
    last_emit_ts = time.monotonic()
    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message.get("type") == "message":
                last_emit_ts = time.monotonic()
                yield message["data"]
            else:
                if heartbeat_interval_seconds > 0 and (time.monotonic() - last_emit_ts) >= heartbeat_interval_seconds:
                    last_emit_ts = time.monotonic()
                    yield None
                # 降低空輪詢 CPU 消耗
                await asyncio.sleep(0.1)
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()
        await client.close()
