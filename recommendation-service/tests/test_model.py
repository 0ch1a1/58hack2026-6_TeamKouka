from __future__ import annotations

import math

import pytest

from app.config import FALLBACK_SCORE_BIAS, FALLBACK_SCORE_SCALE
from app.features import FEATURE_NAMES
from app.model import FALLBACK_WEIGHTS, RecommendationModel, build_reasons
from app.utils import sigmoid


# --- sigmoid ----------------------------------------------------------------


def test_sigmoid_zero_is_half():
    assert sigmoid(0.0) == pytest.approx(0.5)


def test_sigmoid_monotonic_and_bounded():
    assert sigmoid(-10) < sigmoid(0) < sigmoid(10)
    assert 0.0 < sigmoid(-50) < 0.01
    assert 0.99 < sigmoid(50) <= 1.0


def test_sigmoid_matches_reference():
    assert sigmoid(2.0) == pytest.approx(1.0 / (1.0 + math.exp(-2.0)))


# --- fallback predict -------------------------------------------------------


def _features(**overrides: float) -> dict[str, float]:
    base = {name: 0.0 for name in FEATURE_NAMES}
    base.update(overrides)
    return base


def _fallback_model(tmp_path) -> RecommendationModel:
    # 存在しないパスを渡すと fallback モードになる。
    return RecommendationModel(tmp_path / "does_not_exist.joblib")


def test_model_uses_fallback_when_no_artifact(tmp_path):
    model = _fallback_model(tmp_path)
    assert model.is_fallback is True
    assert model.version == "fallback-rules-v1"


def test_fallback_predict_empty_returns_empty(tmp_path):
    model = _fallback_model(tmp_path)
    assert model.predict([]) == []


def test_fallback_predict_matches_manual_computation(tmp_path):
    model = _fallback_model(tmp_path)
    features = _features(distance_score=1.0, time_score=1.0)
    [prediction] = model.predict([features])

    contributions = {
        name: FALLBACK_WEIGHTS[name] * features[name] for name in FEATURE_NAMES
    }
    weighted_sum = sum(contributions.values())
    expected = sigmoid((weighted_sum - FALLBACK_SCORE_BIAS) * FALLBACK_SCORE_SCALE)

    assert prediction.score == pytest.approx(expected)
    assert prediction.breakdown == pytest.approx(contributions)


def test_fallback_predict_all_zero_features(tmp_path):
    model = _fallback_model(tmp_path)
    [prediction] = model.predict([_features()])
    # weighted_sum=0 → sigmoid((0 - bias) * scale)
    expected = sigmoid((0.0 - FALLBACK_SCORE_BIAS) * FALLBACK_SCORE_SCALE)
    assert prediction.score == pytest.approx(expected)


def test_fallback_score_is_within_unit_interval(tmp_path):
    model = _fallback_model(tmp_path)
    [prediction] = model.predict([_features(**{n: 1.0 for n in FEATURE_NAMES})])
    assert 0.0 <= prediction.score <= 1.0


# --- build_reasons ----------------------------------------------------------


def test_build_reasons_includes_distance_with_meters():
    features = _features(distance_score=1.0)
    breakdown = _features(distance_score=0.3)
    reasons = build_reasons(features, breakdown, distance_meters=120)
    assert any("120m" in r for r in reasons)


def test_build_reasons_fallback_message_when_no_positive():
    reasons = build_reasons(_features(), _features())
    assert reasons == ["候補圏内の代理人です"]


def test_build_reasons_respects_limit():
    features = _features(**{n: 1.0 for n in FEATURE_NAMES})
    breakdown = _features(**{n: 1.0 for n in FEATURE_NAMES})
    reasons = build_reasons(features, breakdown, limit=2)
    assert len(reasons) == 2
