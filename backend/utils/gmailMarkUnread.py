from __future__ import annotations

from datetime import datetime, timezone

from utils.gmailAuth import getGmailService

# Everything still in the mailbox except Trash/Spam that Gmail treats as read.
MARK_UNREAD_QUERY = "is:read -in:trash -in:spam"
BATCH_SIZE = 1000
LIST_PAGE_SIZE = 500
MAX_MESSAGES = 50000


def _listAllMessageIds(gmail, *, query: str, maxMessages: int = MAX_MESSAGES) -> list[str]:
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

    return list(dict.fromkeys(messageIds))


def markAllMailUnread() -> dict:
    """Add UNREAD to every read message outside Trash/Spam."""
    gmail = getGmailService(needModify=True)
    profile = gmail.users().getProfile(userId="me").execute()
    email = profile.get("emailAddress")
    messageIds = _listAllMessageIds(gmail, query=MARK_UNREAD_QUERY)

    marked = 0
    errors: list[str] = []
    for start in range(0, len(messageIds), BATCH_SIZE):
        chunk = messageIds[start : start + BATCH_SIZE]
        try:
            gmail.users().messages().batchModify(
                userId="me",
                body={"ids": chunk, "addLabelIds": ["UNREAD"]},
            ).execute()
            marked += len(chunk)
        except Exception as exc:
            errors.append(str(exc))

    return {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "email": email,
        "query": MARK_UNREAD_QUERY,
        "requested": len(messageIds),
        "markedUnread": marked,
        "truncated": len(messageIds) >= MAX_MESSAGES,
        "errors": errors,
    }
