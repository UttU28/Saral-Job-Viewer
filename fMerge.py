from __future__ import annotations

import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

from utils.dataManager import createTables, getDatabasePath

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore[misc, assignment]

PROJECT_ROOT = Path(__file__).resolve().parent
if load_dotenv is not None:
    load_dotenv(PROJECT_ROOT / ".env", override=False)

MAIN_DB_PATH = getDatabasePath()
TABLES = ("jobData", "pastData")

# Remote side of scp: SSH config Host name, or user@IP (bypasses flaky DNS/alias).
# Example: SARAL_MERGE_SSH=midhtechadmin@192.168.1.149
# Or keep Host MidhTech in ~/.ssh/config and set SARAL_MERGE_SSH=MidhTech (default).
REMOTE_SSH = (os.environ.get("SARAL_MERGE_SSH") or "MidhTech").strip()
# Canonical DB on the SSH host (same layout as local zata/saralJobViewer.db).
REMOTE_DB_PATH = "/home/midhtechadmin/Desktop/Saral-Job-Viewer/zata/saralJobViewer.db"
TEMP_REMOTE_SNAPSHOT = MAIN_DB_PATH.parent / ".remote_pull_for_merge.db"


def _requireScp() -> None:
    if shutil.which("scp") is None:
        raise RuntimeError("scp not found in PATH.")


def _remoteSpec() -> str:
    return f"{REMOTE_SSH}:{REMOTE_DB_PATH}"


def tableExists(connection: sqlite3.Connection, schema: str, table: str) -> bool:
    row = connection.execute(
        f"SELECT 1 FROM {schema}.sqlite_master WHERE type='table' AND name=? LIMIT 1",
        (table,),
    ).fetchone()
    return bool(row)


def tableColumns(connection: sqlite3.Connection, schema: str, table: str) -> list[str]:
    rows = connection.execute(f"PRAGMA {schema}.table_info({table})").fetchall()
    return [str(r[1]) for r in rows if len(r) > 1]


def mergeTable(connection: sqlite3.Connection, table: str) -> int:
    if not tableExists(connection, "src", table):
        print(f"skip: source table missing -> {table}")
        return 0
    if not tableExists(connection, "main", table):
        print(f"skip: target table missing -> {table}")
        return 0

    targetColumns = tableColumns(connection, "main", table)
    sourceColumns = tableColumns(connection, "src", table)
    commonColumns = [c for c in targetColumns if c in sourceColumns]
    if "jobId" not in commonColumns:
        print(f"skip: no jobId column overlap -> {table}")
        return 0

    insertColumns = ", ".join(commonColumns)
    selectColumns = ", ".join(f"src.{table}.{col}" for col in commonColumns)
    updateColumns = [col for col in commonColumns if col != "jobId"]

    before = connection.total_changes
    insertSql = f"""
        INSERT OR IGNORE INTO main.{table} ({insertColumns})
        SELECT {selectColumns}
        FROM src.{table}
    """
    connection.execute(insertSql)

    if updateColumns:
        updateSet = ", ".join(
            f"""{col} = COALESCE(
                (SELECT s.{col} FROM src.{table} s WHERE s.jobId = main.{table}.jobId),
                main.{table}.{col}
            )"""
            for col in updateColumns
        )
        updateSql = f"""
            UPDATE main.{table}
            SET {updateSet}
            WHERE EXISTS (
                SELECT 1 FROM src.{table} s WHERE s.jobId = main.{table}.jobId
            )
        """
        connection.execute(updateSql)
    return connection.total_changes - before


def mergeDatabases(sourceDbPath: Path) -> None:
    createTables(recreate=False)
    if not sourceDbPath.exists():
        raise FileNotFoundError(f"Source DB not found: {sourceDbPath}")

    mainResolved = MAIN_DB_PATH.resolve()
    sourceResolved = sourceDbPath.resolve()
    if sourceResolved == mainResolved:
        raise ValueError("Source DB must be different from the fixed main DB.")

    with sqlite3.connect(mainResolved) as connection:
        connection.execute("ATTACH DATABASE ? AS src", (str(sourceResolved),))
        try:
            total = 0
            for table in TABLES:
                changed = mergeTable(connection, table)
                total += changed
                print(f"{table}: {changed} row change(s)")
            connection.commit()
            print(f"done: merged from {sourceResolved} into {mainResolved} ({total} total changes)")
        finally:
            connection.execute("DETACH DATABASE src")


def pullRemoteReplaceLocal() -> None:
    """Download remote saralJobViewer.db and replace local file entirely."""
    _requireScp()
    main = MAIN_DB_PATH.resolve()
    main.parent.mkdir(parents=True, exist_ok=True)
    if main.exists():
        main.unlink()
    spec = _remoteSpec()
    print(f"pull (replace local): {spec} -> {main}")
    subprocess.run(["scp", spec, str(main)], check=True)
    print("Local DB replaced with remote copy.")


def pullMergePushRemote() -> None:
    """Pull remote DB, merge into local, push merged file back to remote (replace)."""
    _requireScp()
    createTables(recreate=False)
    temp = TEMP_REMOTE_SNAPSHOT.resolve()
    spec = _remoteSpec()
    try:
        print(f"pull: {spec} -> {temp}")
        subprocess.run(["scp", spec, str(temp)], check=True)
        mergeDatabases(temp)
        print(f"push: {MAIN_DB_PATH.resolve()} -> {spec}")
        subprocess.run(["scp", str(MAIN_DB_PATH.resolve()), spec], check=True)
        print("Remote DB replaced with merged copy.")
    finally:
        temp.unlink(missing_ok=True)


def pushLocalReplaceRemote() -> None:
    """Upload local saralJobViewer.db and replace remote file (no merge)."""
    _requireScp()
    main = MAIN_DB_PATH.resolve()
    if not main.exists():
        raise FileNotFoundError(f"Local DB not found: {main}")
    spec = _remoteSpec()
    print(f"push: {main} -> {spec}")
    subprocess.run(["scp", str(main), spec], check=True)
    print("Remote DB replaced with local copy.")


def promptChoice() -> str | None:
    print()
    print("  1  Pull remote DB → delete local DB → replace with remote copy")
    print("  2  Pull remote → merge into local → push merged DB to remote (replace there)")
    print("  3  Push local DB → replace remote (no pull / no merge)")
    print("  q  Quit")
    while True:
        raw = input("Choose 1, 2, 3, or q: ").strip().lower()
        if raw in ("q", "quit", ""):
            return None
        if raw in ("1", "2", "3"):
            return raw
        print("Invalid choice. Enter 1, 2, 3, or q.")


def main() -> int:
    choice = promptChoice()
    if choice is None:
        print("Cancelled.")
        return 0
    try:
        if choice == "1":
            pullRemoteReplaceLocal()
        elif choice == "2":
            pullMergePushRemote()
        else:
            pushLocalReplaceRemote()
    except subprocess.CalledProcessError as exc:
        print(f"Command failed (exit {exc.returncode}).", file=sys.stderr)
        return exc.returncode or 1
    except (OSError, RuntimeError, ValueError) as exc:
        print(exc, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
