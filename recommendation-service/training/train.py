from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from app.config import SERVICE_ROOT, get_settings
from app.features import FEATURE_NAMES


@dataclass(frozen=True)
class TrainResult:
    version: str
    train_auc: float | None
    test_auc: float | None
    rows: int
    model_path: Path


def _auc_or_none(y_true: np.ndarray, y_score: np.ndarray) -> float | None:
    if len(set(y_true.tolist())) < 2:
        return None
    return float(roc_auc_score(y_true, y_score))


def _label_from_log(row: dict[str, Any]) -> int | None:
    outcome = row.get("outcome")
    if outcome == "completed":
        return 1
    if outcome == "failed":
        return 0
    chosen = row.get("chosen")
    if chosen is None:
        return None
    return 1 if bool(chosen) else 0


# 後から追加した特徴量が、PR以前に保存された recommendation_logs.features に無い場合の
# 中立補完値。これが無いと旧ログが全件 continue され、新ログが溜まるまで --from-logs 再学習が
# 「20件未満」で失敗し、実ログ学習の継続性が切れる。新特徴量を足すたびにここへ既定値を追加する。
LOG_BACKFILL_DEFAULTS = {"spot_type_score": 0.6}


def dataframe_from_logs() -> pd.DataFrame:
    from app.supabase_client import SupabaseGateway

    gateway = SupabaseGateway(get_settings())
    rows = gateway.fetch_recommendation_logs()
    records: list[dict[str, Any]] = []
    for row in rows:
        features = row.get("features") or {}
        label = _label_from_log(row)
        if label is None:
            continue
        # 新特徴量だけ欠ける旧ログは中立値で補完して残す。他特徴量が欠ける不正ログは除外。
        filled = {**LOG_BACKFILL_DEFAULTS, **features}
        if not all(name in filled for name in FEATURE_NAMES):
            continue
        records.append(
            {
                **{name: float(filled[name]) for name in FEATURE_NAMES},
                "label": label,
            }
        )
    return pd.DataFrame(records, columns=FEATURE_NAMES + ["label"])


def _load_training_dataframe(input_path: Path | None, from_logs: bool) -> pd.DataFrame:
    if from_logs:
        return dataframe_from_logs()
    path = input_path or SERVICE_ROOT / "models" / "synthetic_train.csv"
    return pd.read_csv(path)


def train_dataframe(
    df: pd.DataFrame,
    model_path: Path,
    version_prefix: str,
) -> TrainResult:
    missing = [name for name in FEATURE_NAMES + ["label"] if name not in df.columns]
    if missing:
        raise ValueError(f"Training data is missing columns: {missing}")

    clean = df[FEATURE_NAMES + ["label"]].dropna().copy()
    clean["label"] = clean["label"].astype(int)
    if len(clean) < 20:
        raise ValueError("Need at least 20 labeled rows to train")
    if clean["label"].nunique() < 2:
        raise ValueError("Training labels must contain both positive and negative rows")

    x = clean[FEATURE_NAMES].to_numpy(dtype=float)
    y = clean["label"].to_numpy(dtype=int)
    test_size = 0.25 if len(clean) >= 80 else 0.35
    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=test_size, random_state=58, stratify=y
    )

    gbm = GradientBoostingClassifier(random_state=58)
    gbm.fit(x_train, y_train)

    scaler = StandardScaler()
    x_train_scaled = scaler.fit_transform(x_train)
    logreg = LogisticRegression(max_iter=1000, random_state=58)
    logreg.fit(x_train_scaled, y_train)

    train_scores = gbm.predict_proba(x_train)[:, 1]
    test_scores = gbm.predict_proba(x_test)[:, 1]
    train_auc = _auc_or_none(y_train, train_scores)
    test_auc = _auc_or_none(y_test, test_scores)

    version = f"{version_prefix}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    artifact = {
        "version": version,
        "feature_names": FEATURE_NAMES,
        "gbm": gbm,
        "logreg": logreg,
        "scaler": scaler,
        "train_auc": train_auc,
        "test_auc": test_auc,
        "rows": len(clean),
    }
    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, model_path)

    return TrainResult(
        version=version,
        train_auc=train_auc,
        test_auc=test_auc,
        rows=len(clean),
        model_path=model_path,
    )


def train_from_logs(model_path: Path | None = None) -> TrainResult:
    settings = get_settings()
    return train_dataframe(
        dataframe_from_logs(),
        model_path or settings.model_path,
        version_prefix="logs",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        type=Path,
        default=SERVICE_ROOT / "models" / "synthetic_train.csv",
    )
    parser.add_argument("--from-logs", action="store_true")
    parser.add_argument(
        "--model-path",
        type=Path,
        default=SERVICE_ROOT / "models" / "model.joblib",
    )
    args = parser.parse_args()

    df = _load_training_dataframe(args.input, args.from_logs)
    result = train_dataframe(
        df,
        model_path=args.model_path,
        version_prefix="logs" if args.from_logs else "synthetic",
    )
    train_auc = "n/a" if result.train_auc is None else f"{result.train_auc:.4f}"
    test_auc = "n/a" if result.test_auc is None else f"{result.test_auc:.4f}"
    print(f"rows={result.rows}")
    print(f"train_auc={train_auc}")
    print(f"test_auc={test_auc}")
    print(f"version={result.version}")
    print(f"saved={result.model_path}")


if __name__ == "__main__":
    main()
