from __future__ import annotations

from app.recommendation_service import (
    _capacity_label,
    _format_pickup_window,
    _split_candidates,
)


def _candidate(**overrides):
    base = {
        "user_id": "agent-1",
        "full_name": "Agent One",
        "distance_meters": 100,
        "spot_type": "store",
        "review_status": "approved",
        "is_available_today": True,
        "max_storage_count": 5,
        "current_storage_count": 1,
        "start_time": "09:00:00",
        "end_time": "18:30:00",
    }
    base.update(overrides)
    return base


def test_keeps_approved_available_with_capacity():
    kept, excluded = _split_candidates(
        [_candidate()], allow_individual_spots=True
    )
    assert len(kept) == 1
    assert excluded == []


def test_filter_order_and_reasons():
    candidates = [
        _candidate(user_id="a", review_status="pending"),
        _candidate(user_id="b", is_available_today=False),
        _candidate(user_id="c", current_storage_count=5, max_storage_count=5),
        _candidate(user_id="d", spot_type="individual"),
    ]
    kept, excluded = _split_candidates(candidates, allow_individual_spots=False)

    assert kept == []
    reasons = {e["candidate"]["user_id"]: e["reason"] for e in excluded}
    assert reasons["a"] == "審査未承認のため除外"
    assert reasons["b"] == "本日対応停止のため除外"
    assert reasons["c"] == "空き枠なしのため除外"
    assert reasons["d"] == "個人スポットNG設定のため除外"


def test_first_matching_reason_wins():
    # review_status が先勝ち（is_available_today=False でも審査理由を採用）。
    _, excluded = _split_candidates(
        [_candidate(review_status="pending", is_available_today=False)],
        allow_individual_spots=True,
    )
    assert excluded[0]["reason"] == "審査未承認のため除外"


def test_individual_kept_when_allowed():
    kept, excluded = _split_candidates(
        [_candidate(spot_type="individual")], allow_individual_spots=True
    )
    assert len(kept) == 1
    assert excluded == []


def test_capacity_and_window_labels():
    cand = _candidate(max_storage_count=5, current_storage_count=2)
    assert _capacity_label(cand) == "空き枠 3/5"
    assert _format_pickup_window(cand) == "本日 09:00〜18:30"


def test_window_label_missing_time():
    assert _format_pickup_window(_candidate(start_time=None)) == "受取時間未設定"
    assert _format_pickup_window(_candidate(end_time="")) == "受取時間未設定"
