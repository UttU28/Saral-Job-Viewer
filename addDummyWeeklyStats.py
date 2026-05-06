#!/usr/bin/env python3
"""
Seed dummy weekly decision stats for a user.

Default target:
  utsavmaan28@gmail.com

Behavior:
  - Inserts/updates exactly the previous 7 weeks (excluding current week)
  - Uses Monday->Sunday week windows
  - Writes docs in userWeeklyStats collection with camelCase fields
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
import argparse

from utils.dataManager import getMongoDb
from utils.userWeeklyStats import USER_WEEKLY_STATS_COLLECTION


def monday_start(dt: datetime) -> datetime:
    return (dt - timedelta(days=dt.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)


def iso_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_user_id(email: str) -> str:
    return f"user_{email.strip().lower()}"


def build_week_doc(*, user_id: str, week_start: datetime, seed: int) -> dict:
    week_end = week_start + timedelta(days=6)
    iso = week_start.isocalendar()
    week_key = f"{iso.year}-W{iso.week:02d}"

    accepted_count = 4 + (seed % 5)
    rejected_count = 2 + (seed % 4)
    total_count = accepted_count + rejected_count

    events: list[dict] = []
    for i in range(accepted_count):
        ts = (week_start + timedelta(days=min(i, 6), hours=9 + (i % 6), minutes=(i * 7) % 60)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        events.append(
            {
                "eventType": "accepted",
                "jobId": f"dummy-accept-{week_key}-{i+1}",
                "delta": 1,
                "timestampIso": ts,
            }
        )
    for i in range(rejected_count):
        ts = (week_start + timedelta(days=min(i + 1, 6), hours=13 + (i % 5), minutes=(i * 11) % 60)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        events.append(
            {
                "eventType": "rejected",
                "jobId": f"dummy-reject-{week_key}-{i+1}",
                "delta": 1,
                "timestampIso": ts,
            }
        )

    now = iso_now()
    return {
        "userId": user_id,
        "weekKey": week_key,
        "weekStartIso": week_start.strftime("%Y-%m-%d"),
        "weekEndIso": week_end.strftime("%Y-%m-%d"),
        "acceptedCount": accepted_count,
        "rejectedCount": rejected_count,
        "totalCount": total_count,
        "events": sorted(events, key=lambda x: x["timestampIso"]),
        "createdAt": now,
        "updatedAt": now,
    }


def seed_last_7_weeks(email: str) -> None:
    user_id = build_user_id(email)
    coll = getMongoDb()[USER_WEEKLY_STATS_COLLECTION]
    coll.create_index([("userId", 1), ("weekKey", 1)], unique=True)

    this_week_monday = monday_start(datetime.now(UTC))
    docs: list[dict] = []

    # Previous 7 weeks only: 1..7 (excluding current week=0)
    for idx in range(1, 8):
        week_start = this_week_monday - timedelta(weeks=idx)
        docs.append(build_week_doc(user_id=user_id, week_start=week_start, seed=idx))

    for doc in docs:
        coll.replace_one({"userId": user_id, "weekKey": doc["weekKey"]}, doc, upsert=True)

    print(f"Seeded {len(docs)} weeks for {email} ({user_id}).")
    print("Weeks:")
    for d in sorted(docs, key=lambda x: x["weekStartIso"], reverse=True):
        print(
            f"  {d['weekKey']}  {d['weekStartIso']}..{d['weekEndIso']}  "
            f"accepted={d['acceptedCount']} rejected={d['rejectedCount']} total={d['totalCount']}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed last 7 weeks of dummy user weekly stats.")
    parser.add_argument(
        "--email",
        default="utsavmaan28@gmail.com",
        help="Target user email (default: utsavmaan28@gmail.com)",
    )
    args = parser.parse_args()
    seed_last_7_weeks(args.email)


if __name__ == "__main__":
    main()

