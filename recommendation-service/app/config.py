from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - dependency is installed in the service image.
    def load_dotenv(*_args: object, **_kwargs: object) -> bool:
        return False


SERVICE_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(SERVICE_ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    supabase_url: str | None
    supabase_service_role_key: str | None
    model_path: Path
    # 認証まわり（option 2）
    supabase_anon_key: str | None = None   # クライアントの JWT 検証に使う公開鍵
    admin_api_key: str | None = None        # /retrain を保護する管理者キー
    require_auth: bool = True               # /recommend・/feedback に JWT を必須化
    default_radius_m: int = 2000
    default_top_k: int = 5
    default_capacity: int = 3
    timezone: str = "Asia/Tokyo"


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off", ""}


def get_settings() -> Settings:
    model_path = Path(
        os.getenv("MODEL_PATH", str(SERVICE_ROOT / "models" / "model.joblib"))
    )
    if not model_path.is_absolute():
        model_path = SERVICE_ROOT / model_path

    return Settings(
        supabase_url=os.getenv("SUPABASE_URL"),
        supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
        # ANON / PUBLISHABLE どちらの名前でも拾う（アプリ側と同じ公開鍵）
        supabase_anon_key=os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("SUPABASE_PUBLISHABLE_KEY"),
        admin_api_key=os.getenv("ADMIN_API_KEY"),
        require_auth=_env_bool("RECOMMENDATION_REQUIRE_AUTH", True),
        model_path=model_path,
        default_radius_m=int(os.getenv("DEFAULT_RADIUS_M", "2000")),
        default_top_k=int(os.getenv("DEFAULT_TOP_K", "5")),
        default_capacity=int(os.getenv("DEFAULT_CAPACITY", "3")),
        timezone=os.getenv("APP_TIMEZONE", "Asia/Tokyo"),
    )
