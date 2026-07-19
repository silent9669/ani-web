from __future__ import annotations

import importlib.util
import pathlib
import sqlite3
import tempfile
import unittest


MODULE_PATH = (
    pathlib.Path(__file__).resolve().parents[1] / "deploy" / "homelab" / "data-guard.py"
)
SPEC = importlib.util.spec_from_file_location("data_guard", MODULE_PATH)
assert SPEC and SPEC.loader
DATA_GUARD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DATA_GUARD)


class DataGuardTests(unittest.TestCase):
    def create_database(self, directory: pathlib.Path) -> pathlib.Path:
        path = directory / "web.db"
        with sqlite3.connect(path) as database:
            database.executescript(
                """
                CREATE TABLE users (id INTEGER PRIMARY KEY);
                CREATE TABLE user_favorites (id INTEGER PRIMARY KEY);
                CREATE TABLE user_history (id INTEGER PRIMARY KEY);
                INSERT INTO users DEFAULT VALUES;
                INSERT INTO user_history DEFAULT VALUES;
                """
            )
        return path

    def test_snapshot_is_read_only_and_counts_protected_rows(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = self.create_database(pathlib.Path(temporary_directory))
            self.assertEqual(
                DATA_GUARD.snapshot(path),
                {
                    "exists": True,
                    "integrity": "ok",
                    "users": 1,
                    "favorites": 0,
                    "history": 1,
                },
            )

    def test_missing_database_is_valid_for_first_install(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = pathlib.Path(temporary_directory) / "missing.db"
            self.assertEqual(DATA_GUARD.snapshot(path), {"exists": False})

    def test_verify_rejects_row_loss(self) -> None:
        before = {"exists": True, "integrity": "ok", "users": 9, "favorites": 2, "history": 19}
        after = {"exists": True, "integrity": "ok", "users": 8, "favorites": 2, "history": 19}
        with self.assertRaisesRegex(ValueError, "users"):
            DATA_GUARD.verify(before, after)

    def test_verify_rejects_missing_or_corrupt_database(self) -> None:
        before = {"exists": True, "integrity": "ok", "users": 9, "favorites": 0, "history": 19}
        with self.assertRaisesRegex(ValueError, "disappeared"):
            DATA_GUARD.verify(before, {"exists": False})
        with self.assertRaisesRegex(ValueError, "integrity"):
            DATA_GUARD.verify(before, {"exists": True, "integrity": "corrupt"})


if __name__ == "__main__":
    unittest.main()
