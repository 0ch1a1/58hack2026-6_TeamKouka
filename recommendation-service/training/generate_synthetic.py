from __future__ import annotations

import argparse
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from app.config import SERVICE_ROOT
from app.features import FEATURE_NAMES, build_features
from app.utils import TOKYO_TZ, sigmoid


DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _time_string(minutes: int) -> str:
    minutes = minutes % 1440
    return f"{minutes // 60:02d}:{minutes % 60:02d}:00"


def _sample_days(rng: np.random.Generator, now_weekday: int) -> list[str]:
    day_count = int(rng.integers(2, 6))
    days = set(rng.choice(DAY_NAMES, size=day_count, replace=False).tolist())
    if rng.random() < 0.65:
        days.add(DAY_NAMES[now_weekday])
    return sorted(days, key=DAY_NAMES.index)


def _sample_window(rng: np.random.Generator, now_minute: int) -> tuple[str | None, str | None]:
    if rng.random() < 0.08:
        return None, None
    if rng.random() < 0.7:
        center = int(np.clip(rng.normal(now_minute, 180), 0, 1439))
    else:
        center = int(rng.integers(0, 1440))
    length = int(rng.choice([180, 240, 300, 360, 480]))
    start = (center - length // 2) % 1440
    end = (center + length // 2) % 1440
    return _time_string(start), _time_string(end)


def generate(n: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows: list[dict[str, object]] = []
    base = datetime.now(TOKYO_TZ).replace(second=0, microsecond=0)

    for _ in range(n):
        now = base + timedelta(
            days=int(rng.integers(0, 14)), minutes=int(rng.integers(0, 1440))
        )
        now_minute = now.hour * 60 + now.minute
        start_time, end_time = _sample_window(rng, now_minute)
        raw = {
            "distance_meters": float(np.clip(rng.gamma(shape=2.0, scale=450.0), 20, 3000)),
            "available_days": _sample_days(rng, now.weekday()),
            "start_time": start_time,
            "end_time": end_time,
            "level": int(rng.choice([1, 2, 3, 4, 5], p=[0.16, 0.24, 0.28, 0.22, 0.10])),
            "completed_deliveries": int(np.clip(rng.poisson(8), 0, 60)),
            "points": int(np.clip(rng.normal(600, 350), 0, 2500)),
            "active_load": int(rng.choice([0, 1, 2, 3, 4], p=[0.38, 0.30, 0.20, 0.09, 0.03])),
        }
        features = build_features(raw, now, capacity=3)
        utility = (
            0.34 * features["distance_score"]
            + 0.25 * features["time_score"]
            + 0.11 * features["day_match"]
            + 0.14 * features["experience"]
            + 0.08 * features["level_score"]
            + 0.10 * features["capacity_score"]
            + 0.02 * features["is_weekend"] * features["day_match"]
            - 0.03 * features["is_evening"] * (1.0 - features["time_score"])
        )
        probability = sigmoid((utility - 0.56) * 6.5 + float(rng.normal(0, 0.65)))
        label = int(rng.random() < probability)

        rows.append(
            {
                **features,
                "label": label,
                "distance_meters": raw["distance_meters"],
                "level": raw["level"],
                "completed_deliveries": raw["completed_deliveries"],
                "active_load": raw["active_load"],
            }
        )

    columns = FEATURE_NAMES + [
        "label",
        "distance_meters",
        "level",
        "completed_deliveries",
        "active_load",
    ]
    return pd.DataFrame(rows, columns=columns)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=58)
    parser.add_argument(
        "--output",
        type=Path,
        default=SERVICE_ROOT / "models" / "synthetic_train.csv",
    )
    args = parser.parse_args()

    df = generate(n=args.n, seed=args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.output, index=False)
    positive_rate = df["label"].mean()
    print(f"wrote {len(df)} rows to {args.output}")
    print(f"positive_rate={positive_rate:.3f}")


if __name__ == "__main__":
    main()

