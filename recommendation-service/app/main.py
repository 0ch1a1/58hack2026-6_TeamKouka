from __future__ import annotations

from fastapi import FastAPI, HTTPException

from app.config import get_settings
from app.model import RecommendationModel
from app.recommendation_service import (
    CandidateFetchError,
    LogPersistError,
    RecommendationService,
)
from app.schemas import (
    FeedbackRequest,
    FeedbackResponse,
    HealthResponse,
    RecommendRequest,
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
    service = RecommendationService(gateway, model, settings)
    try:
        return service.recommend(request, latitude=latitude, longitude=longitude)
    except (CandidateFetchError, LogPersistError) as exc:
        # 下流 (Supabase) 起因の障害は 502 Bad Gateway。
        raise HTTPException(status_code=502, detail=str(exc)) from exc


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

