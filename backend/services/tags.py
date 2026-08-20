"""Canonical tag rules shared by public game writes and admin operations."""

from __future__ import annotations

import re
import unicodedata
from typing import Any

MAX_TAG_LENGTH = 20
MAX_GAME_TAGS = 5
_WHITESPACE = re.compile(r"\s+")


class TagValidationError(ValueError):
    pass


def normalize_tag(value: Any) -> str:
    if not isinstance(value, str):
        raise TagValidationError("Тег должен быть текстом.")
    if "\n" in value or "\r" in value:
        raise TagValidationError("Тег не может содержать перенос строки.")
    if any(unicodedata.category(char).startswith("C") and not char.isspace() for char in value):
        raise TagValidationError("Тег содержит недопустимые управляющие символы.")
    normalized = _WHITESPACE.sub(" ", value).strip()
    if not normalized:
        raise TagValidationError("Тег не может быть пустым.")
    if len(normalized) > MAX_TAG_LENGTH:
        raise TagValidationError("Тег не может быть длиннее 20 символов.")
    if all(not char.isalnum() for char in normalized):
        raise TagValidationError("Тег содержит только символы пунктуации.")
    return normalized


def canonical_tag(value: Any) -> str:
    return normalize_tag(value).casefold()


def normalize_game_tags(values: list[Any] | None) -> list[str]:
    if values is None:
        return []
    if not isinstance(values, list):
        raise TagValidationError("Теги должны быть списком.")
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = normalize_tag(value)
        key = normalized.casefold()
        if key not in seen:
            result.append(normalized)
            seen.add(key)
    if len(result) > MAX_GAME_TAGS:
        raise TagValidationError("У игры может быть не больше 5 тегов.")
    return result


def normalize_legacy_tags(values: Any) -> list[str]:
    """Normalize display/counting of old rows without dropping malformed data."""
    if not isinstance(values, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        try:
            normalized = normalize_tag(value)
        except TagValidationError:
            if isinstance(value, str) and value.strip():
                normalized = value.strip()
            else:
                continue
        key = normalized.casefold()
        if key not in seen:
            result.append(normalized)
            seen.add(key)
    return result


def rank_tag_match(query: str, tag: dict[str, Any]) -> tuple[int, int, int, str]:
    """Small deterministic ranking: exact, prefix, system, popularity, fuzzy/substring."""
    normalized_query = " ".join(query.split()).casefold()
    name = str(tag.get("name") or "")
    canonical = str(tag.get("canonical_name") or name.casefold())
    if not normalized_query:
        match_rank = 0
    elif canonical == normalized_query:
        match_rank = 0
    elif canonical.startswith(normalized_query):
        match_rank = 1
    elif _is_close_typo(normalized_query, canonical):
        match_rank = 3
    elif normalized_query in canonical:
        match_rank = 4
    else:
        return (99, 0, 0, name.casefold())
    return (match_rank, 0 if tag.get("is_system") else 1, -int(tag.get("usage_count") or 0), name.casefold())


def _is_close_typo(query: str, candidate: str) -> bool:
    if not query or not candidate or abs(len(query) - len(candidate)) > 2:
        return False
    previous = list(range(len(candidate) + 1))
    for index, query_char in enumerate(query, start=1):
        current = [index]
        for candidate_index, candidate_char in enumerate(candidate, start=1):
            current.append(min(
                current[-1] + 1,
                previous[candidate_index] + 1,
                previous[candidate_index - 1] + (query_char != candidate_char),
            ))
        previous = current
    return previous[-1] <= max(1, len(query) // 4)
