from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from email.utils import getaddresses

from utils.gmailAuth import getGmailService
from utils.gmailConfig import DEFAULT_SENT_SINCE
from utils.placetrackStore import loadSentRecipientsCache, saveSentRecipientsCache

EMAIL_IN_HEADER = re.compile(r"[\w.+-]+@[\w.-]+\.\w+", re.IGNORECASE)
HEADER_NAMES = ("To", "Cc", "Bcc")


def _sinceToGmailQuery(since: str) -> str:
    parsed = datetime.strptime(since, "%Y-%m-%d")
    return f"in:sent after:{parsed.year}/{parsed.month}/{parsed.day}"


def _normalizeEmail(value: str) -> str:
    return value.strip().lower()


def _extractEmailsFromHeader(value: str) -> set[str]:
    emails: set[str] = set()
    for _, addr in getaddresses([value or ""]):
        if addr and "@" in addr:
            emails.add(_normalizeEmail(addr))
    for match in EMAIL_IN_HEADER.findall(value or ""):
        emails.add(_normalizeEmail(match))
    return emails


def _headerMap(payload: dict) -> dict[str, str]:
    headers = payload.get("headers") or []
    return {h.get("name", "").lower(): h.get("value", "") for h in headers if h.get("name")}


def _loadCache() -> dict | None:
    return loadSentRecipientsCache()


def _saveCache(payload: dict) -> None:
    saveSentRecipientsCache(payload)


def fetchSentRecipientEmails(since: str = DEFAULT_SENT_SINCE, *, refresh: bool = False) -> dict:
    if not refresh:
        cached = _loadCache()
        if cached and cached.get("since") == since:
            return cached

    gmail = getGmailService()
    query = _sinceToGmailQuery(since)
    recipients: set[str] = set()
    messageIds: list[str] = []
    pageToken: str | None = None

    while True:
        response = (
            gmail.users()
            .messages()
            .list(userId="me", q=query, maxResults=500, pageToken=pageToken)
            .execute()
        )
        for item in response.get("messages") or []:
            msgId = item.get("id")
            if msgId:
                messageIds.append(msgId)
        pageToken = response.get("nextPageToken")
        if not pageToken:
            break

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
        for name in HEADER_NAMES:
            recipients.update(_extractEmailsFromHeader(headers.get(name.lower(), "")))

    result = {
        "since": since,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "messageCount": len(messageIds),
        "recipientCount": len(recipients),
        "recipients": sorted(recipients),
    }
    _saveCache(result)
    return result
