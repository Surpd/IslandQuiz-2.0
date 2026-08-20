"""Sanitized application-error persistence for the admin Error Center.

The production ``error_logs`` table currently has only ``message`` and ``path``.
Structured metadata is therefore stored as compact JSON in ``message`` while keeping
the existing schema and older rows fully readable.
"""

from __future__ import annotations

import json
import re
from typing import Any

from database import supabase


_SENSITIVE = re.compile(
    r"(?i)(?:authorization\s*[:=]\s*bearer\s+|bearer\s+|"
    r"(?:token|api[_-]?key|password|secret|jwt)\s*[:=]\s*)[^\s,;]+"
)
_MAX_DETAILS = 2_000


def redact_error_details(value: Any) -> str:
    """Return bounded diagnostic text without credentials or request secrets."""
    if value is None:
        return ""
    if not isinstance(value, str):
        try:
            value = json.dumps(value, ensure_ascii=False, default=str)
        except (TypeError, ValueError):
            value = str(value)
    return _SENSITIVE.sub("[redacted]", value)[:_MAX_DETAILS]


def build_error_record(
    message: str,
    path: str,
    *,
    source: str = "backend",
    user_id: str | None = None,
    details: Any = None,
    request_id: str | None = None,
    status: int | None = None,
) -> dict[str, Any]:
    return {
        "message": redact_error_details(message) or "Неизвестная ошибка",
        "source": source,
        "user_id": user_id,
        "details": redact_error_details(details),
        "request_id": request_id,
        "status": status,
        "path": redact_error_details(path),
    }


def persist_error_log(message: str, path: str, **metadata: Any) -> None:
    """Best-effort logging: a logging outage must never break the request path."""
    record = build_error_record(message, path, **metadata)
    try:
        supabase.table("error_logs").insert(
            {"message": json.dumps(record, ensure_ascii=False), "path": record["path"]}
        ).execute()
    except Exception:
        pass


def parse_error_log(row: dict[str, Any]) -> dict[str, Any]:
    """Expose legacy and structured rows through one safe admin shape."""
    raw_message = row.get("message")
    parsed: dict[str, Any] = {}
    if isinstance(raw_message, str):
        try:
            candidate = json.loads(raw_message)
            if isinstance(candidate, dict):
                parsed = candidate
        except json.JSONDecodeError:
            parsed = {"message": raw_message}
    return {
        "id": row.get("id"),
        "created_at": row.get("created_at"),
        "message": redact_error_details(parsed.get("message") or raw_message),
        "path": redact_error_details(parsed.get("path") or row.get("path")),
        "source": parsed.get("source") or "backend",
        "user_id": parsed.get("user_id"),
        "details": redact_error_details(parsed.get("details")),
        "request_id": parsed.get("request_id"),
        "status": parsed.get("status"),
    }
