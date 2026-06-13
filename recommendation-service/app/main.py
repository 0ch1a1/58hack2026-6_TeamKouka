from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException

from app.config import get_settings
from app.features import build_features
from app.model import RecommendationModel, build_reasons
from app.schemas import (
    FeedbackRequest,
    FeedbackResponse,
    HealthResponse,
    RecommendRequest,
    RecommendationItem,
    RecommendResponse,
    RetrainResponse,
)
from app.supabase_client import SupabaseGateway


settings = get_settings()
model = RecommendationModel(settings.model_path)
app = FastAPI(title="ShareKeep Recommendation Service", version="0.1.0")


def _gateway() -> SupabaseGateway:
    try:
        return SupabaseGateway(settings)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _resolve_origin(
    gateway: SupabaseGateway, request: RecommendRequest
) -> tuple[float, float]:
    if request.latitude is not None and request.longitude is not None:
        return request.latitude, request.longitude
    if request.latitude is not None or request.longitude is not None:
        raise HTTPException(
            status_code=422,
            detail="latitude and longitude must be provided together",
        )
    if request.recipient_id is None:
        raise HTTPException(
            status_code=422,
            detail="Provide latitude/longitude or recipient_id",
        )
    try:
        return gateway.get_recipient_coordinates(str(request.recipient_id))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _round_breakdown(values: dict[str, float]) -> dict[str, float]:
    return {key: round(float(value), 6) for key, value in values.items()}


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        ok=True,
        model_version=model.version,
        fallback=model.is_fallback,
        model_path=str(settings.model_path),
    )


@app.post("/recommend", response_model=RecommendResponse)
def recommend(request: RecommendRequest) -> RecommendResponse:
    gateway = _gateway()
    latitude, longitude = _resolve_origin(gateway, request)
    target_at = request.target_at or datetime.now(timezone.utc)

    try:
        candidates = gateway.get_recommendation_candidates(
            latitude=latitude,
            longitude=longitude,
            radius_m=request.radius_m,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Failed to fetch recommendation candidates: {exc}"
        ) from exc

    feature_rows = [
        build_features(candidate, target_at, capacity=settings.default_capacity)
        for candidate in candidates
    ]
    predictions = model.predict(feature_rows)
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
                "model_version": model.version,
            }
        )

    try:
        gateway.insert_recommendation_logs(log_rows)
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Failed to insert recommendation logs: {exc}"
        ) from exc

    recommendations: list[RecommendationItem] = []
    for index, item in enumerate(ranked[: request.top_k], start=1):
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

    return RecommendResponse(
        model_version=model.version,
        generated_at=datetime.now(timezone.utc),
        recommendations=recommendations,
    )


@app.post("/feedback", response_model=FeedbackResponse)
def feedback(request: FeedbackRequest) -> FeedbackResponse:
    gateway = _gateway()
    try:
        gateway.mark_recommendation_chosen(
            parcel_id=str(request.parcel_id), agent_id=str(request.agent_id)
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to save feedback: {exc}") from exc
    return FeedbackResponse(ok=True)


@app.post("/retrain", response_model=RetrainResponse)
def retrain() -> RetrainResponse:
    try:
        from training.train import train_from_logs

        result = train_from_logs(model_path=settings.model_path)
        model.load()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Retraining failed: {exc}") from exc

    return RetrainResponse(
        ok=True,
        model_version=model.version,
        train_auc=result.train_auc,
        test_auc=result.test_auc,
        rows=result.rows,
    )

