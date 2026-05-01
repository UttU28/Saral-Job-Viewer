from __future__ import annotations

import argparse
import shutil
import sqlite3
import subprocess
from pathlib import Path

from utils.dataManager import createTables, getDatabasePath


PROJECT_ROOT = Path(__file__).resolve().parent
MAIN_DB_PATH = getDatabasePath()
DEFAULT_SOURCE_DB_PATH = PROJECT_ROOT / "otherData.db"
TABLES = ("jobData", "pastData")
REMOTE_HOST_ALIAS = "MidhTech"
REMOTE_TARGET_PATH = "/home/midhtechadmin/Desktop/Saral-Job-Viewer/otherData.db"


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
    createTables(recreate=False)  # Ensure target DB + tables exist.
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


def sendMainDbViaScp() -> None:
    mainResolved = MAIN_DB_PATH.resolve()
    if not mainResolved.exists():
        raise FileNotFoundError(f"Main DB not found: {mainResolved}")
    if shutil.which("scp") is None:
        raise RuntimeError("scp command not found in PATH.")

    remoteSpec = f"{REMOTE_HOST_ALIAS}:{REMOTE_TARGET_PATH}"
    cmd = ["scp", str(mainResolved), remoteSpec]
    print(f"sending: {mainResolved} -> {remoteSpec}")
    subprocess.run(cmd, check=True)
    print("send complete.")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Merge source DB into fixed main DB (jobData + pastData). "
            "If source_db is omitted and --send is not used, defaults to ./otherData.db."
        )
    )
    parser.add_argument(
        "source_db",
        nargs="?",
        help="Path to second DB file (default: ./otherData.db).",
    )
    parser.add_argument(
        "-s",
        "--send",
        action="store_true",
        help="Send main DB via SCP. If source_db is also provided, merge first then send.",
    )
    args = parser.parse_args()
    shouldMerge = bool(args.source_db) or (not args.send)
    if shouldMerge:
        sourcePath = (
            Path(args.source_db).expanduser() if args.source_db else DEFAULT_SOURCE_DB_PATH
        )
        mergeDatabases(sourcePath)
    if args.send:
        sendMainDbViaScp()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
