from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

from fileManagement import resolveJobsOutputDirectory, saveOutputDocument

TARGET_PORTAL_DOMAINS = ("indeed.com", "linkedin.com", "jobright.ai")
ORIGINAL_URL_SKIP_KEY = "skippedOriginalUrlIds"


def domainFromUrl(url: object) -> str:
    if not isinstance(url, str):
        return ""
    raw = url.strip()
    if not raw:
        return ""
    try:
        host = (urlparse(raw).hostname or "").strip(".").lower()
    except Exception:
        return ""
    if host.startswith("www."):
        host = host[4:]
    return host


def isBlockedDomain(host: str) -> bool:
    if not host:
        return False
    for blocked in TARGET_PORTAL_DOMAINS:
        if host == blocked or host.endswith(f".{blocked}"):
            return True
    return False


def pruneFile(path: Path) -> tuple[int, int, int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return 0, 0, 0

    jobs = data.get("jobs")
    if not isinstance(jobs, list):
        jobs = []
        data["jobs"] = jobs

    skipBucket = data.get(ORIGINAL_URL_SKIP_KEY)
    if not isinstance(skipBucket, list):
        skipBucket = []
        data[ORIGINAL_URL_SKIP_KEY] = skipBucket
    existingSkipIds = {str(x).strip() for x in skipBucket if str(x).strip()}
    removed = 0
    addedToSkip = 0
    kept: list[dict] = []

    for job in jobs:
        if not isinstance(job, dict):
            continue

        host = domainFromUrl(job.get("originalJobPostUrl"))
        if not isBlockedDomain(host):
            kept.append(job)
            continue

        removed += 1
        jid = job.get("jobId")
        if isinstance(jid, str) and jid.strip() and jid.strip() not in existingSkipIds:
            cleanId = jid.strip()
            skipBucket.append(cleanId)
            existingSkipIds.add(cleanId)
            addedToSkip += 1

    data["jobs"] = kept
    saveOutputDocument(path, data)
    return removed, addedToSkip, len(kept)


def main() -> None:
    outDir = resolveJobsOutputDirectory()
    files = sorted(outDir.glob("*.json"))
    if not files:
        print(f"No JSON files found in: {outDir}")
        return

    print(f"Scanning {len(files)} file(s) in {outDir} ...")
    totalRemoved = 0
    totalSkipAdded = 0

    for path in files:
        try:
            removed, added, remaining = pruneFile(path)
            totalRemoved += removed
            totalSkipAdded += added
            print(
                f"{path.name}: removed={removed}, skip_added={added}, remaining_jobs={remaining}"
            )
        except Exception as exc:
            print(f"{path.name}: error={exc}")

    print(
        f"Done. total_removed={totalRemoved}, total_skip_ids_added={totalSkipAdded}, "
        f"blocked_domains={', '.join(TARGET_PORTAL_DOMAINS)}"
    )


if __name__ == "__main__":
    main()
