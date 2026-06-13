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
    default_radius_m: int = 2000
    default_top_k: int = 5
    default_capacity: int = 3
    timezone: str = "Asia/Tokyo"


def get_settings() -> Settings:
    model_path = Path(
        os.getenv("MODEL_PATH", str(SERVICE_ROOT / "models" / "model.joblib"))
    )
    if not model_path.is_absolute():
        model_path = SERVICE_ROOT / model_path

    return Settings(
        supabase_url=os.getenv("SUPABASE_URL"),
        supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
        model_path=model_path,
        default_radius_m=int(os.getenv("DEFAULT_RADIUS_M", "2000")),
        default_top_k=int(os.getenv("DEFAULT_TOP_K", "5")),
        default_capacity=int(os.getenv("DEFAULT_CAPACITY", "3")),
        timezone=os.getenv("APP_TIMEZONE", "Asia/Tokyo"),
    )
