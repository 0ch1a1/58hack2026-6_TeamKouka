from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from app.config import FALLBACK_SCORE_BIAS, FALLBACK_SCORE_SCALE
from app.features import FEATURE_NAMES, features_to_row
from app.utils import sigmoid


FALLBACK_WEIGHTS = {
    "distance_score": 0.30,
    "time_score": 0.25,
    "day_match": 0.10,
    "experience": 0.15,
    "level_score": 0.10,
    "capacity_score": 0.10,
    "is_weekend": 0.00,
    "is_evening": 0.00,
    "rating_score": 0.12,
}

REASON_LABELS = {
    "distance_score": "距離が近い",
    "time_score": "申告された対応時間に合っている",
    "day_match": "対応曜日に一致している",
    "experience": "配達実績が多い",
    "level_score": "代理人レベルが高い",
    "capacity_score": "現在の保管負荷が低い",
    "is_weekend": "週末の文脈に合っている",
    "is_evening": "夕方以降の文脈に合っている",
    "rating_score": "受取人からの評価が高い",
}


@dataclass(frozen=True)
class Prediction:
    score: float
    breakdown: dict[str, float]


# 後方互換のためのエイリアス (旧 `app.model._sigmoid` 参照を維持)。
_sigmoid = sigmoid


class RecommendationModel:
    def __init__(self, model_path: str | Path):
        self.model_path = Path(model_path)
        self.artifact: dict[str, Any] | None = None
        self.feature_names = FEATURE_NAMES
        self.version = "fallback-rules-v1"
        self.is_fallback = True
        self.load()

    def load(self) -> None:
        if not self.model_path.exists():
            self.artifact = None
            self.feature_names = FEATURE_NAMES
            self.version = "fallback-rules-v1"
            self.is_fallback = True
            return

        artifact = joblib.load(self.model_path)
        feature_names = artifact.get("feature_names") or artifact.get("features")
        if feature_names != FEATURE_NAMES:
            raise ValueError(
                f"Model feature order mismatch: expected {FEATURE_NAMES}, got {feature_names}"
            )
        self.artifact = artifact
        self.feature_names = feature_names
        self.version = artifact.get("version", "model-unknown")
        self.is_fallback = False

    def _fallback_predict(self, feature_dicts: list[dict[str, float]]) -> list[Prediction]:
        predictions: list[Prediction] = []
        for features in feature_dicts:
            contributions = {
                name: FALLBACK_WEIGHTS[name] * float(features[name])
                for name in FEATURE_NAMES
            }
            weighted_sum = sum(contributions.values())
            score = sigmoid((weighted_sum - FALLBACK_SCORE_BIAS) * FALLBACK_SCORE_SCALE)
            predictions.append(
                Prediction(
                    score=float(score),
                    breakdown={name: float(contributions[name]) for name in FEATURE_NAMES},
                )
            )
        return predictions

    def predict(self, feature_dicts: list[dict[str, float]]) -> list[Prediction]:
        if not feature_dicts:
            return []
        if self.artifact is None:
            return self._fallback_predict(feature_dicts)

        matrix = np.array([features_to_row(features) for features in feature_dicts])
        gbm = self.artifact["gbm"]
        scores = gbm.predict_proba(matrix)[:, 1]

        scaler = self.artifact.get("scaler")
        logreg = self.artifact.get("logreg")
        if scaler is not None and logreg is not None:
            scaled = scaler.transform(matrix)
            coefficients = logreg.coef_[0]
            breakdown_matrix = scaled * coefficients
        else:
            breakdown_matrix = np.zeros_like(matrix, dtype=float)

        predictions: list[Prediction] = []
        for score, row in zip(scores, breakdown_matrix, strict=True):
            predictions.append(
                Prediction(
                    score=float(score),
                    breakdown={
                        name: float(value)
                        for name, value in zip(FEATURE_NAMES, row, strict=True)
                    },
                )
            )
        return predictions


def build_reasons(
    features: dict[str, float],
    breakdown: dict[str, float],
    distance_meters: float | None = None,
    limit: int = 3,
) -> list[str]:
    positive_names = [
        name
        for name, _ in sorted(
            breakdown.items(), key=lambda item: item[1], reverse=True
        )
        if features.get(name, 0.0) > 0.5 and breakdown.get(name, 0.0) > 0
    ]

    reasons: list[str] = []
    for name in positive_names:
        if name == "distance_score" and distance_meters is not None:
            reasons.append(f"距離が近い({distance_meters:.0f}m)")
        else:
            reasons.append(REASON_LABELS.get(name, name))
        if len(reasons) >= limit:
            break

    if not reasons:
        reasons.append("候補圏内の代理人です")
    return reasons

