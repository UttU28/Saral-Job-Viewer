from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from utils.dataManager import getMongoDb

USER_WEEKLY_STATS_COLLECTION = "userWeeklyStats"

DecisionKind = Literal["accept", "reject"]


def _utcNow() -> datetime:
    return datetime.now(UTC)


def _utcNowIso() -> str:
    return _utcNow().strftime("%Y-%m-%dT%H:%M:%SZ")


def _weekWindow(now: datetime) -> tuple[str, str, str]:
    # Monday start (weekday: Monday=0 ... Sunday=6)
    monday = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    sunday = monday + timedelta(days=6)
    iso = monday.isocalendar()
    weekKey = f"{iso.year}-W{iso.week:02d}"
    weekStartIso = monday.strftime("%Y-%m-%d")
    weekEndIso = sunday.strftime("%Y-%m-%d")
    return weekKey, weekStartIso, weekEndIso


def _ensureIndexes() -> None:
    coll = getMongoDb()[USER_WEEKLY_STATS_COLLECTION]
    coll.create_index([("userId", 1), ("weekKey", 1)], unique=True)
    coll.create_index([("userId", 1), ("weekStartIso", -1)])


def _eventDoc(*, eventType: str, jobId: str | None, delta: int) -> dict[str, Any]:
    return {
        "eventType": eventType,
        "jobId": (jobId or "").strip() or None,
        "delta": int(delta),
        "timestampIso": _utcNowIso(),
    }


def incrementWeeklyDecisionCount(*, userId: str, decision: DecisionKind, jobId: str | None) -> None:
    uid = str(userId or "").strip()
    if not uid:
        return
    _ensureIndexes()
    now = _utcNow()
    weekKey, weekStartIso, weekEndIso = _weekWindow(now)
    coll = getMongoDb()[USER_WEEKLY_STATS_COLLECTION]

    if decision == "accept":
        incField = "acceptedCount"
        eventType = "accepted"
    else:
        incField = "rejectedCount"
        eventType = "rejected"

    # Do not put acceptedCount/rejectedCount/totalCount/events in $setOnInsert: MongoDB rejects
    # the same path in $setOnInsert and $inc (or $push) in one update (error 40 path conflict).
    coll.update_one(
        {"userId": uid, "weekKey": weekKey},
        {
            "$setOnInsert": {
                "userId": uid,
                "weekKey": weekKey,
                "weekStartIso": weekStartIso,
                "weekEndIso": weekEndIso,
                "createdAt": _utcNowIso(),
            },
            "$set": {"updatedAt": _utcNowIso()},
            "$inc": {incField: 1, "totalCount": 1},
            "$push": {"events": _eventDoc(eventType=eventType, jobId=jobId, delta=1)},
        },
        upsert=True,
    )


def decrementWeeklyRejectedCount(*, userId: str, jobId: str | None) -> None:
    uid = str(userId or "").strip()
    if not uid:
        return
    _ensureIndexes()
    now = _utcNow()
    weekKey, _, _ = _weekWindow(now)
    coll = getMongoDb()[USER_WEEKLY_STATS_COLLECTION]
    doc = coll.find_one({"userId": uid, "weekKey": weekKey}, {"rejectedCount": 1, "totalCount": 1})
    if not doc:
        return
    rejectedCount = int(doc.get("rejectedCount") or 0)
    totalCount = int(doc.get("totalCount") or 0)
    if rejectedCount <= 0:
        return
    decTotal = 1 if totalCount > 0 else 0
    coll.update_one(
        {"userId": uid, "weekKey": weekKey},
        {
            "$inc": {"rejectedCount": -1, "totalCount": -decTotal},
            "$set": {"updatedAt": _utcNowIso()},
            "$push": {"events": _eventDoc(eventType="rejectedToApply", jobId=jobId, delta=-1)},
        },
    )


def fetchCurrentWeekAcceptedCount(*, userId: str) -> dict[str, Any]:
    """Accepted count for the ISO week that contains *now* (Monday start)."""
    uid = str(userId or "").strip()
    if not uid:
        week_key, week_start_iso, week_end_iso = _weekWindow(_utcNow())
        return {
            "weekKey": week_key,
            "weekStartIso": week_start_iso,
            "weekEndIso": week_end_iso,
            "acceptedCount": 0,
        }
    _ensureIndexes()
    now = _utcNow()
    week_key, week_start_iso, week_end_iso = _weekWindow(now)
    coll = getMongoDb()[USER_WEEKLY_STATS_COLLECTION]
    doc = coll.find_one(
        {"userId": uid, "weekKey": week_key},
        {"acceptedCount": 1},
    )
    accepted = int(doc.get("acceptedCount") or 0) if doc else 0
    return {
        "weekKey": week_key,
        "weekStartIso": week_start_iso,
        "weekEndIso": week_end_iso,
        "acceptedCount": accepted,
    }


def fetchWeeklyReportByUser(*, userId: str) -> dict[str, Any]:
    uid = str(userId or "").strip()
    if not uid:
        return {"weeks": [], "summary": {"acceptedCount": 0, "rejectedCount": 0, "totalCount": 0}}
    _ensureIndexes()
    coll = getMongoDb()[USER_WEEKLY_STATS_COLLECTION]
    rows = list(
        coll.find({"userId": uid}, {"_id": 0}).sort([("weekStartIso", -1), ("createdAt", -1)])
    )

    weeks: list[dict[str, Any]] = []
    acceptedTotal = 0
    rejectedTotal = 0
    total = 0
    for row in rows:
        accepted = int(row.get("acceptedCount") or 0)
        rejected = int(row.get("rejectedCount") or 0)
        countTotal = int(row.get("totalCount") or 0)
        acceptedTotal += accepted
        rejectedTotal += rejected
        total += countTotal
        weeks.append(
            {
                "weekKey": str(row.get("weekKey") or ""),
                "weekStartIso": str(row.get("weekStartIso") or ""),
                "weekEndIso": str(row.get("weekEndIso") or ""),
                "acceptedCount": accepted,
                "rejectedCount": rejected,
                "totalCount": countTotal,
                "updatedAt": str(row.get("updatedAt") or ""),
                "createdAt": str(row.get("createdAt") or ""),
                "events": row.get("events") if isinstance(row.get("events"), list) else [],
            }
        )

    return {
        "weeks": weeks,
        "summary": {
            "acceptedCount": acceptedTotal,
            "rejectedCount": rejectedTotal,
            "totalCount": total,
        },
    }
