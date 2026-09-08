#!/usr/bin/env python3
"""Inbox / label reset helper. One positional arg: 0 or 1.

  1  Mark every Inbox message as READ (Inbox only; do not touch archived labels).
  0  Move all mail on clean labels (read + unread, not Trash) back to Inbox,
     strip those labels, and mark only those moved messages UNREAD.

Uses the same Gmail token as the API (backend/.env + Mongo store).

  cd /home/dedsec995/Desktop/Saral-Job-Viewer/backend
  python scripts/markInboxUnread.py 1 --yes
  python scripts/markInboxUnread.py 0 --yes
  python scripts/markInboxUnread.py 0 --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent


def _venvPython() -> Path | None:
    for candidate in (REPO_ROOT / "venv" / "bin" / "python", ROOT / "venv" / "bin" / "python"):
        if candidate.is_file():
            return candidate
    return None


def _inRepoVenv() -> bool:
    venvRoot = REPO_ROOT / "venv"
    try:
        return Path(sys.prefix).resolve() == venvRoot.resolve()
    except OSError:
        return False


def _reexecWithVenv() -> None:
    if _inRepoVenv():
        return
    venvPy = _venvPython()
    if venvPy is None:
        return
    os.execv(str(venvPy), [str(venvPy), *sys.argv])


_reexecWithVenv()

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv
except ModuleNotFoundError as exc:
    print(
        f"Missing dotenv. Create the repo venv, then rerun:\n"
        f"  python3 -m venv {REPO_ROOT / 'venv'}\n"
        f"  {REPO_ROOT / 'venv' / 'bin' / 'pip'} install -r {ROOT / 'requirements.txt'}\n"
        f"  {REPO_ROOT / 'venv' / 'bin' / 'python'} {Path(__file__).resolve()}",
        flush=True,
    )
    raise SystemExit(1) from exc

load_dotenv(ROOT / ".env", override=False)

try:
    from googleapiclient.errors import HttpError
    from utils.gmailAuth import getGmailService
    from utils.gmailLabels import CLEAN_LABEL_NAMES, CLEAN_LABEL_TRASH, _normalizeLabelName
except ModuleNotFoundError as exc:
    missing = exc.name or "a dependency"
    print(
        f"Missing {missing}. Install backend deps in the repo venv:\n"
        f"  {REPO_ROOT / 'venv' / 'bin' / 'pip'} install -r {ROOT / 'requirements.txt'}",
        flush=True,
    )
    raise SystemExit(1) from exc

BATCH_SIZE = 200
LIST_PAGE_SIZE = 500
BATCH_GAP_SEC = 0.5
MAX_ATTEMPTS = 5
MAX_WAIT_SEC = 12.0
STRIP_LABEL_NAMES = tuple(name for name in CLEAN_LABEL_NAMES if name != CLEAN_LABEL_TRASH)
INBOX_UNREAD_QUERY = "in:inbox is:unread"


def log(message: str) -> None:
    print(message, flush=True)


def gmailHttpStatus(exc: Exception) -> int:
    if isinstance(exc, HttpError):
        try:
            return int(exc.resp.status)
        except (TypeError, ValueError, AttributeError):
            return 0
    return 0


def isRetryable(exc: Exception) -> bool:
    status = gmailHttpStatus(exc)
    if status in {429, 500, 502, 503}:
        return True
    text = str(exc).lower()
    if status == 403 and any(
        token in text for token in ("ratelimit", "rate limit", "quotaexceeded", "userratelimit")
    ):
        return True
    return "ratelimitexceeded" in text or "userratelimitexceeded" in text


def retryAfterSeconds(exc: Exception, fallback: float) -> float:
    wait = fallback
    if isinstance(exc, HttpError):
        try:
            raw = exc.resp.get("retry-after")
        except Exception:
            raw = None
        if raw is not None:
            try:
                wait = max(wait, float(raw))
            except (TypeError, ValueError):
                pass
    return min(wait, MAX_WAIT_SEC)


def executeWithRetry(gmail, request) -> dict:
    delay = 1.0
    lastExc: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return request.execute()
        except Exception as exc:
            lastExc = exc
            if attempt >= MAX_ATTEMPTS or not isRetryable(exc):
                raise
            wait = retryAfterSeconds(exc, delay)
            log(
                f"    rate limited / transient error, waiting {wait:.1f}s "
                f"(attempt {attempt}/{MAX_ATTEMPTS}): {exc}"
            )
            time.sleep(wait)
            delay = min(delay * 2, MAX_WAIT_SEC)
    if lastExc:
        raise lastExc
    return {}


def listMessageIds(gmail, *, query: str, includeSpamTrash: bool) -> list[str]:
    messageIds: list[str] = []
    pageToken: str | None = None
    page = 0

    while True:
        page += 1
        response = executeWithRetry(
            gmail,
            gmail.users()
            .messages()
            .list(
                userId="me",
                q=query,
                maxResults=LIST_PAGE_SIZE,
                pageToken=pageToken,
                includeSpamTrash=includeSpamTrash,
            ),
        )
        for item in response.get("messages") or []:
            msgId = item.get("id")
            if msgId:
                messageIds.append(msgId)
        log(f"    listed {len(messageIds):,}  (page {page})")
        pageToken = response.get("nextPageToken")
        if not pageToken:
            break

    return messageIds


def listAllLabels(gmail) -> list[dict]:
    response = executeWithRetry(gmail, gmail.users().labels().list(userId="me"))
    return list(response.get("labels") or [])


def resolveCleanLabelIds(labels: list[dict]) -> dict[str, str]:
    byNorm: dict[str, dict] = {}
    for label in labels:
        name = label.get("name")
        labelId = label.get("id")
        if not isinstance(name, str) or not labelId:
            continue
        key = _normalizeLabelName(name)
        if (label.get("type") or "").lower() == "user" or key not in byNorm:
            byNorm[key] = label

    resolved: dict[str, str] = {}
    for name in STRIP_LABEL_NAMES:
        match = byNorm.get(_normalizeLabelName(name))
        if match and match.get("id"):
            resolved[name] = str(match["id"])
    return resolved


def userLabelIds(labels: list[dict], *, skipNames: tuple[str, ...] = ()) -> list[str]:
    skip = {_normalizeLabelName(name) for name in skipNames}
    ids: list[str] = []
    for label in labels:
        if (label.get("type") or "").lower() != "user":
            continue
        name = label.get("name")
        if isinstance(name, str) and _normalizeLabelName(name) in skip:
            continue
        labelId = label.get("id")
        if labelId:
            ids.append(str(labelId))
    return list(dict.fromkeys(ids))


def batchModify(
    gmail,
    chunk: list[str],
    *,
    addIds: list[str],
    removeIds: list[str],
) -> None:
    body: dict = {"ids": chunk}
    if addIds:
        body["addLabelIds"] = addIds
    if removeIds:
        body["removeLabelIds"] = removeIds
    executeWithRetry(
        gmail,
        gmail.users().messages().batchModify(userId="me", body=body),
    )


def runBatches(
    gmail,
    messageIds: list[str],
    *,
    batchSize: int,
    addIds: list[str],
    removeIds: list[str],
    action: str,
) -> tuple[int, int]:
    if not messageIds:
        return 0, 0
    batches = (len(messageIds) + batchSize - 1) // batchSize
    marked = 0
    errors = 0
    log(f"{action} in {batches} batches of {batchSize}…")
    for start in range(0, len(messageIds), batchSize):
        chunk = messageIds[start : start + batchSize]
        batchIndex = start // batchSize + 1
        try:
            batchModify(gmail, chunk, addIds=addIds, removeIds=removeIds)
            marked += len(chunk)
            log(f"  [{batchIndex}/{batches}] {len(chunk):<3}  ({marked:,}/{len(messageIds):,})  ok")
        except Exception as exc:
            errors += len(chunk)
            log(f"  [{batchIndex}/{batches}] FAILED {len(chunk)} messages: {exc}")
        if start + batchSize < len(messageIds):
            time.sleep(BATCH_GAP_SEC)
    return marked, errors


def confirm(message: str, *, skip: bool, count: int) -> bool:
    if skip or count == 0:
        return True
    log("")
    log(message)
    answer = input("Type YES to continue: ").strip()
    return answer == "YES"


def modeMarkInboxRead(gmail, *, batchSize: int, dryRun: bool, skipConfirm: bool) -> int:
    log(f"Mode 1: mark Inbox unread mail as READ.")
    log(f"Query: {INBOX_UNREAD_QUERY}")
    log("Listing Inbox unread…")
    try:
        uniqueIds = list(dict.fromkeys(listMessageIds(gmail, query=INBOX_UNREAD_QUERY, includeSpamTrash=False)))
    except Exception as exc:
        log(f"Failed to list inbox: {exc}")
        return 1

    log(f"Found {len(uniqueIds):,} Inbox unread messages.")
    if dryRun:
        log("Dry run — nothing modified.")
        return 0
    if not confirm(
        f"About to mark {len(uniqueIds):,} Inbox messages READ in batches of {batchSize}.",
        skip=skipConfirm,
        count=len(uniqueIds),
    ):
        log("Aborted.")
        return 1
    if not uniqueIds:
        log("Nothing to do.")
        return 0

    marked, errors = runBatches(
        gmail,
        uniqueIds,
        batchSize=batchSize,
        addIds=[],
        removeIds=["UNREAD"],
        action="Marking Inbox READ",
    )
    log("")
    log(f"Done. markedRead={marked:,}  errors={errors:,}  total={len(uniqueIds):,}")
    return 1 if errors else 0


def modeRestoreLabeled(gmail, *, batchSize: int, dryRun: bool, skipConfirm: bool) -> int:
    log("Mode 0: move labeled mail (read+unread) to Inbox, strip labels, mark those UNREAD.")
    log("Loading Gmail labels…")
    try:
        labels = listAllLabels(gmail)
    except Exception as exc:
        log(f"Failed to list labels: {exc}")
        return 1

    resolved = resolveCleanLabelIds(labels)
    if not resolved:
        log("No clean labels found on this account.")
        return 1

    for name in STRIP_LABEL_NAMES:
        log(f"  {name}: {resolved.get(name) or '(missing)'}")
    log(f"  {CLEAN_LABEL_TRASH}: skipped")

    removeIds = userLabelIds(labels, skipNames=(CLEAN_LABEL_TRASH,))
    log(f"Will remove {len(removeIds)} user labels (not Trash); add INBOX, UNREAD, CATEGORY_PERSONAL.")

    seen: set[str] = set()
    uniqueIds: list[str] = []
    log("Listing messages on clean labels (not Trash)…")
    for name in STRIP_LABEL_NAMES:
        log(f"  {name}")
        try:
            ids = listMessageIds(
                gmail,
                query=f"label:{name} -in:trash",
                includeSpamTrash=False,
            )
        except Exception as exc:
            log(f"    failed to list {name}: {exc}")
            continue
        added = 0
        for msgId in ids:
            if msgId in seen:
                continue
            seen.add(msgId)
            uniqueIds.append(msgId)
            added += 1
        log(f"    unique +{added:,}  (running total {len(uniqueIds):,})")

    log(f"Found {len(uniqueIds):,} unique labeled messages to restore.")
    if dryRun:
        log("Dry run — nothing modified.")
        return 0
    if not confirm(
        f"Labels: {', '.join(STRIP_LABEL_NAMES)}\n"
        f"About to strip labels, move {len(uniqueIds):,} messages to Inbox/Primary, "
        f"and mark those UNREAD in batches of {batchSize}.",
        skip=skipConfirm,
        count=len(uniqueIds),
    ):
        log("Aborted.")
        return 1
    if not uniqueIds:
        log("Nothing to do.")
        return 0

    marked, errors = runBatches(
        gmail,
        uniqueIds,
        batchSize=batchSize,
        addIds=["INBOX", "UNREAD", "CATEGORY_PERSONAL"],
        removeIds=removeIds,
        action="Stripping + Inbox + UNREAD",
    )
    log("")
    log(f"Done. movedUnread={marked:,}  errors={errors:,}  total={len(uniqueIds):,}")
    return 1 if errors else 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="0 = restore labeled mail to Inbox unread. 1 = mark Inbox unread as read.",
    )
    parser.add_argument(
        "mode",
        type=int,
        choices=(0, 1),
        help="1 = mark all Inbox mail READ. 0 = move labeled mail to Inbox, strip labels, mark those UNREAD.",
    )
    parser.add_argument("--yes", action="store_true", help="Skip the YES confirmation prompt.")
    parser.add_argument("--dry-run", action="store_true", help="List IDs only; do not modify Gmail.")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=BATCH_SIZE,
        help=f"Messages per Gmail batchModify (default {BATCH_SIZE}, max 1000).",
    )
    args = parser.parse_args()
    batchSize = max(1, min(int(args.batch_size), 1000))

    log("Connecting to Gmail…")
    try:
        gmail = getGmailService(needModify=not args.dry_run)
    except Exception as exc:
        log(f"Failed to connect: {exc}")
        return 1

    try:
        profile = gmail.users().getProfile(userId="me").execute()
        log(f"Connected as {profile.get('emailAddress') or '(unknown)'}")
    except Exception as exc:
        log(f"Connected, but could not read profile: {exc}")

    if args.mode == 1:
        return modeMarkInboxRead(gmail, batchSize=batchSize, dryRun=args.dry_run, skipConfirm=args.yes)
    return modeRestoreLabeled(gmail, batchSize=batchSize, dryRun=args.dry_run, skipConfirm=args.yes)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        log("\nInterrupted.")
        raise SystemExit(130)
