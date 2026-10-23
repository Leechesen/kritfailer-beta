import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import warnings
from unittest.mock import patch

import excel_to_json as converter


class ConverterTests(unittest.TestCase):
    headers = ["attack_type", "severity", "effect", "roleplay_1", "roleplay_2", "weight"]

    def test_repeated_header_and_blank_rows_are_ignored(self):
        with warnings.catch_warnings(record=True) as reported:
            result, count = converter.convert_sheet("Útok", self.headers, [self.headers, [None] * 6, ["Melee", "Vážný", "Účinek", None, None, 2]])
        self.assertEqual(count, 1)
        self.assertTrue(reported)
        self.assertEqual(result["Melee"]["Vážný"][0]["roleplay"], ["", ""])

    def test_invalid_weights_fail_with_a_row_number(self):
        for value in ["weight", 0, -1, float("nan"), float("inf"), True]:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "řádek 2"):
                converter.convert_sheet("Útok", self.headers, [["Melee", "Vážný", "Účinek", "", "", value]])

    def test_blank_weight_defaults_to_one_and_fractions_are_preserved(self):
        self.assertEqual(converter.parse_weight(None, "x"), 1)
        self.assertEqual(converter.parse_weight("2.5", "x"), 2.5)

    def test_partial_rows_and_missing_columns_fail(self):
        with self.assertRaisesRegex(ValueError, "effect a severity"):
            converter.convert_sheet("Útok", self.headers, [["Melee", "Vážný", None]])
        with self.assertRaisesRegex(ValueError, "chybí sloupce"):
            converter.convert_sheet("Skill", ["severity", "effect"], [])

    def test_categories_and_arbitrary_new_difficulties_are_retained(self):
        result, count = converter.convert_sheet("Skill", ["skill", "skill_category", "severity", "effect"], [["Arcana", "Intelligence", "Velmi těžký", "Efekt"]])
        self.assertEqual(count, 1)
        self.assertEqual(result["Intelligence"]["Arcana"]["Velmi těžký"][0]["effect"], "Efekt")

    def test_real_workbook_converts_deterministically_and_its_manifest_matches(self):
        with tempfile.TemporaryDirectory() as directory, warnings.catch_warnings():
            warnings.simplefilter("ignore")
            output = Path(directory) / "results.json"
            first = converter.build_json_from_excel(output_path=output)
            original = output.read_bytes()
            second = converter.build_json_from_excel(output_path=output)
            self.assertEqual(first, second)
            self.assertEqual(first["version"], hashlib.sha256(original).hexdigest())
            self.assertEqual(json.loads(output.with_name("results.meta.json").read_text())["version"], first["version"])
            data = json.loads(original)
            self.assertGreater(first["entries"], 0)
            self.assertNotIn("skill_category", data["Skill"])

    def test_failed_validation_preserves_previous_published_data(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "results.json"
            output.write_text("old data")
            with patch.object(converter, "convert_sheet", side_effect=ValueError("bad input")):
                with self.assertRaises(ValueError):
                    converter.build_json_from_excel(output_path=output)
            self.assertEqual(output.read_text(), "old data")


if __name__ == "__main__":
    unittest.main()
