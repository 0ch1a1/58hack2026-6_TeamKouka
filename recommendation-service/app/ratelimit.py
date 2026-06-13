from __future__ import annotations

import math
import threading
import time
from collections.abc import Callable


class TokenBucketRateLimiter:
    """IP ごとの in-process token bucket。

    外部インフラを使わないため、プロセス再起動や複数 worker 間では共有されない。
    """

    def __init__(
        self,
        *,
        rate_per_minute: int,
        burst: int,
        time_func: Callable[[], float] = time.monotonic,
    ) -> None:
        self.rate_per_minute = max(1, int(rate_per_minute))
        self.burst = max(1, int(burst))
        self._refill_per_second = self.rate_per_minute / 60.0
        self._time_func = time_func
        self._lock = threading.Lock()
        self._buckets: dict[str, tuple[float, float]] = {}

    def consume(self, key: str) -> tuple[bool, int]:
        """1 token 消費し、(許可可否, Retry-After 秒) を返す。"""
        now = self._time_func()
        with self._lock:
            tokens, updated_at = self._buckets.get(key, (float(self.burst), now))
            tokens = self._refill(tokens, updated_at, now)
            if tokens >= 1.0:
                self._buckets[key] = (tokens - 1.0, now)
                return True, 0

            self._buckets[key] = (tokens, now)
            missing = 1.0 - tokens
            retry_after = math.ceil(missing / self._refill_per_second)
            return False, max(1, retry_after)

    def remaining(self, key: str) -> int:
        """現在利用可能な token 数を整数で返す。主にレスポンスヘッダ用。"""
        now = self._time_func()
        with self._lock:
            tokens, updated_at = self._buckets.get(key, (float(self.burst), now))
            tokens = self._refill(tokens, updated_at, now)
            self._buckets[key] = (tokens, now)
            return int(tokens)

    def _refill(self, tokens: float, updated_at: float, now: float) -> float:
        elapsed = max(0.0, now - updated_at)
        return min(float(self.burst), tokens + elapsed * self._refill_per_second)
