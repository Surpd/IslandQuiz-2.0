"""Shared, server-side role limit configuration backed by ``settings``."""

from __future__ import annotations

import json
from typing import Any

from database import supabase


LIMIT_KEYS = (
    "saved_games",
    "public_games",
    "ai_generations_per_day",
    "ai_file_generations_per_day",
    "ai_upload_bytes",
)

DEFAULT_LIMITS: dict[str, dict[str, int | None]] = {
    "user": {
        "saved_games": 50,
        "public_games": 20,
        "ai_generations_per_day": 20,
        "ai_file_generations_per_day": 5,
        "ai_upload_bytes": 10 * 1024 * 1024,
    },
    "admin": {key: None for key in LIMIT_KEYS},
}


def _parse_value(value: Any) -> int | None:
    if value in (None, "", "null", "None"):
        return None
    try:
        parsed = json.loads(value) if isinstance(value, str) else value
    except (TypeError, ValueError):
        parsed = value
    if parsed is None:
        return None
    if isinstance(parsed, bool):
        raise ValueError("Boolean is not a valid limit")
    number = int(parsed)
    if number < 0:
        raise ValueError("Limit cannot be negative")
    return number


def settings_key(role: str, limit_key: str) -> str:
    return f"limits.{role}.{limit_key}"


def get_role_limits() -> dict[str, dict[str, int | None]]:
    result = {role: values.copy() for role, values in DEFAULT_LIMITS.items()}
    try:
        rows = supabase.table("settings").select("key,value").execute().data or []
    except Exception:
        return result
    for row in rows:
        if not isinstance(row, dict):
            continue
        key = row.get("key")
        if not isinstance(key, str) or not key.startswith("limits."):
            continue
        parts = key.split(".", 2)
        if len(parts) != 3 or parts[1] not in result or parts[2] not in LIMIT_KEYS:
            continue
        try:
            result[parts[1]][parts[2]] = _parse_value(row.get("value"))
        except ValueError:
            continue
    return result


def get_user_limit(user: dict[str, Any] | None, limit_key: str) -> int | None:
    role = "admin" if user and user.get("role") == "admin" else "user"
    return get_role_limits()[role][limit_key]


def normalize_limits(payload: dict[str, Any]) -> dict[str, dict[str, int | None]]:
    normalized: dict[str, dict[str, int | None]] = {}
    for role in DEFAULT_LIMITS:
        role_values = payload.get(role, {})
        if not isinstance(role_values, dict):
            raise ValueError("Invalid limits payload")
        normalized[role] = {}
        for limit_key in LIMIT_KEYS:
            normalized[role][limit_key] = _parse_value(role_values.get(limit_key))
    return normalized


def save_role_limits(limits: dict[str, dict[str, int | None]]) -> None:
    rows = [
        {"key": settings_key(role, key), "value": json.dumps(value)}
        for role, values in limits.items()
        for key, value in values.items()
    ]
    supabase.table("settings").upsert(rows).execute()
