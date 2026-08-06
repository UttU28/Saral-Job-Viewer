from __future__ import annotations

from datetime import datetime, timezone
from email.utils import parseaddr, parsedate_to_datetime

from utils.gmailAuth import getGmailService

UNREAD_PRIMARY_QUERY = "is:unread in:inbox category:primary"
HEADER_NAMES = ("From", "Subject", "Date", "To")


def _headerMap(payload: dict) -> dict[str, str]:
    headers = payload.get("headers") or []
    return {h.get("name", "").lower(): h.get("value", "") for h in headers if h.get("name")}


def _parseFrom(value: str) -> tuple[str, str]:
    name, addr = parseaddr(value or "")
    return (name or "").strip(), (addr or "").strip()


def _parseDate(value: str) -> str | None:
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError, IndexError, OverflowError):
        return None


def _listUnreadMessageIds(gmail, *, maxResults: int = 100) -> list[str]:
    messageIds: list[str] = []
    pageToken: str | None = None

    while True:
        remaining = maxResults - len(messageIds)
        if remaining <= 0:
            break

        response = (
            gmail.users()
            .messages()
            .list(
                userId="me",
                q=UNREAD_PRIMARY_QUERY,
                maxResults=min(remaining, 100),
                pageToken=pageToken,
            )
            .execute()
        )
        for item in response.get("messages") or []:
            msgId = item.get("id")
            if msgId:
                messageIds.append(msgId)
                if len(messageIds) >= maxResults:
                    return messageIds

        pageToken = response.get("nextPageToken")
        if not pageToken:
            break

    return messageIds


def fetchUnreadPrimaryEmails(*, maxResults: int = 1000) -> dict:
    """List unread Primary inbox messages (metadata only — no LLM)."""
    gmail = getGmailService()
    messageIds = _listUnreadMessageIds(gmail, maxResults=max(1, min(maxResults, 1000)))
    emails: list[dict] = []

    for msgId in messageIds:
        message = (
            gmail.users()
            .messages()
            .get(
                userId="me",
                id=msgId,
                format="metadata",
                metadataHeaders=list(HEADER_NAMES),
            )
            .execute()
        )
        headers = _headerMap(message.get("payload") or {})
        fromName, fromEmail = _parseFrom(headers.get("from", ""))
        emails.append(
            {
                "id": msgId,
                "threadId": message.get("threadId"),
                "fromName": fromName or None,
                "fromEmail": fromEmail or None,
                "subject": (headers.get("subject") or "(no subject)").strip(),
                "snippet": (message.get("snippet") or "").strip(),
                "date": _parseDate(headers.get("date", "")),
                "internalDate": message.get("internalDate"),
                "labelIds": message.get("labelIds") or [],
            }
        )

    return {
        "query": UNREAD_PRIMARY_QUERY,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(emails),
        "emails": emails,
    }
