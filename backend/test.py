#!/usr/bin/env python3
"""
Reassign jobData rows from category "devops" to random scraper search keywords.

Reads SCRAPER_SEARCH_KEYWORDS from .env (comma-separated). Each matching job
gets one keyword chosen at random.

Usage (repo root):
  python test.py
  python test.py --dry-run
  python test.py --seed 42
"""
from __future__ import annotations

import argparse
import os
import random
import re
from collections import Counter

from dotenv import load_dotenv
from pathlib import Path
from pymongo import UpdateOne

_REPO_ROOT = Path(__file__).resolve().parent
load_dotenv(_REPO_ROOT / ".env", override=True)

from utils.dataManager import JOB_DATA_COLLECTION, createTables, getMongoDb  # noqa: E402

SOURCE_CATEGORY = "devops"

DEFAULT_KEYWORDS: tuple[str, ...] = (
    "devops",
    "cloud engineer",
    "site reliability engineer",
    "database administrator",
    "platform engineer",
    "data engineer",
)


def parse_scraper_keywords() -> list[str]:
    raw = (os.getenv("SCRAPER_SEARCH_KEYWORDS") or "").strip()
    if not raw:
        return list(DEFAULT_KEYWORDS)
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in ('"', "'"):
        raw = raw[1:-1].strip()
    keywords = [part.strip() for part in raw.split(",") if part.strip()]
    return keywords or list(DEFAULT_KEYWORDS)


def find_devops_jobs(coll) -> list[dict]:
    """Rows whose category is exactly devops (case-insensitive)."""
    return list(
        coll.find(
            {
                "category": {
                    "$regex": f"^{re.escape(SOURCE_CATEGORY)}$",
                    "$options": "i",
                }
            }
        )
    )


def bump_job_caches() -> None:
    try:
        from utils.redisCache import bumpJobsListVersion, deleteCacheKey, keyJobCategories

        deleteCacheKey(keyJobCategories())
        bumpJobsListVersion()
    except Exception:
        pass


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            f'Randomly reassign jobData.category from "{SOURCE_CATEGORY}" '
            "to one of SCRAPER_SEARCH_KEYWORDS."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print assignment plan only; do not write to MongoDB.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="RNG seed for reproducible random assignment.",
    )
    args = parser.parse_args()

    keywords = parse_scraper_keywords()
    if not keywords:
        print("error: no keywords in SCRAPER_SEARCH_KEYWORDS")
        return 1

    if args.seed is not None:
        random.seed(args.seed)

    createTables(recreate=False)
    coll = getMongoDb()[JOB_DATA_COLLECTION]
    rows = find_devops_jobs(coll)
    print(f"Keywords pool ({len(keywords)}): {', '.join(keywords)}")
    print(f'Jobs with category "{SOURCE_CATEGORY}": {len(rows)}')

    if not rows:
        return 0

    counts: Counter[str] = Counter()
    ops: list[UpdateOne] = []
    for doc in rows:
        new_category = random.choice(keywords)
        counts[new_category] += 1
        ops.append(
            UpdateOne(
                {"_id": doc["_id"]},
                {"$set": {"category": new_category}},
            )
        )

    print("Planned distribution:")
    for kw in keywords:
        print(f"  {kw}: {counts[kw]}")

    if args.dry_run:
        print("dry-run: no changes written.")
        return 0

    result = coll.bulk_write(ops, ordered=False)
    bump_job_caches()
    print(f"Modified: {result.modified_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
