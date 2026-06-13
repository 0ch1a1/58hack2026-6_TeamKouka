from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.config import Settings
from app.features import build_features
from app.model import RecommendationModel, build_reasons
from app.schemas import (
    RecommendationItem,
    RecommendRequest,
    RecommendResponse,
)
from app.supabase_client import SupabaseGateway


class CandidateFetchError(RuntimeError):
    """推薦候補の取得に失敗した (下流 DB/RPC エラー)。"""


class LogPersistError(RuntimeError):
    """推薦ログの保存に失敗した (下流 DB エラー)。"""


def _round_breakdown(values: dict[str, float]) -> dict[str, float]:
    return {key: round(float(value), 6) for key, value in values.items()}


class RecommendationService:
    """/recommend の中核ロジック (取得→特徴化→予測→ランキング→整形→ログ)。

    エンドポイント関数を薄く保つため、HTTP に依存しない純粋なロジックをここへ集約する。
    下流エラーは専用例外 (CandidateFetchError / LogPersistError) に変換して送出し、
    HTTP ステータスへのマッピングは呼び出し側 (main.py) が行う。
    """

    def __init__(
        self,
        gateway: SupabaseGateway,
        model: RecommendationModel,
        settings: Settings,
    ) -> None:
        self._gateway = gateway
        self._model = model
        self._settings = settings

    def recommend(
        self,
        request: RecommendRequest,
        latitude: float,
        longitude: float,
    ) -> RecommendResponse:
        target_at = request.target_at or datetime.now(timezone.utc)

        candidates = self._fetch_candidates(latitude, longitude, request.radius_m)
        ranked = self._rank_candidates(candidates, target_at)
        self._persist_logs(request, ranked)
        recommendations = self._build_recommendations(ranked, request.top_k)

        return RecommendResponse(
            model_version=self._model.version,
            generated_at=datetime.now(timezone.utc),
            recommendations=recommendations,
        )

    def _fetch_candidates(
        self, latitude: float, longitude: float, radius_m: int
    ) -> list[dict[str, Any]]:
        try:
            return self._gateway.get_recommendation_candidates(
                latitude=latitude,
                longitude=longitude,
                radius_m=radius_m,
            )
        except Exception as exc:  # 下流 (Supabase/RPC) 起因の障害を集約。
            raise CandidateFetchError(
                f"Failed to fetch recommendation candidates: {exc}"
            ) from exc

    def _rank_candidates(
        self, candidates: list[dict[str, Any]], target_at: datetime
    ) -> list[dict[str, Any]]:
        feature_rows = [
            build_features(
                candidate, target_at, capacity=self._settings.default_capacity
            )
            for candidate in candidates
        ]
        predictions = self._model.predict(feature_rows)
        ranked: list[dict[str, Any]] = []
        for candidate, features, prediction in zip(
            candidates, feature_rows, predictions, strict=True
        ):
            ranked.append(
                {
                    "candidate": candidate,
                    "features": features,
                    "score": prediction.score,
                    "breakdown": prediction.breakdown,
                }
            )
        ranked.sort(key=lambda item: item["score"], reverse=True)
        return ranked

    def _persist_logs(
        self, request: RecommendRequest, ranked: list[dict[str, Any]]
    ) -> None:
        log_rows: list[dict[str, Any]] = []
        for index, item in enumerate(ranked, start=1):
            candidate = item["candidate"]
            log_rows.append(
                {
                    "parcel_id": str(request.parcel_id) if request.parcel_id else None,
                    "recipient_id": str(request.recipient_id)
                    if request.recipient_id
                    else None,
                    "candidate_agent_id": str(candidate["user_id"]),
                    "features": item["features"],
                    "score": float(item["score"]),
                    "rank": index,
                    "model_version": self._model.version,
                }
            )
        try:
            self._gateway.insert_recommendation_logs(log_rows)
        except Exception as exc:  # 下流 (Supabase) 起因の障害を集約。
            raise LogPersistError(
                f"Failed to insert recommendation logs: {exc}"
            ) from exc

    def _build_recommendations(
        self, ranked: list[dict[str, Any]], top_k: int
    ) -> list[RecommendationItem]:
        recommendations: list[RecommendationItem] = []
        for index, item in enumerate(ranked[:top_k], start=1):
            candidate = item["candidate"]
            distance_meters = float(candidate.get("distance_meters") or 0)
            recommendations.append(
                RecommendationItem(
                    agent_id=candidate["user_id"],
                    full_name=candidate.get("full_name"),
                    rank=index,
                    score=round(float(item["score"]), 6),
                    distance_meters=round(distance_meters, 2),
                    breakdown=_round_breakdown(item["breakdown"]),
                    reasons=build_reasons(
                        item["features"],
                        item["breakdown"],
                        distance_meters=distance_meters,
                    ),
                )
            )
        return recommendations
