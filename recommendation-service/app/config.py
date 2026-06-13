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


# --- Timezone ---------------------------------------------------------------
# 申告時刻・曜日判定はすべて日本時間を基準にする。
TOKYO_TZ_NAME = "Asia/Tokyo"

# --- Feature scaling constants (app/features.py) ---------------------------
# distance_score を 0-1 に正規化する際の上限距離 (m)。これ以上離れると 0。
DISTANCE_MAX_M = 2000.0
# experience を 0-1 に正規化する際の配達実績の上限件数。
EXPERIENCE_MAX_DELIVERIES = 20.0
# level_score を 0-1 に正規化する際のレベル幅 (level 1..5 → 0..1 なので 4.0)。
LEVEL_SCORE_RANGE = 4.0

# 1 日の総分数 (24h * 60)。時間ウィンドウ計算で全日扱いの境界に使う。
MINUTES_PER_DAY = 1440

# 申告時間外と判定された場合に与える最低 time_score。
TIME_SCORE_OUT_OF_WINDOW = 0.15
# 申告時間内での time_score の下限 (中心から最も離れた端での値)。
TIME_SCORE_WINDOW_FLOOR = 0.5
# 時間ウィンドウ中心からの距離に応じて time_score を減衰させる係数。
TIME_SCORE_CENTER_DECAY = 0.5
# is_evening を 1 とみなす時刻 (分単位, 18:00 以降)。
EVENING_START_MINUTE = 18 * 60
# is_weekend を 1 とみなす weekday の閾値 (土曜=5 以降)。
WEEKEND_WEEKDAY_THRESHOLD = 5

# --- Fallback scoring constants (app/model.py) -----------------------------
# fallback ルールスコアの sigmoid 中心 (重み付き和からこの値を引く)。
FALLBACK_SCORE_BIAS = 0.5
# fallback ルールスコアの sigmoid 傾き。
FALLBACK_SCORE_SCALE = 4.0


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
