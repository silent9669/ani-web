#!/usr/bin/env python3
"""Read-only SQLite snapshots and deployment data-regression checks."""

from __future__ import annotations

import argparse
import json
import pathlib
import sqlite3
import sys
from typing import Any


COUNT_QUERIES = {
    "users": "SELECT count(*) FROM users",
    "favorites": "SELECT count(*) FROM user_favorites",
    "history": "SELECT count(*) FROM user_history",
}


def snapshot(path: pathlib.Path) -> dict[str, Any]:
    if not path.exists():
        return {"exists": False}

    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as database:
        result: dict[str, Any] = {
            "exists": True,
            "integrity": database.execute("PRAGMA integrity_check").fetchone()[0],
        }
        for name, query in COUNT_QUERIES.items():
            result[name] = database.execute(query).fetchone()[0]
        return result


def verify(before: dict[str, Any], after: dict[str, Any]) -> None:
    if before.get("exists") and not after.get("exists"):
        raise ValueError("database disappeared after deployment")
    if after.get("exists") and after.get("integrity") != "ok":
        raise ValueError("database integrity check failed after deployment")
    for key in COUNT_QUERIES:
        if after.get(key, 0) < before.get(key, 0):
            raise ValueError(f"database row count decreased for {key}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    snapshot_parser = subparsers.add_parser("snapshot")
    snapshot_parser.add_argument("database", type=pathlib.Path)

    verify_parser = subparsers.add_parser("verify")
    verify_parser.add_argument("before")
    verify_parser.add_argument("after")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.command == "snapshot":
            print(json.dumps(snapshot(args.database), sort_keys=True))
        else:
            verify(json.loads(args.before), json.loads(args.after))
    except (json.JSONDecodeError, sqlite3.Error, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
