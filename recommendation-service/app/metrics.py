from __future__ import annotations

import threading


_COUNTER_NAMES = (
    "recommendation_requests_total",
    "recommendation_cache_hits_total",
    "recommendation_cache_misses_total",
    "recommendation_rate_limited_total",
)


class Metrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters = {name: 0 for name in _COUNTER_NAMES}

    def increment(self, name: str) -> None:
        if name not in self._counters:
            raise KeyError(f"unknown metric: {name}")
        with self._lock:
            self._counters[name] += 1

    def render(self) -> str:
        with self._lock:
            snapshot = dict(self._counters)

        lines: list[str] = []
        for name in _COUNTER_NAMES:
            lines.append(f"# TYPE {name} counter")
            lines.append(f"{name} {snapshot[name]}")
        return "\n".join(lines) + "\n"


metrics = Metrics()


def increment_requests() -> None:
    metrics.increment("recommendation_requests_total")


def increment_cache_hits() -> None:
    metrics.increment("recommendation_cache_hits_total")


def increment_cache_misses() -> None:
    metrics.increment("recommendation_cache_misses_total")


def increment_rate_limited() -> None:
    metrics.increment("recommendation_rate_limited_total")


def render_prometheus() -> str:
    return metrics.render()
