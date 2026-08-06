from __future__ import annotations

from datetime import datetime, timezone

from utils.gmailAuth import getGmailService

# Gmail inbox tabs outside Primary — delete all (read + unread).
NOISE_CATEGORIES = (
    ("promotions", "category:promotions"),
    ("social", "category:social"),
    ("updates", "category:updates"),
)

BATCH_DELETE_SIZE = 1000
LIST_PAGE_SIZE = 500


def _listAllMessageIds(gmail, *, query: str, maxMessages: int = 50000) -> list[str]:
    messageIds: list[str] = []
    pageToken: str | None = None

    while True:
        remaining = maxMessages - len(messageIds)
        if remaining <= 0:
            break

        response = (
            gmail.users()
            .messages()
            .list(
                userId="me",
                q=query,
                maxResults=min(remaining, LIST_PAGE_SIZE),
                pageToken=pageToken,
                includeSpamTrash=False,
            )
            .execute()
        )
        for item in response.get("messages") or []:
            msgId = item.get("id")
            if msgId:
                messageIds.append(msgId)
                if len(messageIds) >= maxMessages:
                    return messageIds

        pageToken = response.get("nextPageToken")
        if not pageToken:
            break

    return messageIds


def _estimateCount(gmail, *, query: str) -> int:
    """Prefer exact id listing for modest inboxes; fall back to resultSizeEstimate."""
    response = (
        gmail.users()
        .messages()
        .list(
            userId="me",
            q=query,
            maxResults=1,
            includeSpamTrash=False,
        )
        .execute()
    )
    estimate = int(response.get("resultSizeEstimate") or 0)
    if not response.get("messages"):
        return 0
    # resultSizeEstimate is approximate; still useful for UI. For small sets, list ids.
    if estimate <= 500:
        return len(_listAllMessageIds(gmail, query=query, maxMessages=500))
    return estimate


def countNoiseCategoryMail() -> dict:
    """Count mail in Promotions + Social + Updates (any read state)."""
    gmail = getGmailService()
    categories: dict[str, dict] = {}
    total = 0

    for name, query in NOISE_CATEGORIES:
        count = _estimateCount(gmail, query=query)
        categories[name] = {"query": query, "count": count}
        total += count

    return {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "total": total,
        "categories": categories,
    }


def trashNoiseCategoryMail(*, permanent: bool = True) -> dict:
    """
    Delete all Promotions, Social, and Updates mail (read or unread).
    permanent=True uses batchDelete (bypasses Trash). permanent=False moves to Trash.
    """
    gmail = getGmailService(needModify=True)
    categories: dict[str, dict] = {}
    allIds: list[str] = []
    seen: set[str] = set()

    for name, query in NOISE_CATEGORIES:
        ids = _listAllMessageIds(gmail, query=query)
        unique = [msgId for msgId in ids if msgId not in seen]
        for msgId in unique:
            seen.add(msgId)
        categories[name] = {"query": query, "found": len(ids), "unique": len(unique)}
        allIds.extend(unique)

    deleted = 0
    errors: list[str] = []

    for start in range(0, len(allIds), BATCH_DELETE_SIZE):
        chunk = allIds[start : start + BATCH_DELETE_SIZE]
        try:
            if permanent:
                gmail.users().messages().batchDelete(userId="me", body={"ids": chunk}).execute()
            else:
                gmail.users().messages().batchModify(
                    userId="me",
                    body={"ids": chunk, "addLabelIds": ["TRASH"], "removeLabelIds": ["INBOX"]},
                ).execute()
            deleted += len(chunk)
        except Exception as exc:
            errors.append(str(exc))

    return {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "permanent": permanent,
        "requested": len(allIds),
        "deleted": deleted,
        "categories": categories,
        "errors": errors,
    }
