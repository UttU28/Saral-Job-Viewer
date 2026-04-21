from __future__ import annotations

import json
import os
from pathlib import Path

# Project root = folder containing this file (the ``sc`` repo).
_PROJECT_ROOT = Path(__file__).resolve().parent


def resolveJobsOutputDirectory() -> Path:
    raw = os.getenv("OUTPUT_DIR", "output")
    name = (raw or "output").strip() or "output"
    d = Path(name)
    if not d.is_absolute():
        d = _PROJECT_ROOT / d
    d.mkdir(parents=True, exist_ok=True)
    return d


def resolveOutputJsonPath(path: Path | str) -> Path:
    p = Path(path)
    if not str(p).strip():
        raise ValueError("Jobs JSON path must not be empty.")
    if p.is_absolute():
        return p.expanduser().resolve()
    return (resolveJobsOutputDirectory() / p).resolve()


def atomicWriteText(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def saveJsonPayload(path: Path, payload: object) -> tuple[bool, str]:
    try:
        obj: object = payload
        if not isinstance(obj, (dict, list)):
            obj = {"data": payload}
        atomicWriteText(
            path, json.dumps(obj, indent=2, ensure_ascii=False) + "\n"
        )
    except (OSError, TypeError) as exc:
        return False, f"Failed to save JSON: {exc}"
    return True, f"Saved JSON response to {path}"


def loadExistingJobsAndMeta(outputPath: Path) -> tuple[list[dict], dict]:
    if not outputPath.is_file():
        return [], {}
    try:
        data = json.loads(outputPath.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return [], {}
    if not isinstance(data, dict):
        return [], {}
    jobs = data.get("jobs")
    if not isinstance(jobs, list):
        jobs = []
    clean_jobs: list[dict] = [j for j in jobs if isinstance(j, dict)]
    meta = {k: v for k, v in data.items() if k not in ("jobs", "count")}
    return clean_jobs, meta


def loadJobsDocumentOrEmpty(path: Path) -> dict:
    if not path.is_file():
        return {"jobs": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"jobs": []}
    if not isinstance(data, dict):
        return {"jobs": []}
    jobs = data.get("jobs")
    if not isinstance(jobs, list):
        data["jobs"] = []
    return data


def mergeJobListsById(
    existing: list[dict],
    incoming: list[dict],
    *,
    id_key: str = "jobId",
) -> tuple[list[dict], int, int]:
    seen: set[str] = set()
    for j in existing:
        jid = j.get(id_key)
        if isinstance(jid, str) and jid:
            seen.add(jid)

    appended: list[dict] = []
    skipped = 0
    for j in incoming:
        if not isinstance(j, dict):
            skipped += 1
            continue
        jid = j.get(id_key)
        if not jid or not isinstance(jid, str):
            skipped += 1
            continue
        if jid in seen:
            skipped += 1
            continue
        seen.add(jid)
        appended.append(j)

    return existing + appended, skipped, len(appended)


def mergeNewJobsIntoDocument(
    data: dict,
    new_rows: list[dict],
    *,
    id_key: str = "jobId",
) -> tuple[int, int]:
    jobs = data.setdefault("jobs", [])
    if not isinstance(jobs, list):
        data["jobs"] = []
        jobs = data["jobs"]
    seen = {j.get(id_key) for j in jobs if isinstance(j, dict) and j.get(id_key)}
    added = 0
    skipped = 0
    for row in new_rows:
        if not isinstance(row, dict):
            skipped += 1
            continue
        jid = row.get(id_key)
        if not jid or jid in seen:
            skipped += 1
            continue
        jobs.append(row)
        seen.add(jid)
        added += 1
    return added, skipped


def saveOutputDocument(path: Path, data: dict) -> None:
    jobs = data.get("jobs")
    if isinstance(jobs, list):
        data["count"] = len(jobs)
    atomicWriteText(path, json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def loadOutputDocument(path: Path | str) -> tuple[Path, dict]:
    p = resolveOutputJsonPath(path)
    if not p.is_file():
        raise FileNotFoundError(f"Jobs JSON not found: {p.resolve()}")
    data = json.loads(p.read_text(encoding="utf-8"))
    jobs = data.get("jobs")
    if not isinstance(jobs, list) or not jobs:
        raise ValueError("JSON must contain a non-empty 'jobs' array")
    return p, data


# Backwards-compatible name used by Jobright fetch merge.
mergeFetchedJobs = mergeJobListsById
