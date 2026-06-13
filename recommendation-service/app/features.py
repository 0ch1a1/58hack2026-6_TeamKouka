from __future__ import annotations

from datetime import datetime, time
from typing import Any
from zoneinfo import ZoneInfo


TOKYO_TZ = ZoneInfo("Asia/Tokyo")
DISTANCE_MAX_M = 2000.0
EXPERIENCE_MAX_DELIVERIES = 20.0

FEATURE_NAMES = [
    "distance_score",
    "time_score",
    "day_match",
    "experience",
    "level_score",
    "capacity_score",
    "is_weekend",
    "is_evening",
]

DAY_ALIASES = {
    "mon": 0,
    "monday": 0,
    "月": 0,
    "月曜": 0,
    "月曜日": 0,
    "1": 0,
    "tue": 1,
    "tues": 1,
    "tuesday": 1,
    "火": 1,
    "火曜": 1,
    "火曜日": 1,
    "2": 1,
    "wed": 2,
    "wednesday": 2,
    "水": 2,
    "水曜": 2,
    "水曜日": 2,
    "3": 2,
    "thu": 3,
    "thur": 3,
    "thurs": 3,
    "thursday": 3,
    "木": 3,
    "木曜": 3,
    "木曜日": 3,
    "4": 3,
    "fri": 4,
    "friday": 4,
    "金": 4,
    "金曜": 4,
    "金曜日": 4,
    "5": 4,
    "sat": 5,
    "saturday": 5,
    "土": 5,
    "土曜": 5,
    "土曜日": 5,
    "6": 5,
    "sun": 6,
    "sunday": 6,
    "日": 6,
    "日曜": 6,
    "日曜日": 6,
    "0": 6,
    "7": 6,
}


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _get(raw: Any, key: str, default: Any = None) -> Any:
    if isinstance(raw, dict):
        return raw.get(key, default)
    return getattr(raw, key, default)


def _as_tokyo_datetime(value: datetime | str | None) -> datetime:
    if value is None:
        return datetime.now(TOKYO_TZ)
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        return value.replace(tzinfo=TOKYO_TZ)
    return value.astimezone(TOKYO_TZ)


def _parse_time(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, time):
        return value.hour * 60 + value.minute
    if isinstance(value, datetime):
        local = _as_tokyo_datetime(value)
        return local.hour * 60 + local.minute
    if isinstance(value, str):
        if not value.strip():
            return None
        parts = value.split(":")
        if len(parts) < 2:
            return None
        hour = int(parts[0])
        minute = int(parts[1])
        return int(clamp(hour * 60 + minute, 0, 1439))
    return None


def _minutes_in_window(now_minute: int, start: int, end: int) -> tuple[bool, int]:
    if start == end:
        return True, 1440
    if start < end:
        return start <= now_minute <= end, end - start
    return now_minute >= start or now_minute <= end, (1440 - start) + end


def _position_in_window(now_minute: int, start: int, end: int) -> int:
    if start <= end:
        return now_minute - start
    if now_minute >= start:
        return now_minute - start
    return (1440 - start) + now_minute


def calculate_time_score(start_time: Any, end_time: Any, now: datetime) -> float:
    start = _parse_time(start_time)
    end = _parse_time(end_time)
    if start is None or end is None:
        return 1.0

    now_minute = now.hour * 60 + now.minute
    in_window, length = _minutes_in_window(now_minute, start, end)
    if not in_window:
        return 0.15
    if length <= 0 or length >= 1440:
        return 1.0

    position = _position_in_window(now_minute, start, end)
    center = length / 2.0
    distance_from_center = abs(position - center)
    return clamp(1.0 - 0.5 * (distance_from_center / center), 0.5, 1.0)


def _day_tokens(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        tokens: list[str] = []
        for chunk in value.replace("、", ",").replace("/", ",").split(","):
            token = chunk.strip()
            if token:
                tokens.append(token)
        return tokens
    if isinstance(value, (list, tuple, set)):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value).strip()]


def normalize_weekdays(value: Any) -> set[int]:
    weekdays: set[int] = set()
    for token in _day_tokens(value):
        normalized = token.strip().lower()
        normalized = normalized.replace(".", "")
        if normalized in DAY_ALIASES:
            weekdays.add(DAY_ALIASES[normalized])
    return weekdays


def calculate_day_match(available_days: Any, now: datetime) -> float:
    weekdays = normalize_weekdays(available_days)
    if not weekdays:
        return 1.0
    return 1.0 if now.weekday() in weekdays else 0.0


def build_features(
    raw: dict[str, Any] | Any,
    now: datetime | str | None,
    capacity: int = 3,
) -> dict[str, float]:
    """Convert raw candidate data into the shared 0-1 feature vector."""

    local_now = _as_tokyo_datetime(now)
    distance_meters = float(_get(raw, "distance_meters", 0) or 0)
    completed_deliveries = float(_get(raw, "completed_deliveries", 0) or 0)
    level = float(_get(raw, "level", 1) or 1)
    active_load = float(_get(raw, "active_load", 0) or 0)
    safe_capacity = max(float(capacity), 1.0)

    now_minute = local_now.hour * 60 + local_now.minute

    features = {
        "distance_score": clamp(1.0 - distance_meters / DISTANCE_MAX_M),
        "time_score": calculate_time_score(
            _get(raw, "start_time"), _get(raw, "end_time"), local_now
        ),
        "day_match": calculate_day_match(_get(raw, "available_days"), local_now),
        "experience": clamp(completed_deliveries / EXPERIENCE_MAX_DELIVERIES),
        "level_score": clamp((level - 1.0) / 4.0),
        "capacity_score": clamp(1.0 - active_load / safe_capacity),
        "is_weekend": 1.0 if local_now.weekday() >= 5 else 0.0,
        "is_evening": 1.0 if now_minute >= 18 * 60 else 0.0,
    }
    return {name: float(features[name]) for name in FEATURE_NAMES}


def features_to_row(features: dict[str, float]) -> list[float]:
    return [float(features[name]) for name in FEATURE_NAMES]
