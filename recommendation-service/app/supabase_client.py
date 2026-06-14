from __future__ import annotations

import re
from functools import lru_cache
from typing import Any

import httpx
from supabase import Client, create_client

from app.config import Settings


@lru_cache(maxsize=4)
def _auth_client(url: str, key: str) -> Client:
    # トークン検証用の軽量クライアント（公開鍵で作成）。リクエストごとの再生成を避ける。
    return create_client(url, key)


def verify_user_token(settings: Settings, token: str) -> str:
    """Supabase にトークンの有効性を問い合わせ、ユーザ ID を返す。

    - 無効・期限切れトークン: PermissionError（呼び出し側で 401）
    - 設定不足: ValueError（500）
    - Supabase 到達不能・タイムアウト等の一時障害: ConnectionError（503）
      ＝認証失敗とサービス障害を取り違えない（正当なユーザを誤って弾かない）。
    """
    key = settings.supabase_anon_key or settings.supabase_service_role_key
    if not settings.supabase_url or not key:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_ANON_KEY are required to verify auth tokens"
        )
    client = _auth_client(settings.supabase_url, key)
    try:
        response = client.auth.get_user(token)
    except httpx.HTTPError as exc:  # ネットワーク/到達不能/タイムアウト = 一時障害
        raise ConnectionError("Auth service unreachable") from exc
    except Exception as exc:  # それ以外（トークン不正など）は認証失敗扱い
        raise PermissionError("Invalid or expired token") from exc

    user = getattr(response, "user", None)
    user_id = getattr(user, "id", None) if user is not None else None
    if not user_id:
        raise PermissionError("Invalid or expired token")
    return str(user_id)


class SupabaseGateway:
    def __init__(self, settings: Settings):
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for DB access"
            )
        self.client: Client = create_client(
            settings.supabase_url, settings.supabase_service_role_key
        )

    def get_recommendation_candidates(
        self,
        latitude: float,
        longitude: float,
        radius_m: int = 2000,
    ) -> list[dict[str, Any]]:
        response = self.client.rpc(
            "get_recommendation_candidates",
            {
                "p_lat": latitude,
                "p_lng": longitude,
                "p_radius_m": radius_m,
            },
        ).execute()
        # RPC の返す行をそのまま素通し（明示マッピングしない）ため、RPC 側で追加された
        # spot_type / max_storage_count / current_storage_count / is_available_today /
        # review_status を含むすべての列がそのまま各候補 dict に流れる。
        return list(response.data or [])

    def get_recipient_coordinates(self, recipient_id: str) -> tuple[float, float]:
        try:
            response = self.client.rpc(
                "get_recipient_coordinates", {"p_recipient_id": recipient_id}
            ).execute()
            data = response.data
            row = data[0] if isinstance(data, list) and data else data
            coords = _extract_coordinates(row)
            if coords:
                return coords
        except Exception:
            pass

        response = (
            self.client.table("recipient_profiles")
            .select("user_id,address,address_detail,location")
            .eq("user_id", recipient_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        row = rows[0] if rows else None
        coords = _extract_coordinates(row)
        if coords:
            return coords

        raise LookupError(
            "recipient_profiles location could not be resolved. "
            "Pass latitude/longitude or add a get_recipient_coordinates RPC "
            "that returns ST_Y(location::geometry) as lat and ST_X(location::geometry) as lng."
        )

    def get_parcel_owner(self, parcel_id: str) -> tuple[bool, str | None]:
        # parcel の所有者（受取人）を (見つかったか, recipient_id) で返す。
        # 「不在」と「recipient_id が NULL」を呼び出し側で区別できるようにする（fail closed のため）。
        response = (
            self.client.table("parcels")
            .select("recipient_id")
            .eq("id", parcel_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if not rows:
            return False, None
        recipient_id = rows[0].get("recipient_id")
        return True, (str(recipient_id) if recipient_id is not None else None)

    def insert_recommendation_logs(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        self.client.table("recommendation_logs").insert(rows).execute()

    def mark_recommendation_chosen(self, parcel_id: str, agent_id: str) -> None:
        self.client.rpc(
            "mark_recommendation_chosen",
            {"p_parcel_id": parcel_id, "p_agent_id": agent_id},
        ).execute()

    def fetch_recommendation_logs(self, batch_size: int = 1000) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        start = 0
        while True:
            end = start + batch_size - 1
            response = (
                self.client.table("recommendation_logs")
                .select("features,chosen,outcome")
                .range(start, end)
                .execute()
            )
            batch = list(response.data or [])
            rows.extend(batch)
            if len(batch) < batch_size:
                return rows
            start += batch_size


def _extract_coordinates(row: Any) -> tuple[float, float] | None:
    if not row:
        return None
    if isinstance(row, list):
        row = row[0] if row else None
    if not isinstance(row, dict):
        return None

    lat = row.get("lat") or row.get("latitude")
    lng = row.get("lng") or row.get("longitude")
    if lat is not None and lng is not None:
        return float(lat), float(lng)

    location = row.get("location")
    if isinstance(location, dict):
        coordinates = location.get("coordinates")
        if isinstance(coordinates, list) and len(coordinates) >= 2:
            return float(coordinates[1]), float(coordinates[0])

    if isinstance(location, str):
        match = re.search(r"POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)", location)
        if match:
            lng_text, lat_text = match.groups()
            return float(lat_text), float(lng_text)

    return None

