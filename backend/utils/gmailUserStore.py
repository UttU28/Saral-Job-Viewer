from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from utils.dataManager import MongoUnavailableError, getMongoDb

GMAIL_USER_CREDENTIALS_COLLECTION = "gmailUserCredentials"
GMAIL_OAUTH_SESSIONS_COLLECTION = "gmailOAuthSessions"
OAUTH_SESSION_TTL_MINUTES = 20

_indexesEnsured = False


def _utcNow() -> datetime:
    return datetime.now(timezone.utc)


def _utcNowIso() -> str:
    return _utcNow().strftime("%Y-%m-%dT%H:%M:%SZ")


def ensureGmailUserStores(*, recreate: bool = False) -> None:
    global _indexesEnsured
    if _indexesEnsured and not recreate:
        return
    try:
        db = getMongoDb()
        if recreate:
            names = set(db.list_collection_names())
            if GMAIL_USER_CREDENTIALS_COLLECTION in names:
                db[GMAIL_USER_CREDENTIALS_COLLECTION].drop()
            if GMAIL_OAUTH_SESSIONS_COLLECTION in names:
                db[GMAIL_OAUTH_SESSIONS_COLLECTION].drop()
        creds = db[GMAIL_USER_CREDENTIALS_COLLECTION]
        sessions = db[GMAIL_OAUTH_SESSIONS_COLLECTION]
        creds.create_index("userId", unique=True)
        sessions.create_index("expiresAt", expireAfterSeconds=0)
        try:
            from utils.placetrackStore import clearGmailToken

            clearGmailToken()
        except Exception:
            pass
        _indexesEnsured = True
    except MongoUnavailableError:
        _indexesEnsured = False
        raise


def _credentialsCollection():
    ensureGmailUserStores()
    return getMongoDb()[GMAIL_USER_CREDENTIALS_COLLECTION]


def _sessionsCollection():
    ensureGmailUserStores()
    return getMongoDb()[GMAIL_OAUTH_SESSIONS_COLLECTION]


def _normalizeUserId(userId: str | None) -> str:
    return str(userId or "").strip()


def loadUserGmailToken(userId: str) -> dict[str, Any] | None:
    uid = _normalizeUserId(userId)
    if not uid:
        return None
    try:
        doc = _credentialsCollection().find_one({"_id": uid})
    except MongoUnavailableError:
        return None
    if not isinstance(doc, dict):
        return None
    raw = doc.get("gmailToken")
    if isinstance(raw, dict) and raw.get("token"):
        return raw
    return None


def saveUserGmailToken(userId: str, token: dict[str, Any], *, gmailEmail: str | None = None) -> None:
    uid = _normalizeUserId(userId)
    if not uid:
        raise ValueError("userId is required to save Gmail credentials.")
    if not isinstance(token, dict) or not token.get("token"):
        raise ValueError("Gmail token must be a JSON object with a token field.")
    nowIso = _utcNowIso()
    payload: dict[str, Any] = {
        "userId": uid,
        "gmailToken": token,
        "updatedAt": nowIso,
    }
    if gmailEmail:
        payload["gmailEmail"] = gmailEmail
    _credentialsCollection().update_one(
        {"_id": uid},
        {"$set": payload, "$setOnInsert": {"createdAt": nowIso}},
        upsert=True,
    )


def saveUserGmailEmail(userId: str, gmailEmail: str | None) -> None:
    uid = _normalizeUserId(userId)
    if not uid:
        return
    try:
        _credentialsCollection().update_one(
            {"_id": uid},
            {"$set": {"gmailEmail": gmailEmail, "updatedAt": _utcNowIso()}},
        )
    except MongoUnavailableError:
        return


def clearUserGmailToken(userId: str) -> None:
    uid = _normalizeUserId(userId)
    if not uid:
        return
    _credentialsCollection().update_one(
        {"_id": uid},
        {
            "$set": {
                "gmailToken": None,
                "gmailEmail": None,
                "updatedAt": _utcNowIso(),
            }
        },
        upsert=True,
    )


def saveUserOAuthSession(
    *,
    state: str,
    userId: str,
    codeVerifier: str | None,
    returnTo: str = "/",
    redirectUri: str | None = None,
) -> None:
    uid = _normalizeUserId(userId)
    cleanState = str(state or "").strip()
    if not uid or not cleanState:
        raise ValueError("OAuth session requires userId and state.")
    now = _utcNow()
    payload = {
        "_id": cleanState,
        "state": cleanState,
        "userId": uid,
        "codeVerifier": codeVerifier,
        "returnTo": returnTo,
        "redirectUri": redirectUri,
        "createdAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "expiresAt": now + timedelta(minutes=OAUTH_SESSION_TTL_MINUTES),
    }
    _sessionsCollection().replace_one({"_id": cleanState}, payload, upsert=True)


def loadUserOAuthSession(state: str) -> dict[str, Any] | None:
    cleanState = str(state or "").strip()
    if not cleanState:
        return None
    try:
        doc = _sessionsCollection().find_one({"_id": cleanState})
    except MongoUnavailableError:
        return None
    if not isinstance(doc, dict):
        return None
    expiresAt = doc.get("expiresAt")
    if isinstance(expiresAt, datetime):
        aware = expiresAt if expiresAt.tzinfo else expiresAt.replace(tzinfo=timezone.utc)
        if aware < _utcNow():
            clearUserOAuthSession(cleanState)
            return None
    return doc


def clearUserOAuthSession(state: str) -> None:
    cleanState = str(state or "").strip()
    if not cleanState:
        return
    try:
        _sessionsCollection().delete_one({"_id": cleanState})
    except MongoUnavailableError:
        return
