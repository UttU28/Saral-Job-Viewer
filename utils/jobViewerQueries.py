from __future__ import annotations

import re
from typing import Any

from utils.dataManager import (
    JOB_DATA_COLLECTION,
    createTables,
    getMongoDb,
    jobDataApplyStatusSummary,
)

_listingIndexesEnsured = False


def ensureJobListingIndexes() -> None:
    global _listingIndexesEnsured
    if _listingIndexesEnsured:
        return
    createTables(recreate=False)
    jobCol = getMongoDb()[JOB_DATA_COLLECTION]
    jobCol.create_index([("platform", 1), ("applyStatus", 1)])
    jobCol.create_index([("timestamp", 1), ("jobId", 1)])
    _listingIndexesEnsured = True


def escapeRegex(needle: str) -> str:
    return re.escape(needle)


def buildMatchStage(
    platform: str | None,
    applyStatus: str | None,
    search: str | None,
) -> dict[str, Any]:
    matchClauses: list[dict[str, Any]] = []
    if platform and str(platform).strip():
        matchClauses.append({"platform": str(platform).strip()})
    if applyStatus and str(applyStatus).strip():
        raw = str(applyStatus).strip().lower()
        if raw == "pending":
            matchClauses.append(
                {
                    "$or": [
                        {"applyStatus": None},
                        {"applyStatus": ""},
                        {"applyStatus": {"$exists": False}},
                    ]
                }
            )
        else:
            matchClauses.append({"applyStatus": str(applyStatus).strip()})
    if search and str(search).strip():
        safe = escapeRegex(str(search).strip())
        matchClauses.append(
            {
                "$or": [
                    {"title": {"$regex": safe, "$options": "i"}},
                    {"companyName": {"$regex": safe, "$options": "i"}},
                    {"jobId": {"$regex": safe, "$options": "i"}},
                ]
            }
        )
    if not matchClauses:
        return {}
    if len(matchClauses) == 1:
        return matchClauses[0]
    return {"$and": matchClauses}


def normalizeJobListDoc(doc: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "jobId",
        "title",
        "jobUrl",
        "location",
        "employmentType",
        "workModel",
        "seniority",
        "experience",
        "originalJobPostUrl",
        "companyName",
        "timestamp",
        "applyStatus",
        "platform",
    )
    out: dict[str, Any] = {}
    for key in keys:
        val = doc.get(key)
        if val is None:
            out[key] = None
        elif key == "applyStatus" and val == "":
            out[key] = ""
        else:
            out[key] = val if isinstance(val, str) else str(val)
    return out


def fetchJobDataPage(
    *,
    page: int,
    pageSize: int,
    platform: str | None = None,
    applyStatus: str | None = None,
    search: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """
    One aggregation: match → FIFO sort (same as sortJobsFifoByTimestamp) → facet skip/limit + count.
    Drops jobDescription and _id from list payloads to keep responses light.
    """
    ensureJobListingIndexes()
    createTables(recreate=False)
    jobCol = getMongoDb()[JOB_DATA_COLLECTION]
    matchStage = buildMatchStage(platform, applyStatus, search)
    aggPipeline: list[dict[str, Any]] = []
    if matchStage:
        aggPipeline.append({"$match": matchStage})
    aggPipeline.extend(
        [
            {
                "$addFields": {
                    "_tsEmpty": {
                        "$cond": {
                            "if": {
                                "$or": [
                                    {"$eq": [{"$ifNull": ["$timestamp", ""]}, ""]},
                                    {"$eq": ["$timestamp", None]},
                                ]
                            },
                            "then": 1,
                            "else": 0,
                        }
                    }
                }
            },
            {"$sort": {"_tsEmpty": 1, "timestamp": 1, "jobId": 1}},
            {
                "$facet": {
                    "data": [
                        {"$skip": max(0, (page - 1) * pageSize)},
                        {"$limit": pageSize},
                        {
                            "$project": {
                                "_id": 0,
                                "jobDescription": 0,
                                "_tsEmpty": 0,
                            }
                        },
                    ],
                    "total": [{"$count": "n"}],
                }
            },
        ]
    )
    aggResult = list(jobCol.aggregate(aggPipeline))
    if not aggResult:
        return [], 0
    facetResult = aggResult[0]
    rawRows = facetResult.get("data") or []
    totalArr = facetResult.get("total") or []
    totalCount = int(totalArr[0]["n"]) if totalArr else 0
    normalizedRows = [normalizeJobListDoc(row) for row in rawRows]
    return normalizedRows, totalCount


def fetchDistinctPlatforms() -> list[str]:
    ensureJobListingIndexes()
    createTables(recreate=False)
    jobCol = getMongoDb()[JOB_DATA_COLLECTION]
    values = jobCol.distinct("platform")
    out = sorted(
        {str(v).strip() for v in values if v is not None and str(v).strip()},
        key=str.lower,
    )
    return out


def fetchJobSummaryCamel() -> dict[str, int]:
    raw = jobDataApplyStatusSummary()
    return {
        "total": int(raw["total"]),
        "nullPending": int(raw["nullPending"]),
        "apply": int(raw["apply"]),
        "doNotApply": int(raw["doNotApply"]),
        "existing": int(raw["existing"]),
        "otherStatus": int(raw["otherStatus"]),
        "pastDataRows": int(raw["pastDataRows"]),
    }


def fetchJobDetailByJobId(jobId: str) -> dict[str, Any] | None:
    jid = str(jobId or "").strip()
    if not jid:
        return None
    createTables(recreate=False)
    jobCol = getMongoDb()[JOB_DATA_COLLECTION]
    doc = jobCol.find_one({"jobId": jid}, projection={"_id": 0})
    if not doc:
        return None
    row = normalizeJobListDoc(doc)
    row["jobDescription"] = str(doc.get("jobDescription") or "")
    return row
