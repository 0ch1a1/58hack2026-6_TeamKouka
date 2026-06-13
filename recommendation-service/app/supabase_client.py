from __future__ import annotations

import re
from typing import Any

from supabase import Client, create_client

from app.config import Settings


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

