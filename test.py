"""
Dev utility: clear applyStatus on every row in jobData (sets NULL).
Run from project root: python test.py
"""

from __future__ import annotations

import sqlite3

from utils.dataManager import createTables, getDatabasePath


def clear_all_apply_status() -> int:
    createTables(recreate=False)
    db_path = getDatabasePath()
    with sqlite3.connect(db_path) as conn:
        cur = conn.cursor()
        cur.execute("UPDATE jobData SET applyStatus = NULL")
        conn.commit()
        return cur.rowcount


if __name__ == "__main__":
    n = clear_all_apply_status()
    print(f"Cleared applyStatus on {n} row(s) in {getDatabasePath()}.")
