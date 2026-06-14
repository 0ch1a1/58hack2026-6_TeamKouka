from __future__ import annotations

from datetime import datetime

import pytest

from app.config import (
    MINUTES_PER_DAY,
    TIME_SCORE_OUT_OF_WINDOW,
    TIME_SCORE_WINDOW_FLOOR,
)
from app.features import (
    FEATURE_NAMES,
    _minutes_in_window,
    _parse_time,
    _position_in_window,
    build_features,
    calculate_day_match,
    calculate_rating_score,
    calculate_spot_type_score,
    calculate_time_score,
    normalize_weekdays,
)
from app.utils import TOKYO_TZ


def _now(hour: int, minute: int = 0, *, day: int = 14) -> datetime:
    # 2024-01-14 は日曜日。day を変えると曜日も変わる。
    return datetime(2024, 1, day, hour, minute, tzinfo=TOKYO_TZ)


# --- _parse_time ------------------------------------------------------------


def test_parse_time_from_string():
    assert _parse_time("09:30") == 9 * 60 + 30
    assert _parse_time("00:00") == 0
    assert _parse_time("23:59") == 23 * 60 + 59


def test_parse_time_clamps_to_last_minute_of_day():
    # 25:00 のような値は 1 日の最終分にクランプされる。
    assert _parse_time("25:00") == MINUTES_PER_DAY - 1


def test_parse_time_invalid_returns_none():
    assert _parse_time(None) is None
    assert _parse_time("") is None
    assert _parse_time("930") is None


# --- _minutes_in_window (境界条件) -----------------------------------------


def test_window_start_equals_end_is_full_day():
    in_window, length = _minutes_in_window(now_minute=600, start=480, end=480)
    assert in_window is True
    assert length == MINUTES_PER_DAY


def test_window_normal_inclusive_boundaries():
    # start=540(09:00) end=600(10:00) の両端は内側扱い。
    assert _minutes_in_window(540, 540, 600) == (True, 60)
    assert _minutes_in_window(600, 540, 600) == (True, 60)
    assert _minutes_in_window(539, 540, 600)[0] is False
    assert _minutes_in_window(601, 540, 600)[0] is False


def test_window_wrapping_overnight():
    # 22:00(1320) - 02:00(120) をまたぐ。
    in_window, length = _minutes_in_window(now_minute=30, start=1320, end=120)
    assert in_window is True
    assert length == (MINUTES_PER_DAY - 1320) + 120
    assert _minutes_in_window(1400, 1320, 120)[0] is True
    assert _minutes_in_window(600, 1320, 120)[0] is False


# --- _position_in_window ----------------------------------------------------


def test_position_in_window_normal():
    assert _position_in_window(600, 540, 660) == 60


def test_position_in_window_wrapping():
    # overnight window: now の前半 (start 以降) と後半 (end 以下) の両方。
    assert _position_in_window(1400, 1320, 120) == 80
    assert _position_in_window(30, 1320, 120) == (MINUTES_PER_DAY - 1320) + 30


# --- calculate_time_score ---------------------------------------------------


def test_time_score_missing_times_returns_one():
    assert calculate_time_score(None, None, _now(12)) == 1.0
    assert calculate_time_score("09:00", None, _now(12)) == 1.0


def test_time_score_out_of_window():
    # 09:00-10:00 の窓に対し 12:00 は窓外。
    assert calculate_time_score("09:00", "10:00", _now(12)) == TIME_SCORE_OUT_OF_WINDOW


def test_time_score_full_day_window_returns_one():
    # start == end は全日扱いで length>=MINUTES_PER_DAY → 1.0。
    assert calculate_time_score("08:00", "08:00", _now(15)) == 1.0


def test_time_score_center_is_max():
    # 08:00-12:00 の中心は 10:00。中心では 1.0。
    assert calculate_time_score("08:00", "12:00", _now(10)) == pytest.approx(1.0)


def test_time_score_edge_hits_floor():
    # 窓の端 (距離が中心からの最大) では floor。
    score = calculate_time_score("08:00", "12:00", _now(8))
    assert score == pytest.approx(TIME_SCORE_WINDOW_FLOOR)


# --- normalize_weekdays / day_match ----------------------------------------


def test_normalize_weekdays_english_and_japanese():
    assert normalize_weekdays("Mon") == {0}
    assert normalize_weekdays("月") == {0}
    assert normalize_weekdays("月曜日") == {0}
    assert normalize_weekdays("Sun") == {6}


def test_normalize_weekdays_numeric_aliases():
    # "0" と "7" は日曜(6)、"1" は月曜(0) にマップ。
    assert normalize_weekdays("0") == {6}
    assert normalize_weekdays("7") == {6}
    assert normalize_weekdays("1") == {0}


def test_normalize_weekdays_separators_and_list():
    assert normalize_weekdays("Mon, Tue/Wed、Thu") == {0, 1, 2, 3}
    assert normalize_weekdays(["Fri", "Sat"]) == {4, 5}


def test_normalize_weekdays_dot_and_case():
    assert normalize_weekdays("MON.") == {0}
    assert normalize_weekdays("unknown") == set()


def test_day_match_empty_returns_one():
    assert calculate_day_match(None, _now(12)) == 1.0
    assert calculate_day_match([], _now(12)) == 1.0


def test_day_match_hit_and_miss():
    # 2024-01-15 は月曜日。
    monday = _now(12, day=15)
    assert calculate_day_match("Mon", monday) == 1.0
    assert calculate_day_match("Tue", monday) == 0.0


# --- rating_score -----------------------------------------------------------


def test_rating_score_normalizes_1_to_5_into_0_to_1():
    assert calculate_rating_score(1.0) == pytest.approx(0.0)
    assert calculate_rating_score(3.0) == pytest.approx(0.5)
    assert calculate_rating_score(5.0) == pytest.approx(1.0)


def test_rating_score_clamps_out_of_range():
    assert calculate_rating_score(0.0) == pytest.approx(0.0)
    assert calculate_rating_score(6.0) == pytest.approx(1.0)


def test_rating_score_none_or_invalid_is_neutral():
    assert calculate_rating_score(None) == pytest.approx(0.5)
    assert calculate_rating_score("bad") == pytest.approx(0.5)


def test_rating_score_in_feature_names_and_build_features():
    assert "rating_score" in FEATURE_NAMES
    # avg_rating 未取得でも壊れず中立値 0.5。
    features = build_features({"distance_meters": 100}, _now(12))
    assert features["rating_score"] == pytest.approx(0.5)
    # avg_rating=5 → 1.0。
    features = build_features({"distance_meters": 100, "avg_rating": 5.0}, _now(12))
    assert features["rating_score"] == pytest.approx(1.0)


# --- spot_type_score --------------------------------------------------------


def test_spot_type_score_known_values():
    assert calculate_spot_type_score("store") == pytest.approx(1.0)
    assert calculate_spot_type_score("manager_room") == pytest.approx(0.7)
    assert calculate_spot_type_score("facility") == pytest.approx(0.6)
    assert calculate_spot_type_score("individual") == pytest.approx(0.3)


def test_spot_type_score_none_and_unknown_default():
    assert calculate_spot_type_score(None) == pytest.approx(0.6)
    assert calculate_spot_type_score("warehouse") == pytest.approx(0.6)
    assert calculate_spot_type_score("") == pytest.approx(0.6)


def test_feature_names_has_spot_type_score_last():
    assert len(FEATURE_NAMES) == 10
    assert FEATURE_NAMES[-1] == "spot_type_score"
    # rating_score の直後に来る。
    assert FEATURE_NAMES[-2] == "rating_score"


def test_spot_type_score_in_build_features():
    # spot_type=store → 1.0。
    features = build_features({"distance_meters": 100, "spot_type": "store"}, _now(12))
    assert features["spot_type_score"] == pytest.approx(1.0)
    # spot_type 未取得でも壊れず既定値 0.6。
    features = build_features({"distance_meters": 100}, _now(12))
    assert features["spot_type_score"] == pytest.approx(0.6)
