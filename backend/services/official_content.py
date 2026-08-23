from __future__ import annotations

import json
import math
import re
from typing import Any

from services.tags import TagValidationError, canonical_tag, normalize_game_tags, normalize_tag


SCHEMA_VERSION = 1
MAX_GAMES = 100
MAX_TITLE_LENGTH = 100
MAX_QUESTION_LENGTH = 500
MAX_OPTION_LENGTH = 200
MAX_CATEGORY_LENGTH = 60
ALLOWED_KINDS = {"quiz", "jeopardy", "millionaire"}
CONTENT_ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*-v[0-9]+$")


def _error(path: str, message: str) -> dict[str, str]:
    return {"path": path, "message": message}


def _is_record(value: Any) -> bool:
    return isinstance(value, dict)


def _non_empty_string(value: Any, path: str, errors: list[dict[str, str]], *, max_length: int | None = None) -> bool:
    if not isinstance(value, str) or not value.strip():
        errors.append(_error(path, "Ожидается непустая строка."))
        return False
    if max_length is not None and len(value) > max_length:
        errors.append(_error(path, f"Максимум {max_length} символов."))
        return False
    return True


def _positive_number(value: Any, path: str, errors: list[dict[str, str]], *, integer: bool = False) -> bool:
    valid = isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0
    if integer:
        valid = valid and isinstance(value, int)
    if not valid:
        errors.append(_error(path, "Ожидается положительное число."))
    return valid


def _json_string(value: Any, path: str, errors: list[dict[str, str]]) -> Any | None:
    if not isinstance(value, str):
        errors.append(_error(path, "Ожидается JSON-строка."))
        return None
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        errors.append(_error(path, "Строка не содержит валидный JSON."))
        return None


def _reject_identity_fields(value: Any, path: str, errors: list[dict[str, str]]) -> None:
    if isinstance(value, dict):
        for key, nested in value.items():
            if key in {"owner_id", "ownerId", "user_id", "userId"}:
                errors.append(_error(f"{path}.{key}", "Пользовательские UUID не хранятся в content pack."))
            _reject_identity_fields(nested, f"{path}.{key}", errors)
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            _reject_identity_fields(nested, f"{path}[{index}]", errors)


def _validate_quiz_question(question: Any, path: str, errors: list[dict[str, str]]) -> None:
    if not _is_record(question):
        errors.append(_error(path, "Вопрос должен быть объектом."))
        return
    for field in ("id", "q", "answer"):
        if field in question:
            _non_empty_string(question[field], f"{path}.{field}", errors, max_length=MAX_QUESTION_LENGTH if field == "q" else None)
        else:
            errors.append(_error(f"{path}.{field}", "Поле обязательно."))
    qtype = question.get("type")
    if qtype not in {"choice", "bool", "text", "matching", "close", "ordering"}:
        errors.append(_error(f"{path}.type", "Неподдерживаемый тип вопроса."))
    _positive_number(question.get("points"), f"{path}.points", errors, integer=True)
    _positive_number(question.get("time"), f"{path}.time", errors, integer=True)
    options = question.get("options")
    if not isinstance(options, list) or any(not isinstance(item, str) or not item.strip() or len(item) > MAX_OPTION_LENGTH for item in options):
        errors.append(_error(f"{path}.options", "Ожидается список непустых строк."))
        options = []
    if qtype == "choice":
        if len(options) != 4 or len({item.casefold() for item in options}) != 4:
            errors.append(_error(f"{path}.options", "Choice должен содержать ровно 4 уникальных варианта."))
        if isinstance(question.get("answer"), str) and question["answer"] not in options:
            errors.append(_error(f"{path}.answer", "Правильный ответ должен совпадать с одним из вариантов."))
    elif qtype == "bool":
        if question.get("answer") not in {"true", "false"}:
            errors.append(_error(f"{path}.answer", "Для bool ответ должен быть строкой true или false."))
        if options:
            errors.append(_error(f"{path}.options", "Для bool options должен быть пустым."))
    elif qtype == "text":
        if options:
            errors.append(_error(f"{path}.options", "Для text options должен быть пустым."))
        if isinstance(question.get("answer"), str) and not any(part.strip() for part in question["answer"].split(",")):
            errors.append(_error(f"{path}.answer", "Нужен хотя бы один допустимый ответ."))
    elif qtype == "matching":
        if options:
            errors.append(_error(f"{path}.options", "Для matching options должен быть пустым."))
        pairs = _json_string(question.get("answer"), f"{path}.answer", errors)
        if not isinstance(pairs, list) or len(pairs) < 3:
            errors.append(_error(f"{path}.answer", "Matching должен содержать минимум 3 пары."))
        elif any(not _is_record(pair) or not isinstance(pair.get("left"), str) or not pair.get("left", "").strip() or not isinstance(pair.get("right"), str) or not pair.get("right", "").strip() for pair in pairs):
            errors.append(_error(f"{path}.answer", "Каждая matching-пара должна иметь непустые left и right."))
    elif qtype == "close":
        if options:
            errors.append(_error(f"{path}.options", "Для close options должен быть пустым."))
        answers = _json_string(question.get("answer"), f"{path}.answer", errors)
        blanks = str(question.get("q") or "").count("___")
        if blanks < 1:
            errors.append(_error(f"{path}.q", "Close должен содержать хотя бы один маркер ___."))
        if not isinstance(answers, list) or len(answers) != blanks or any(not isinstance(item, str) or not item.strip() for item in answers):
            errors.append(_error(f"{path}.answer", "Число ответов close должно совпадать с числом маркеров ___."))
    elif qtype == "ordering":
        if options:
            errors.append(_error(f"{path}.options", "Для ordering options должен быть пустым."))
        items = _json_string(question.get("answer"), f"{path}.answer", errors)
        if not isinstance(items, list) or len(items) < 3 or any(not isinstance(item, str) or not item.strip() for item in items) or len({item.casefold() for item in items if isinstance(item, str)}) != len(items):
            errors.append(_error(f"{path}.answer", "Ordering должен содержать минимум 3 уникальных непустых пункта."))


def _validate_quiz(data: dict[str, Any], path: str, errors: list[dict[str, str]]) -> None:
    config = data.get("config")
    if not _is_record(config):
        errors.append(_error(f"{path}.config", "config обязателен и должен быть объектом."))
        return
    _non_empty_string(config.get("title"), f"{path}.config.title", errors, max_length=MAX_TITLE_LENGTH)
    if not isinstance(config.get("description"), str):
        errors.append(_error(f"{path}.config.description", "Ожидается строка."))
    if "theme" in config:
        errors.append(_error(f"{path}.config.theme", "Поле Theme больше не поддерживается в game data."))
    if not isinstance(config.get("shuffleQuestions"), bool):
        errors.append(_error(f"{path}.config.shuffleQuestions", "Ожидается boolean."))
    if config.get("showResult") not in {"each", "end"}:
        errors.append(_error(f"{path}.config.showResult", "Ожидается each или end."))
    _positive_number(config.get("defaultTime"), f"{path}.config.defaultTime", errors, integer=True)
    if config.get("orderMode") not in {"sequential", "free"}:
        errors.append(_error(f"{path}.config.orderMode", "Ожидается sequential или free."))
    _positive_number(config.get("totalTime"), f"{path}.config.totalTime", errors, integer=True)
    questions = data.get("questions")
    if not isinstance(questions, list) or not questions:
        errors.append(_error(f"{path}.questions", "Quiz должен содержать хотя бы один вопрос."))
        return
    for index, question in enumerate(questions):
        _validate_quiz_question(question, f"{path}.questions[{index}]", errors)


def _validate_jeopardy(data: dict[str, Any], path: str, errors: list[dict[str, str]]) -> None:
    config = data.get("config")
    if not _is_record(config):
        errors.append(_error(f"{path}.config", "config обязателен и должен быть объектом."))
        return
    if "title" in config:
        _non_empty_string(config.get("title"), f"{path}.config.title", errors, max_length=MAX_TITLE_LENGTH)
    if "theme" in config:
        errors.append(_error(f"{path}.config.theme", "Поле Theme больше не поддерживается в game data."))
    for field in ("timeBase", "timeStep", "timeFinal"):
        _positive_number(config.get(field), f"{path}.config.{field}", errors, integer=True)
    round_titles = config.get("roundTitles")
    if round_titles is not None and (not isinstance(round_titles, list) or any(not isinstance(item, str) for item in round_titles)):
        errors.append(_error(f"{path}.config.roundTitles", "Ожидается список строк."))
    rounds = data.get("rounds")
    if not isinstance(rounds, list) or not rounds:
        errors.append(_error(f"{path}.rounds", "Нужен хотя бы один раунд."))
    else:
        for ri, round_data in enumerate(rounds):
            if not isinstance(round_data, list) or not round_data or len(round_data) > 6:
                errors.append(_error(f"{path}.rounds[{ri}]", "Раунд должен содержать от 1 до 6 категорий."))
                continue
            for ci, category in enumerate(round_data):
                category_path = f"{path}.rounds[{ri}][{ci}]"
                if not _is_record(category):
                    errors.append(_error(category_path, "Категория должна быть объектом."))
                    continue
                _non_empty_string(category.get("category"), f"{category_path}.category", errors, max_length=MAX_CATEGORY_LENGTH)
                questions = category.get("questions")
                if not isinstance(questions, list) or not questions or len(questions) > 5:
                    errors.append(_error(f"{category_path}.questions", "Категория должна содержать от 1 до 5 вопросов."))
                    continue
                for qi, question in enumerate(questions):
                    question_path = f"{category_path}.questions[{qi}]"
                    if not _is_record(question):
                        errors.append(_error(question_path, "Вопрос должен быть объектом."))
                        continue
                    _positive_number(question.get("points"), f"{question_path}.points", errors, integer=True)
                    if isinstance(question.get("points"), int) and question["points"] % 100:
                        errors.append(_error(f"{question_path}.points", "Очки Jeopardy должны быть кратны 100."))
                    _non_empty_string(question.get("q"), f"{question_path}.q", errors, max_length=MAX_QUESTION_LENGTH)
                    _non_empty_string(question.get("a"), f"{question_path}.a", errors, max_length=MAX_QUESTION_LENGTH)
    final = data.get("final")
    if not _is_record(final):
        errors.append(_error(f"{path}.final", "final обязателен и должен быть объектом."))
    else:
        _non_empty_string(final.get("category"), f"{path}.final.category", errors, max_length=MAX_CATEGORY_LENGTH)
        _non_empty_string(final.get("q"), f"{path}.final.q", errors, max_length=MAX_QUESTION_LENGTH)
        _non_empty_string(final.get("a"), f"{path}.final.a", errors, max_length=MAX_QUESTION_LENGTH)


def _validate_millionaire(data: dict[str, Any], path: str, errors: list[dict[str, str]]) -> None:
    config = data.get("config")
    if not _is_record(config):
        errors.append(_error(f"{path}.config", "config обязателен и должен быть объектом."))
        return
    if "title" in config:
        _non_empty_string(config.get("title"), f"{path}.config.title", errors, max_length=MAX_TITLE_LENGTH)
    if "theme" in config:
        errors.append(_error(f"{path}.config.theme", "Поле Theme больше не поддерживается в game data."))
    _positive_number(config.get("timePerQuestion"), f"{path}.config.timePerQuestion", errors, integer=True)
    if config.get("moneyScale") not in {"easy", "normal", "hard"}:
        errors.append(_error(f"{path}.config.moneyScale", "Неизвестная шкала денег."))
    if config.get("milestones") not in {"classic", "three", "none"}:
        errors.append(_error(f"{path}.config.milestones", "Неизвестный режим несгораемых сумм."))
    if config.get("pointsMode") is not None and config.get("pointsMode") not in {"classic", "double", "custom"}:
        errors.append(_error(f"{path}.config.pointsMode", "Неизвестный pointsMode."))
    questions = data.get("questions")
    if not isinstance(questions, list) or not questions:
        errors.append(_error(f"{path}.questions", "Millionaire должен содержать хотя бы один вопрос."))
        return
    for index, question in enumerate(questions):
        question_path = f"{path}.questions[{index}]"
        if not _is_record(question):
            errors.append(_error(question_path, "Вопрос должен быть объектом."))
            continue
        _non_empty_string(question.get("q"), f"{question_path}.q", errors, max_length=MAX_QUESTION_LENGTH)
        _positive_number(question.get("money"), f"{question_path}.money", errors)
        options = question.get("options")
        if not isinstance(options, list) or len(options) != 4:
            errors.append(_error(f"{question_path}.options", "Millionaire должен содержать ровно 4 варианта."))
            continue
        correct = 0
        for oi, option in enumerate(options):
            option_path = f"{question_path}.options[{oi}]"
            if not _is_record(option) or not _non_empty_string(option.get("text"), f"{option_path}.text", errors, max_length=MAX_OPTION_LENGTH) or not isinstance(option.get("correct"), bool):
                if _is_record(option) and not isinstance(option.get("correct"), bool):
                    errors.append(_error(f"{option_path}.correct", "Ожидается boolean."))
            elif option.get("correct"):
                correct += 1
        if correct != 1:
            errors.append(_error(f"{question_path}.options", "Должен быть ровно один правильный вариант."))


def validate_pack(pack: Any, canonical_tags: dict[str, str], existing_content_ids: dict[str, str] | None = None) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not _is_record(pack):
        return {"valid": False, "errors": [_error("$", "Корень JSON должен быть объектом.")], "warnings": [], "games": [], "normalized_games": [], "counts": {kind: 0 for kind in ALLOWED_KINDS}}
    _reject_identity_fields(pack, "$", errors)
    if pack.get("schema_version") != SCHEMA_VERSION:
        errors.append(_error("$.schema_version", f"Поддерживается только schema_version={SCHEMA_VERSION}."))
    unexpected = sorted(set(pack) - {"schema_version", "games"})
    for key in unexpected:
        errors.append(_error(f"$.{key}", "Неизвестное поле в корне JSON."))
    games = pack.get("games")
    if not isinstance(games, list) or not games:
        errors.append(_error("$.games", "games должен быть непустым массивом."))
        games = []
    elif len(games) > MAX_GAMES:
        errors.append(_error("$.games", f"В одной пачке допускается не больше {MAX_GAMES} игр."))
    normalized_games: list[dict[str, Any]] = []
    previews: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    counts = {kind: 0 for kind in ALLOWED_KINDS}
    existing_content_ids = existing_content_ids or {}
    for index, game in enumerate(games):
        path = f"$.games[{index}]"
        if not _is_record(game):
            errors.append(_error(path, "Игра должна быть объектом."))
            continue
        unexpected_game = sorted(set(game) - {"content_id", "kind", "tags", "data"})
        for key in unexpected_game:
            errors.append(_error(f"{path}.{key}", "Неизвестное поле. owner_id в content pack запрещён."))
        content_id = game.get("content_id")
        if not isinstance(content_id, str) or not CONTENT_ID_RE.fullmatch(content_id):
            errors.append(_error(f"{path}.content_id", "Используйте lowercase kebab-case с суффиксом -vN, например geo-europe-capitals-v1."))
            content_id = f"invalid-{index}-v1"
        elif content_id in seen_ids:
            errors.append(_error(f"{path}.content_id", "content_id повторяется в одной пачке."))
        seen_ids.add(content_id)
        kind = game.get("kind")
        if kind not in ALLOWED_KINDS:
            errors.append(_error(f"{path}.kind", "Поддерживаются только quiz, jeopardy и millionaire."))
        else:
            counts[kind] += 1
        data = game.get("data")
        if not _is_record(data):
            errors.append(_error(f"{path}.data", "data должен быть объектом текущей внутренней game schema."))
        elif kind == "quiz":
            _validate_quiz(data, f"{path}.data", errors)
        elif kind == "jeopardy":
            _validate_jeopardy(data, f"{path}.data", errors)
        elif kind == "millionaire":
            _validate_millionaire(data, f"{path}.data", errors)
        tags = game.get("tags", [])
        try:
            normalized_tags = normalize_game_tags(tags)
        except TagValidationError as exc:
            errors.append(_error(f"{path}.tags", str(exc)))
            normalized_tags = []
        canonical_names: list[str] = []
        for tag in normalized_tags:
            key = canonical_tag(tag)
            canonical_name = canonical_tags.get(key)
            if canonical_name is None:
                errors.append(_error(f"{path}.tags", f"Тег «{tag}» отсутствует в public.tags."))
            else:
                canonical_names.append(canonical_name)
        status = "already_imported" if content_id in existing_content_ids else "new"
        if status == "already_imported":
            warnings.append(_error(f"{path}.content_id", "Игра уже импортирована и будет пропущена."))
        title = data.get("config", {}).get("title") if isinstance(data, dict) and isinstance(data.get("config"), dict) else None
        preview = {"content_id": content_id, "kind": kind, "title": title or "Без названия", "tags": canonical_names, "status": status}
        if content_id in existing_content_ids:
            preview["game_id"] = existing_content_ids[content_id]
        previews.append(preview)
        if isinstance(data, dict) and kind in ALLOWED_KINDS:
            normalized_games.append({"content_id": content_id, "kind": kind, "tags": canonical_names, "data": data})
    return {"valid": not errors, "errors": errors, "warnings": warnings, "games": previews, "normalized_games": normalized_games, "counts": counts}
