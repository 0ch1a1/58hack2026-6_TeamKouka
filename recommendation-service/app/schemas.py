from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RecommendRequest(BaseModel):
    parcel_id: UUID | None = None
    recipient_id: UUID | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    radius_m: int = Field(default=2000, ge=1, le=20000)
    top_k: int = Field(default=5, ge=1, le=50)
    target_at: datetime | None = None


class RecommendationItem(BaseModel):
    agent_id: UUID | str
    full_name: str | None = None
    rank: int
    score: float
    distance_meters: float
    breakdown: dict[str, float]
    reasons: list[str]


class RecommendResponse(BaseModel):
    # `model_version` は pydantic v2 の保護名前空間 `model_` と衝突するため抑止。
    model_config = ConfigDict(protected_namespaces=())

    model_version: str
    generated_at: datetime
    recommendations: list[RecommendationItem]


class FeedbackRequest(BaseModel):
    parcel_id: UUID
    agent_id: UUID


class FeedbackResponse(BaseModel):
    ok: bool


class RetrainResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    ok: bool
    model_version: str
    train_auc: float | None = None
    test_auc: float | None = None
    rows: int


class HealthResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    ok: bool
    model_version: str
    fallback: bool
    model_path: str


class ErrorDetail(BaseModel):
    detail: str
    context: dict[str, Any] | None = None

