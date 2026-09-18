from __future__ import annotations

import json
import os

# Allow Google to return expanded scopes (e.g. adding gmail.modify on reconnect).
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from contextvars import ContextVar, Token
import threading

from utils.gmailConfig import (
    GMAIL_SCOPE_COMPOSE,
    GMAIL_SCOPE_MODIFY,
    GMAIL_SCOPE_READONLY,
    GMAIL_SCOPE_SEND,
    GMAIL_SCOPES,
    gmailCredentialsPath,
)
from utils.gmailUserStore import (
    clearUserGmailToken,
    clearUserOAuthSession,
    loadUserGmailToken,
    loadUserOAuthSession,
    saveUserGmailEmail,
    saveUserGmailToken,
    saveUserOAuthSession,
)

_gmailUserId: ContextVar[str | None] = ContextVar("gmailUserId", default=None)
_gmailUserIdThread = threading.local()


def bindGmailUserId(userId: str) -> Token:
    uid = str(userId or "").strip() or None
    _gmailUserIdThread.userId = uid
    return _gmailUserId.set(uid)


def resetGmailUserId(token: Token) -> None:
    _gmailUserIdThread.userId = None
    _gmailUserId.reset(token)


def currentGmailUserId() -> str | None:
    value = _gmailUserId.get()
    if value:
        return str(value).strip()
    threadValue = getattr(_gmailUserIdThread, "userId", None)
    return str(threadValue).strip() if threadValue else None


def credentialsConfigured() -> bool:
    return gmailCredentialsPath().is_file()


def _grantedScopesFromToken(data: dict) -> list[str]:
    raw = data.get("scopes")
    if isinstance(raw, str) and raw.strip():
        return [part.strip() for part in raw.split() if part.strip()]
    if isinstance(raw, list):
        return [str(part).strip() for part in raw if str(part).strip()]
    return []


def _canReadMail(granted: set[str]) -> bool:
    hasTransport = GMAIL_SCOPE_COMPOSE in granted and GMAIL_SCOPE_SEND in granted
    hasRead = GMAIL_SCOPE_READONLY in granted or GMAIL_SCOPE_MODIFY in granted
    # Older tokens may only list readonly; still allow if modify/readonly present alone for inbox read.
    if GMAIL_SCOPE_READONLY in granted or GMAIL_SCOPE_MODIFY in granted:
        return True
    return hasTransport and hasRead


def _canModifyMail(granted: set[str]) -> bool:
    return GMAIL_SCOPE_MODIFY in granted


def _missingForFullAccess(granted: set[str]) -> list[str]:
    return sorted(set(GMAIL_SCOPES) - granted)


def _readStoredCredentials() -> tuple[Credentials | None, list[str]]:
    """
    Load token from store using scopes recorded IN the token.
    Do not pass GMAIL_SCOPES into from_authorized_user_info — that overwrites
    granted scopes and falsely reports gmail.modify as present.
    """
    userId = currentGmailUserId()
    if userId:
        data = loadUserGmailToken(userId)
    else:
        # Never use the old shared workspace token for HTTP users.
        data = None
    if not data:
        return None, []
    try:
        granted = _grantedScopesFromToken(data)
        creds = Credentials.from_authorized_user_info(data, scopes=granted or None)
        return creds, granted
    except (ValueError, TypeError, json.JSONDecodeError):
        return None, []


def saveCredentials(creds: Credentials) -> None:
    payload = json.loads(creds.to_json())
    userId = currentGmailUserId()
    if not userId:
        raise RuntimeError("Refusing to save Gmail credentials without a Saral userId.")
    saveUserGmailToken(userId, payload)


def clearCredentials() -> None:
    userId = currentGmailUserId()
    if not userId:
        raise RuntimeError("Refusing to clear Gmail credentials without a Saral userId.")
    clearUserGmailToken(userId)


def _refreshCredentials(creds: Credentials) -> Credentials | None:
    if not creds.expired or not creds.refresh_token:
        return creds if creds.valid else None
    try:
        creds.refresh(Request())
        saveCredentials(creds)
        return creds
    except RefreshError:
        clearCredentials()
        return None


def inspectGmailStatus() -> dict:
    if not credentialsConfigured():
        return {
            "configured": False,
            "connected": False,
            "canModify": False,
            "needsReauth": False,
            "email": None,
            "reason": "missingClientSecret",
        }

    creds, grantedScopes = _readStoredCredentials()
    if creds is None:
        return {
            "configured": True,
            "connected": False,
            "canModify": False,
            "needsReauth": True,
            "email": None,
            "reason": "noToken",
        }

    creds = _refreshCredentials(creds)
    if creds is None or not creds.valid:
        return {
            "configured": True,
            "connected": False,
            "canModify": False,
            "needsReauth": True,
            "email": None,
            "reason": "refreshFailed",
        }

    granted = set(grantedScopes or creds.scopes or [])
    canRead = _canReadMail(granted)
    canModify = _canModifyMail(granted)
    missingScopes = _missingForFullAccess(granted)

    if not canRead:
        return {
            "configured": True,
            "connected": False,
            "canModify": False,
            "needsReauth": True,
            "email": None,
            "reason": "missingScopes",
            "missingScopes": missingScopes,
        }

    try:
        profile = build("gmail", "v1", credentials=creds, cache_discovery=False).users().getProfile(
            userId="me",
        ).execute()
        email = profile.get("emailAddress")
        userId = currentGmailUserId()
        if userId and email:
            saveUserGmailEmail(userId, str(email))
    except Exception:
        return {
            "configured": True,
            "connected": False,
            "canModify": False,
            "needsReauth": True,
            "email": None,
            "reason": "apiUnreachable",
        }

    return {
        "configured": True,
        "connected": True,
        "canModify": canModify,
        "needsReauth": not canModify,
        "email": email,
        "reason": None if canModify else "missingScopes",
        "missingScopes": [] if canModify else missingScopes,
        "scopes": sorted(granted),
    }


def loadCredentials(*, needModify: bool = False) -> Credentials | None:
    creds, grantedScopes = _readStoredCredentials()
    if creds is None:
        return None

    creds = _refreshCredentials(creds)
    if creds is None or not creds.valid:
        return None

    granted = set(grantedScopes or creds.scopes or [])
    if needModify and not _canModifyMail(granted):
        return None
    if not _canReadMail(granted):
        return None

    return creds


def createOAuthFlow(redirectUri: str) -> Flow:
    return Flow.from_client_secrets_file(
        str(gmailCredentialsPath()),
        scopes=GMAIL_SCOPES,
        redirect_uri=redirectUri,
    )


def saveOAuthSession(
    state: str,
    codeVerifier: str | None,
    returnTo: str = "/",
    redirectUri: str | None = None,
    userId: str | None = None,
) -> None:
    ownerId = str(userId or currentGmailUserId() or "").strip()
    if not ownerId:
        raise ValueError("Gmail OAuth session requires a signed-in user.")
    saveUserOAuthSession(
        state=state,
        userId=ownerId,
        codeVerifier=codeVerifier,
        returnTo=returnTo,
        redirectUri=redirectUri,
    )


def loadOAuthSession(state: str | None = None) -> dict | None:
    return loadUserOAuthSession(str(state or "").strip())


def clearOAuthSession(state: str | None = None) -> None:
    clearUserOAuthSession(str(state or "").strip())


def getGmailService(*, needModify: bool = False):
    creds = loadCredentials(needModify=needModify)
    if not creds:
        if needModify:
            raise RuntimeError(
                "Gmail needs re-authorization for label changes (gmail.modify). Reconnect Gmail."
            )
        raise RuntimeError("Gmail not connected. Complete OAuth first.")
    return build("gmail", "v1", credentials=creds, cache_discovery=False)
