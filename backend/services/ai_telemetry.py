"""Best-effort AI request telemetry for the legacy ai_logs schema."""

from datetime import datetime, timezone
from typing import Any

from database import supabase


def record_ai_request(
    *,
    user_id: str | None,
    request_type: str,
    model: str | None,
    success: bool,
    error: str | None = None,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
) -> None:
    """Persist one AI request without making telemetry failures user-visible.

    ``ai_usage.request_type`` remains the quota/event source. ``ai_logs`` predates
    that field, so its ``topic`` column carries the same request type until the
    production schema receives a dedicated request_type column.
    """
    payload: dict[str, Any] = {
        "user_id": user_id,
        "model": model,
        "topic": request_type,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "success": success,
        "error": error[:1000] if isinstance(error, str) else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        supabase.table("ai_logs").insert(payload).execute()
    except Exception:
        # AI generation must not fail because an observability write is unavailable.
        return
