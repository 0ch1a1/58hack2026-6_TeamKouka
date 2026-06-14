from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from app.model import RecommendationModel
from app.recommendation_service import (
    RecommendationService,
    _capacity_label,
    _format_pickup_window,
    _split_candidates,
)
from app.schemas import RecommendRequest


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


def test_capacity_label_null_and_negative():
    # max/current いずれか欠落なら "情報なし"。
    assert _capacity_label(_candidate(max_storage_count=5, current_storage_count=None)) == "空き枠 情報なし"
    assert _capacity_label(_candidate(max_storage_count=None, current_storage_count=3)) == "空き枠 情報なし"
    # current > max の不整合でも負値を出さない。
    assert _capacity_label(_candidate(max_storage_count=5, current_storage_count=7)) == "空き枠 0/5"


class _FakeGateway:
    """get_recommendation_candidates を固定で返し、ログ投入行を捕捉するスタブ。"""

    def __init__(self, candidates):
        self._candidates = candidates
        self.logged_rows = None

    def get_recommendation_candidates(self, *, latitude, longitude, radius_m):
        return self._candidates

    def insert_recommendation_logs(self, rows):
        self.logged_rows = rows


def test_excluded_candidates_are_not_logged():
    """PR の核心保証: 除外候補はスコアリングも recommendation_logs への記録もされない。"""
    candidates = [
        _candidate(user_id="keep-1"),
        _candidate(user_id="excl-individual", spot_type="individual"),
        _candidate(user_id="excl-pending", review_status="pending"),
        _candidate(user_id="excl-full", current_storage_count=5, max_storage_count=5),
    ]
    gateway = _FakeGateway(candidates)
    model = RecommendationModel(Path("/nonexistent-model.joblib"))  # fallback ルール
    service = RecommendationService(
        gateway, model, SimpleNamespace(default_capacity=3)
    )

    response = service.recommend(
        RecommendRequest(allow_individual_spots=False),
        latitude=35.0,
        longitude=139.0,
        recipient_id="recipient-1",
        parcel_id="parcel-1",
    )

    # ログに乗るのは kept のみ。除外候補(審査外含む)の id は一切含まれない。
    logged_ids = {row["candidate_agent_id"] for row in gateway.logged_rows}
    assert logged_ids == {"keep-1"}
    # 公開してよい除外(個人NG/満枠)のみ excluded に現れる。
    # 審査外(excl-pending)はモデレーション状態漏洩防止のため非公開。
    excluded_ids = {str(e.agent_id) for e in response.excluded}
    assert excluded_ids == {"excl-individual", "excl-full"}


def test_missing_review_status_is_not_excluded():
    # DB列未適用(review_status欠落)時は除外しない安全側。
    kept, excluded = _split_candidates(
        [{k: v for k, v in _candidate().items() if k != "review_status"}],
        allow_individual_spots=True,
    )
    assert len(kept) == 1
    assert excluded == []
