from __future__ import annotations

from app.cache import TTLCache
from app.ratelimit import TokenBucketRateLimiter


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def test_token_bucket_allows_burst_and_returns_retry_after():
    clock = Clock()
    limiter = TokenBucketRateLimiter(
        rate_per_minute=60, burst=2, time_func=clock
    )

    assert limiter.consume("127.0.0.1") == (True, 0)
    assert limiter.consume("127.0.0.1") == (True, 0)
    assert limiter.consume("127.0.0.1") == (False, 1)

    clock.advance(1)
    assert limiter.consume("127.0.0.1") == (True, 0)


def test_ttl_cache_expires_items():
    clock = Clock()
    cache = TTLCache(ttl_seconds=10, time_func=clock)

    cache.set("key", "value")
    assert cache.get("key") == "value"

    clock.advance(10)
    assert cache.get("key") is None


def test_ttl_cache_evicts_oldest_item():
    clock = Clock()
    cache = TTLCache(ttl_seconds=10, max_size=2, time_func=clock)

    cache.set("first", 1)
    cache.set("second", 2)
    cache.set("third", 3)

    assert cache.get("first") is None
    assert cache.get("second") == 2
    assert cache.get("third") == 3
