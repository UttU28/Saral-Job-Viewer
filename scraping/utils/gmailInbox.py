from __future__ import annotations

from datetime import datetime, timezone
from email.utils import parseaddr, parsedate_to_datetime

from utils.gmailAuth import getGmailService

UNREAD_PRIMARY_QUERY = "is:unread in:inbox category:primary"
HEADER_NAMES = ("From", "Subject", "Date", "To")
UNREAD_PAGE_SIZE = 200
GMAIL_LIST_MAX = 500


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


def _listUnreadPage(gmail, *, pageSize: int, pageToken: str | None = None) -> dict:
    size = max(1, min(int(pageSize), GMAIL_LIST_MAX))
    kwargs: dict = {
        "userId": "me",
        "q": UNREAD_PRIMARY_QUERY,
        "maxResults": size,
        "fields": "nextPageToken,resultSizeEstimate,messages/id",
        "includeSpamTrash": False,
    }
    if pageToken:
        kwargs["pageToken"] = pageToken
    response = gmail.users().messages().list(**kwargs).execute()
    messageIds: list[str] = []
    for item in response.get("messages") or []:
        msgId = item.get("id")
        if msgId:
            messageIds.append(msgId)
    return {
        "ids": messageIds,
        "nextPageToken": response.get("nextPageToken"),
        "resultSizeEstimate": int(response.get("resultSizeEstimate") or 0),
    }


def _listUnreadMessageIds(gmail, *, maxResults: int = 100) -> list[str]:
    messageIds: list[str] = []
    pageToken: str | None = None

    while True:
        remaining = maxResults - len(messageIds)
        if remaining <= 0:
            break
        page = _listUnreadPage(gmail, pageSize=min(remaining, 100), pageToken=pageToken)
        messageIds.extend(page["ids"])
        if len(messageIds) >= maxResults:
            return messageIds[:maxResults]
        pageToken = page.get("nextPageToken")
        if not pageToken:
            break

    return messageIds


def _loadUnreadMetadata(gmail, msgId: str) -> dict:
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
    return {
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


def countUnreadPrimaryEmails(*, pageSize: int = UNREAD_PAGE_SIZE) -> dict:
    """Exact unread Primary total: walk ID-only list pages (no message bodies)."""
    size = max(1, min(int(pageSize), GMAIL_LIST_MAX))
    gmail = getGmailService()
    total = 0
    pageTokens: list[str | None] = []
    token: str | None = None
    while True:
        listed = _listUnreadPage(gmail, pageSize=size, pageToken=token)
        ids = listed["ids"]
        if not ids:
            break
        pageTokens.append(token)
        total += len(ids)
        token = listed.get("nextPageToken")
        if not token:
            break
    totalPages = len(pageTokens)
    return {
        "query": UNREAD_PRIMARY_QUERY,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "total": total,
        "totalIsEstimate": False,
        "pageSize": size,
        "totalPages": totalPages,
        "pageTokens": pageTokens,
    }


def fetchUnreadPrimaryPage(
    *,
    pageSize: int = UNREAD_PAGE_SIZE,
    pageToken: str | None = None,
    idsOnly: bool = False,
) -> dict:
    """One Gmail list page (up to 200). idsOnly skips message.get for token walking."""
    size = max(1, min(int(pageSize), GMAIL_LIST_MAX))
    gmail = getGmailService()
    listed = _listUnreadPage(gmail, pageSize=size, pageToken=pageToken or None)
    emails: list[dict] = []
    if not idsOnly:
        for msgId in listed["ids"]:
            emails.append(_loadUnreadMetadata(gmail, msgId))
    nextToken = listed.get("nextPageToken")
    return {
        "query": UNREAD_PRIMARY_QUERY,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(emails) if not idsOnly else len(listed["ids"]),
        "emails": emails,
        "ids": listed["ids"],
        "nextPageToken": nextToken,
        "pageSize": size,
        "hasMore": bool(nextToken),
    }


def fetchUnreadPrimaryEmails(*, maxResults: int = 1000) -> dict:
    """List unread Primary inbox messages (metadata only — no LLM)."""
    gmail = getGmailService()
    messageIds = _listUnreadMessageIds(gmail, maxResults=max(1, min(maxResults, 1000)))
    emails = [_loadUnreadMetadata(gmail, msgId) for msgId in messageIds]

    return {
        "query": UNREAD_PRIMARY_QUERY,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(emails),
        "emails": emails,
    }
