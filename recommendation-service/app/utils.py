from __future__ import annotations

from math import exp
from zoneinfo import ZoneInfo

from app.config import TOKYO_TZ_NAME


# 申告時刻・曜日判定はすべて日本時間基準。features.py / training から共有する。
TOKYO_TZ = ZoneInfo(TOKYO_TZ_NAME)


def sigmoid(value: float) -> float:
    """ロジスティック関数。fallback スコアと合成データ生成で共有する。"""
    return 1.0 / (1.0 + exp(-value))


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))
