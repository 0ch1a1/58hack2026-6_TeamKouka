from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.config import Settings
from app.features import build_features
from app.model import RecommendationModel, build_reasons
from app.schemas import (
    ExcludedSpot,
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


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _exclusion_reason(
    candidate: dict[str, Any], *, allow_individual_spots: bool
) -> str | None:
    """ハードフィルタ。除外なら理由文字列、残すなら None を返す。

    判定は指定の順序で行い、最初に一致した理由のみを採用する。
    """
    if candidate.get("review_status") != "approved":
        return "審査未承認のため除外"
    if candidate.get("is_available_today") is False:
        return "本日対応停止のため除外"
    current = _to_int(candidate.get("current_storage_count"))
    maximum = _to_int(candidate.get("max_storage_count"))
    if current is not None and maximum is not None and current >= maximum:
        return "空き枠なしのため除外"
    if candidate.get("spot_type") == "individual" and not allow_individual_spots:
        return "個人スポットNG設定のため除外"
    return None


def _split_candidates(
    candidates: list[dict[str, Any]], *, allow_individual_spots: bool
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """候補を kept / excluded に分割する。

    excluded には除外理由を付与した辞書 (`candidate` と `reason`) を格納する。
    """
    kept: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    for candidate in candidates:
        reason = _exclusion_reason(
            candidate, allow_individual_spots=allow_individual_spots
        )
        if reason is None:
            kept.append(candidate)
        else:
            excluded.append({"candidate": candidate, "reason": reason})
    return kept, excluded


def _format_pickup_window(candidate: dict[str, Any]) -> str:
    start = _format_hhmm(candidate.get("start_time"))
    end = _format_hhmm(candidate.get("end_time"))
    if start is None or end is None:
        return "受取時間未設定"
    return f"本日 {start}〜{end}"


def _format_hhmm(value: Any) -> str | None:
    """start_time/end_time を HH:MM へ正規化。null/解釈不能なら None。"""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    parts = text.split(":")
    if len(parts) < 2:
        return None
    try:
        hour = int(parts[0])
        minute = int(parts[1])
    except ValueError:
        return None
    return f"{hour:02d}:{minute:02d}"


def _capacity_label(candidate: dict[str, Any]) -> str:
    maximum = _to_int(candidate.get("max_storage_count")) or 0
    current = _to_int(candidate.get("current_storage_count")) or 0
    return f"空き枠 {maximum - current}/{maximum}"


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
        *,
        latitude: float,
        longitude: float,
        recipient_id: str | None,
        parcel_id: str | None,
    ) -> RecommendResponse:
        # recipient_id / parcel_id は呼び出し側 (main.py) で認証トークンを正として
        # 解決済みのものを受け取る。client 申告値をログに焼かないことで詐称を防ぐ。
        target_at = request.target_at or datetime.now(timezone.utc)

        candidates = self._fetch_candidates(latitude, longitude, request.radius_m)
        # 取得後・スコアリング前にハードフィルタを適用。除外候補はスコアリングも
        # recommendation_logs への記録も行わない。
        kept, excluded = _split_candidates(
            candidates, allow_individual_spots=request.allow_individual_spots
        )
        ranked = self._rank_candidates(kept, target_at)
        self._persist_logs(parcel_id, recipient_id, ranked)
        recommendations = self._build_recommendations(ranked, request.top_k)

        return RecommendResponse(
            model_version=self._model.version,
            generated_at=datetime.now(timezone.utc),
            recommendations=recommendations,
            excluded=self._build_excluded(excluded),
            fallback_used=self._model.is_fallback,
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
        self,
        parcel_id: str | None,
        recipient_id: str | None,
        ranked: list[dict[str, Any]],
    ) -> None:
        log_rows: list[dict[str, Any]] = []
        for index, item in enumerate(ranked, start=1):
            candidate = item["candidate"]
            log_rows.append(
                {
                    "parcel_id": parcel_id,
                    "recipient_id": recipient_id,
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
                    spot_type=str(candidate.get("spot_type") or ""),
                    capacity_label=_capacity_label(candidate),
                    pickup_window_label=_format_pickup_window(candidate),
                )
            )
        return recommendations

    def _build_excluded(
        self, excluded: list[dict[str, Any]]
    ) -> list[ExcludedSpot]:
        spots: list[ExcludedSpot] = []
        for entry in excluded:
            candidate = entry["candidate"]
            distance_meters = float(candidate.get("distance_meters") or 0)
            spots.append(
                ExcludedSpot(
                    agent_id=candidate["user_id"],
                    full_name=candidate.get("full_name"),
                    distance_meters=round(distance_meters, 2),
                    reason=entry["reason"],
                )
            )
        return spots
