from __future__ import annotations

import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from typing import Any


class TTLCache:
    """小さな in-process TTL キャッシュ。"""

    def __init__(
        self,
        *,
        ttl_seconds: int,
        max_size: int = 512,
        time_func: Callable[[], float] = time.monotonic,
    ) -> None:
        self.ttl_seconds = max(0, int(ttl_seconds))
        self.max_size = max(1, int(max_size))
        self._time_func = time_func
        self._lock = threading.Lock()
        self._items: OrderedDict[str, tuple[float, Any]] = OrderedDict()

    def get(self, key: str) -> Any | None:
        now = self._time_func()
        with self._lock:
            item = self._items.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at <= now:
                self._items.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        expires_at = self._time_func() + self.ttl_seconds
        with self._lock:
            self._items[key] = (expires_at, value)
            self._items.move_to_end(key)
            while len(self._items) > self.max_size:
                self._items.popitem(last=False)
