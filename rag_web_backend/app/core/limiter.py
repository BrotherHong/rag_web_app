"""Rate limiter 設定"""

from slowapi import Limiter
from fastapi import Request


def _get_client_ip(request: Request) -> str:
    """取得真實 client IP（處理 nginx 反向代理）"""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_get_client_ip)
