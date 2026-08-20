from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from database import supabase
from routes.auth import get_current_user
from services.tags import (
    MAX_GAME_TAGS,
    TagValidationError,
    canonical_tag,
    normalize_game_tags,
    normalize_legacy_tags,
    normalize_tag,
    rank_tag_match,
)


router = APIRouter(tags=["tags"])
DB_ERROR_DETAIL = "Ошибка базы данных"


def _rows(query) -> list[dict]:
    try:
        response = query.execute()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL) from exc
    rows = getattr(response, "data", None)
    if rows is None:
        return []
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL)
    return rows


def _tag_usage() -> tuple[dict[str, int], dict[str, list[str]]]:
    usage: dict[str, int] = {}
    games_by_tag: dict[str, list[str]] = {}
    for game in _rows(supabase.table("games").select("id,tags")):
        game_id = str(game.get("id") or "")
        seen: set[str] = set()
        for tag in normalize_legacy_tags(game.get("tags")):
            try:
                key = canonical_tag(tag)
            except TagValidationError:
                continue
            if key in seen:
                continue
            seen.add(key)
            usage[key] = usage.get(key, 0) + 1
            games_by_tag.setdefault(key, []).append(game_id)
    return usage, games_by_tag


def _legacy_tag_names() -> dict[str, str]:
    names: dict[str, str] = {}
    for game in _rows(supabase.table("games").select("tags")):
        for tag in normalize_legacy_tags(game.get("tags")):
            try:
                names.setdefault(canonical_tag(tag), tag)
            except TagValidationError:
                continue
    return names


def _with_usage(rows: list[dict]) -> list[dict]:
    usage, _ = _tag_usage()
    return [{**row, "usage_count": usage.get(row.get("canonical_name"), 0)} for row in rows]


def _require_admin(user: dict | None) -> None:
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")


def _tag_rows() -> list[dict]:
    return _rows(supabase.table("tags").select("id,name,canonical_name,is_system,created_at,updated_at"))


def _find_tag(tag_id: str) -> dict:
    rows = _rows(supabase.table("tags").select("*").eq("id", tag_id))
    if not rows:
        raise HTTPException(status_code=404, detail="Тег не найден.")
    return rows[0]


def _insert_tag(name: str, *, is_system: bool) -> dict:
    normalized = normalize_tag(name)
    key = canonical_tag(normalized)
    existing = _rows(supabase.table("tags").select("*").eq("canonical_name", key))
    if existing:
        return existing[0]
    try:
        rows = _rows(supabase.table("tags").insert({"name": normalized, "canonical_name": key, "is_system": is_system}))
    except HTTPException as exc:
        # The unique canonical_name constraint is the final protection against
        # two concurrent requests creating the same logical tag.
        if exc.status_code == 502:
            existing = _rows(supabase.table("tags").select("*").eq("canonical_name", key))
            if existing:
                return existing[0]
        raise
    if rows:
        return rows[0]
    return _find_by_canonical(key)


def _find_by_canonical(key: str) -> dict:
    rows = _rows(supabase.table("tags").select("*").eq("canonical_name", key))
    if not rows:
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL)
    return rows[0]


def _split_bulk_text(value: str) -> list[str]:
    return [part.strip() for line in value.splitlines() for part in line.replace(";", ",").split(",") if part.strip()]


def _bulk_preview(value: str) -> dict[str, Any]:
    existing = {row.get("canonical_name"): row for row in _tag_rows()}
    create: list[str] = []
    already: list[str] = []
    invalid: list[dict[str, str]] = []
    seen: set[str] = set()
    for raw in _split_bulk_text(value):
        try:
            name = normalize_tag(raw)
            key = canonical_tag(name)
        except TagValidationError as exc:
            invalid.append({"value": raw, "reason": str(exc)})
            continue
        if key in seen:
            continue
        seen.add(key)
        if key in existing:
            already.append(existing[key]["name"])
        else:
            create.append(name)
    return {"create": create, "existing": already, "invalid": invalid, "create_count": len(create)}


class BulkTextInput(BaseModel):
    text: str = Field(max_length=20_000)


class BulkCreateInput(BaseModel):
    names: list[str] = Field(min_length=1, max_length=500)
    is_system: bool = True


class BulkActionInput(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)
    action: Literal["system", "user", "delete_unused"]


class RenameInput(BaseModel):
    name: str


class MergeInput(BaseModel):
    target_id: str


@router.get("/api/tags")
def list_tag_suggestions(
    query: str = Query("", max_length=50),
    limit: int = Query(10, ge=1, le=30),
):
    usage, _ = _tag_usage()
    try:
        rows = _tag_rows()
    except HTTPException:
        rows = []
    by_canonical = {row.get("canonical_name"): row for row in rows if row.get("canonical_name")}
    for key, name in _legacy_tag_names().items():
        by_canonical.setdefault(key, {"name": name, "canonical_name": key, "is_system": False})
    rows = [{**row, "usage_count": usage.get(row.get("canonical_name"), 0)} for row in by_canonical.values()]
    ranked = sorted((row for row in rows if not query or rank_tag_match(query, row)[0] < 99), key=lambda row: rank_tag_match(query, row))
    return {"tags": ranked[:limit], "max_per_game": MAX_GAME_TAGS, "max_length": 20}


@router.get("/api/admin/tags")
def admin_list_tags(
    search: str = "", sort: Literal["name", "popularity"] = "name", kind: Literal["all", "system", "user"] = "all", user=Depends(get_current_user),
):
    _require_admin(user)
    rows = _with_usage(_tag_rows())
    needle = search.strip().casefold()
    rows = [row for row in rows if not needle or needle in str(row.get("name") or "").casefold()]
    if kind != "all":
        rows = [row for row in rows if bool(row.get("is_system")) is (kind == "system")]
    rows.sort(key=lambda row: ((str(row.get("name") or "").casefold()),) if sort == "name" else (-int(row.get("usage_count") or 0), str(row.get("name") or "").casefold()))
    possible: list[dict[str, Any]] = []
    for index, left in enumerate(rows):
        for right in rows[index + 1 :]:
            rank = rank_tag_match(str(left.get("name")), right)[0]
            if rank == 3 or (rank in {1, 4} and min(len(str(left.get("name") or "")), len(str(right.get("name") or ""))) >= 4):
                possible.append({"source": left, "target": right})
    return {"tags": rows, "possible_duplicates": possible[:50]}


@router.post("/api/admin/tags/bulk-preview")
def admin_preview_tags(input: BulkTextInput, user=Depends(get_current_user)):
    _require_admin(user)
    return _bulk_preview(input.text)


@router.post("/api/admin/tags/bulk")
def admin_bulk_create_tags(input: BulkCreateInput, user=Depends(get_current_user)):
    _require_admin(user)
    preview = _bulk_preview("\n".join(input.names))
    created = [_insert_tag(name, is_system=input.is_system) for name in preview["create"]]
    return {"created": created, "existing": preview["existing"], "invalid": preview["invalid"]}


@router.post("/api/admin/tags/import-legacy")
def admin_import_legacy_tags(user=Depends(get_current_user)):
    _require_admin(user)
    names: dict[str, str] = {}
    for game in _rows(supabase.table("games").select("tags")):
        for tag in normalize_legacy_tags(game.get("tags")):
            try:
                names.setdefault(canonical_tag(tag), tag)
            except TagValidationError:
                continue
    preview = _bulk_preview("\n".join(names.values()))
    created = [_insert_tag(name, is_system=False) for name in preview["create"]]
    return {"created": len(created), "existing": len(preview["existing"]), "invalid": preview["invalid"]}


class LegacyNormalizeInput(BaseModel):
    apply: bool = False


@router.post("/api/admin/tags/normalize-legacy")
def admin_normalize_legacy_tags(input: LegacyNormalizeInput, user=Depends(get_current_user)):
    _require_admin(user)
    changed = 0
    skipped: list[dict[str, Any]] = []
    for game in _rows(supabase.table("games").select("id,tags")):
        raw_tags = game.get("tags")
        if not isinstance(raw_tags, list):
            continue
        try:
            normalized = normalize_game_tags(raw_tags)
        except TagValidationError as exc:
            skipped.append({"id": game.get("id"), "reason": str(exc)})
            continue
        if normalized == raw_tags:
            continue
        changed += 1
        if input.apply:
            _ensure_dictionary_for_admin(normalized)
            _rows(supabase.table("games").update({"tags": normalized}).eq("id", game.get("id")))
    return {"apply": input.apply, "changed": changed, "skipped": skipped}


def _ensure_dictionary_for_admin(tags: list[str]) -> None:
    for tag in tags:
        _insert_tag(tag, is_system=False)


@router.post("/api/admin/tags/bulk-action")
def admin_bulk_action(input: BulkActionInput, user=Depends(get_current_user)):
    _require_admin(user)
    if input.action in {"system", "user"}:
        _rows(supabase.table("tags").update({"is_system": input.action == "system"}).in_("id", input.ids))
        return {"ok": True, "count": len(input.ids)}
    usage, _ = _tag_usage()
    used = [row for row in _tag_rows() if row.get("id") in input.ids and usage.get(row.get("canonical_name"), 0) > 0]
    if used:
        raise HTTPException(status_code=409, detail="Можно удалить только неиспользуемые теги.")
    _rows(supabase.table("tags").delete().in_("id", input.ids))
    return {"ok": True, "count": len(input.ids)}


def _replace_tag_in_games(source_key: str, target_name: str) -> int:
    _, games_by_tag = _tag_usage()
    game_ids = games_by_tag.get(source_key, [])
    changed = 0
    for game_id in game_ids:
        rows = _rows(supabase.table("games").select("tags").eq("id", game_id))
        if not rows:
            continue
        current = normalize_legacy_tags(rows[0].get("tags"))
        result: list[str] = []
        seen: set[str] = set()
        for tag in current:
            try:
                tag_key = canonical_tag(tag)
            except TagValidationError:
                result.append(tag)
                continue
            value = target_name if tag_key == source_key else tag
            key = canonical_tag(value)
            if key not in seen:
                result.append(value)
                seen.add(key)
        _rows(supabase.table("games").update({"tags": result}).eq("id", game_id))
        changed += 1
    return changed


@router.patch("/api/admin/tags/{tag_id}")
def admin_rename_tag(tag_id: str, input: RenameInput, user=Depends(get_current_user)):
    _require_admin(user)
    source = _find_tag(tag_id)
    try:
        name = normalize_tag(input.name)
    except TagValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    key = canonical_tag(name)
    collision = _rows(supabase.table("tags").select("id,name").eq("canonical_name", key))
    if collision and collision[0].get("id") != tag_id:
        raise HTTPException(status_code=409, detail="Такой canonical тег уже существует. Используйте merge.")
    _replace_tag_in_games(source["canonical_name"], name)
    _rows(supabase.table("tags").update({"name": name, "canonical_name": key}).eq("id", tag_id))
    return {**source, "name": name, "canonical_name": key}


@router.post("/api/admin/tags/{tag_id}/merge")
def admin_merge_tag(tag_id: str, input: MergeInput, user=Depends(get_current_user)):
    _require_admin(user)
    source = _find_tag(tag_id)
    target = _find_tag(input.target_id)
    if source["id"] == target["id"]:
        raise HTTPException(status_code=422, detail="Нельзя объединить тег с самим собой.")
    affected = _replace_tag_in_games(source["canonical_name"], target["name"])
    _rows(supabase.table("tags").delete().eq("id", source["id"]))
    return {"ok": True, "affected_games": affected, "target": target}


@router.delete("/api/admin/tags/{tag_id}")
def admin_delete_tag(tag_id: str, replacement_id: Optional[str] = None, user=Depends(get_current_user)):
    _require_admin(user)
    source = _find_tag(tag_id)
    usage, _ = _tag_usage()
    count = usage.get(source.get("canonical_name"), 0)
    if count and not replacement_id:
        raise HTTPException(status_code=409, detail=f"Тег используется в {count} играх. Укажите replacement_id или используйте merge.")
    affected = 0
    if replacement_id:
        target = _find_tag(replacement_id)
        if target["id"] == source["id"]:
            raise HTTPException(status_code=422, detail="Replacement tag должен отличаться от удаляемого.")
        affected = _replace_tag_in_games(source["canonical_name"], target["name"])
    _rows(supabase.table("tags").delete().eq("id", tag_id))
    return {"ok": True, "affected_games": affected}
