import os
import sys
import types
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

os.environ.setdefault("JWT_SECRET", "tag-tests-only")

fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes.tags import (  # noqa: E402
    RenameInput,
    MergeInput,
    _bulk_preview,
    _require_admin,
    admin_delete_tag,
    admin_merge_tag,
    admin_rename_tag,
)
from routes.games import SaveGameInput  # noqa: E402
from services.tags import (  # noqa: E402
    TagValidationError,
    canonical_tag,
    normalize_game_tags,
    normalize_tag,
    rank_tag_match,
)


class TagRulesTests(unittest.TestCase):
    def test_normalization_is_canonical_and_collapses_whitespace(self):
        self.assertEqual(normalize_tag("  История   России "), "История России")
        self.assertEqual(canonical_tag("История"), canonical_tag("история"))

    def test_empty_and_invalid_lengths_are_rejected(self):
        with self.assertRaisesRegex(TagValidationError, "пустым"):
            normalize_tag(" \t ")
        self.assertEqual(len(normalize_tag("а" * 20)), 20)
        with self.assertRaisesRegex(TagValidationError, "длиннее 20"):
            normalize_tag("а" * 21)
        with self.assertRaisesRegex(TagValidationError, "перенос"):
            normalize_tag("История\nРоссии")
        with self.assertRaisesRegex(TagValidationError, "пунктуации"):
            normalize_tag("!!!")

    def test_game_limit_deduplicates_canonical_values_but_rejects_six_tags(self):
        self.assertEqual(normalize_game_tags(["История", " история "]), ["История"])
        self.assertEqual(len(normalize_game_tags([f"Тег {i}" for i in range(5)])), 5)
        with self.assertRaisesRegex(TagValidationError, "не больше 5"):
            normalize_game_tags([f"Тег {i}" for i in range(6)])

    def test_game_api_model_normalizes_and_rejects_tag_limits(self):
        payload = SaveGameInput(kind="quiz", data={}, tags=[" История  ", "история"])
        self.assertEqual(payload.tags, ["История"])
        with self.assertRaisesRegex(ValueError, "не больше 5"):
            SaveGameInput(kind="quiz", data={}, tags=[f"Тег {i}" for i in range(6)])

    def test_ranking_prioritizes_exact_prefix_system_and_fuzzy_matches(self):
        exact = rank_tag_match("история", {"name": "История", "canonical_name": "история"})
        prefix = rank_tag_match("ист", {"name": "История", "canonical_name": "история"})
        fuzzy = rank_tag_match("исторя", {"name": "История", "canonical_name": "история"})
        system = rank_tag_match("", {"name": "История", "canonical_name": "история", "is_system": True})
        user = rank_tag_match("", {"name": "История", "canonical_name": "история", "is_system": False})
        self.assertEqual(exact[0], 0)
        self.assertEqual(prefix[0], 1)
        self.assertEqual(fuzzy[0], 3)
        self.assertLess(system, user)


class TagAdminTests(unittest.TestCase):
    def test_bulk_preview_deduplicates_lines_and_reports_existing_and_invalid(self):
        existing = [{"name": "История", "canonical_name": "история"}]
        with patch("routes.tags._tag_rows", return_value=existing):
            preview = _bulk_preview("История\n история \nГеография\n" + "а" * 21)
        self.assertEqual(preview["existing"], ["История"])
        self.assertEqual(preview["create"], ["География"])
        self.assertEqual(preview["create_count"], 1)
        self.assertEqual(len(preview["invalid"]), 1)

    def test_valid_educational_punctuation_is_allowed(self):
        self.assertEqual(normalize_tag("5–6 класс"), "5–6 класс")
        self.assertEqual(normalize_tag("Н и НН"), "Н и НН")
        self.assertEqual(normalize_tag("C++"), "C++")
        self.assertEqual(normalize_tag("Пётр I"), "Пётр I")

    def test_regular_user_cannot_run_admin_operations(self):
        with self.assertRaisesRegex(HTTPException, "Access denied"):
            _require_admin({"role": "user"})
        _require_admin({"role": "admin"})

    def test_rename_rejects_canonical_collision(self):
        source = {"id": "one", "name": "История", "canonical_name": "история"}
        collision = {"id": "two", "name": "История России", "canonical_name": "история россии"}
        with patch("routes.tags.supabase", MagicMock()), patch("routes.tags._find_tag", return_value=source), patch(
            "routes.tags._rows", side_effect=[[collision]]
        ):
            with self.assertRaisesRegex(HTTPException, "canonical"):
                admin_rename_tag("one", RenameInput(name="История России"), {"role": "admin"})

    def test_merge_reports_affected_games_and_deletes_source(self):
        source = {"id": "one", "name": "Русский", "canonical_name": "русский"}
        target = {"id": "two", "name": "Русский язык", "canonical_name": "русский язык"}
        with patch("routes.tags.supabase", MagicMock()), patch("routes.tags._find_tag", side_effect=[source, target]), patch(
            "routes.tags._replace_tag_in_games", return_value=3
        ), patch("routes.tags._rows", return_value=[]):
            result = admin_merge_tag("one", MergeInput(target_id="two"), {"role": "admin"})
        self.assertEqual(result["affected_games"], 3)

    def test_used_tag_delete_requires_replacement(self):
        source = {"id": "one", "canonical_name": "история"}
        with patch("routes.tags._find_tag", return_value=source), patch(
            "routes.tags._tag_usage", return_value=({"история": 2}, {})
        ):
            with self.assertRaisesRegex(HTTPException, "используется"):
                admin_delete_tag("one", user={"role": "admin"})


if __name__ == "__main__":
    unittest.main()
