from __future__ import annotations

import hmac

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

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
from app.supabase_client import SupabaseGateway, verify_user_token


settings = get_settings()
model = RecommendationModel(settings.model_path)
app = FastAPI(title="ShareKeep Recommendation Service", version="0.1.0")

# クライアントは Supabase ログインセッションの access_token を Bearer で送る。
# auto_error=False にし、require_auth に応じて自前で 401 を出し分ける。
_bearer = HTTPBearer(auto_error=False)


def get_authenticated_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str | None:
    """Bearer トークンを検証してユーザ ID を返す。

    - トークンあり: 常に検証（不正なら 401）。
    - トークンなし: require_auth=True なら 401、False（ローカル/デモ）なら匿名 None。
    """
    if credentials is None or not credentials.credentials:
        if settings.require_auth:
            raise HTTPException(
                status_code=401, detail="Authorization bearer token required"
            )
        return None
    try:
        return verify_user_token(settings, credentials.credentials)
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except ConnectionError as exc:
        # Supabase 一時障害は 503（認証失敗 401 と区別する）
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def require_admin(x_admin_key: str | None = Header(default=None, alias="X-Admin-Key")) -> None:
    """/retrain を管理者キーで保護する。"""
    if not settings.admin_api_key:
        raise HTTPException(
            status_code=503, detail="Retraining is disabled (ADMIN_API_KEY not configured)"
        )
    # 定数時間比較でタイミング攻撃を避ける
    if not hmac.compare_digest(x_admin_key or "", settings.admin_api_key):
        raise HTTPException(status_code=403, detail="Invalid admin key")


def _gateway() -> SupabaseGateway:
    try:
        return SupabaseGateway(settings)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


def _assert_parcel_owner(
    gateway: SupabaseGateway, parcel_id: str | None, user_id: str | None
) -> None:
    # 認証ユーザが parcel の所有者でなければ拒否（service_role 経由でも詐称を防ぐ）。
    # 所有者不明（parcel 不在 / recipient_id NULL）は fail closed で弾く。
    if user_id is None or parcel_id is None:
        return
    found, owner = gateway.get_parcel_owner(parcel_id)
    if not found:
        raise HTTPException(status_code=404, detail="parcel not found")
    if owner is None or owner != user_id:
        raise HTTPException(
            status_code=403, detail="parcel does not belong to the authenticated user"
        )


def _resolve_origin(
    gateway: SupabaseGateway, request: RecommendRequest, recipient_id: str | None
) -> tuple[float, float]:
    if request.latitude is not None and request.longitude is not None:
        return request.latitude, request.longitude
    if request.latitude is not None or request.longitude is not None:
        raise HTTPException(
            status_code=422,
            detail="latitude and longitude must be provided together",
        )
    if recipient_id is None:
        raise HTTPException(
            status_code=422,
            detail="Provide latitude/longitude or authenticate",
        )
    try:
        return gateway.get_recipient_coordinates(recipient_id)
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
def recommend(
    request: RecommendRequest,
    user_id: str | None = Depends(get_authenticated_user_id),
) -> RecommendResponse:
    gateway = _gateway()
    # 認証済みなら recipient_id はトークン由来を正とする（クライアント詐称を防ぐ）。
    recipient_id = user_id or (str(request.recipient_id) if request.recipient_id else None)
    parcel_id = str(request.parcel_id) if request.parcel_id else None
    _assert_parcel_owner(gateway, parcel_id, user_id)
    latitude, longitude = _resolve_origin(gateway, request, recipient_id)

    # 取得→特徴化→予測→ランキング→ログ→整形の中核は RecommendationService に委譲。
    # ログに焼く recipient_id / parcel_id は上で解決した authoritative な値を渡す。
    service = RecommendationService(gateway, model, settings)
    try:
        return service.recommend(
            request,
            latitude=latitude,
            longitude=longitude,
            recipient_id=recipient_id,
            parcel_id=parcel_id,
        )
    except (CandidateFetchError, LogPersistError) as exc:
        # 下流 (Supabase) 起因の障害は 502 Bad Gateway。
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/feedback", response_model=FeedbackResponse)
def feedback(
    request: FeedbackRequest,
    user_id: str | None = Depends(get_authenticated_user_id),
) -> FeedbackResponse:
    gateway = _gateway()
    _assert_parcel_owner(gateway, str(request.parcel_id), user_id)
    try:
        gateway.mark_recommendation_chosen(
            parcel_id=str(request.parcel_id), agent_id=str(request.agent_id)
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to save feedback: {exc}") from exc
    return FeedbackResponse(ok=True)


@app.post("/retrain", response_model=RetrainResponse)
def retrain(_: None = Depends(require_admin)) -> RetrainResponse:
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

