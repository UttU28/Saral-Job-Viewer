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

from utils.gmailConfig import (
    GMAIL_SCOPE_COMPOSE,
    GMAIL_SCOPE_MODIFY,
    GMAIL_SCOPE_READONLY,
    GMAIL_SCOPE_SEND,
    GMAIL_SCOPES,
    gmailCredentialsPath,
)
from utils.placetrackStore import (
    clearGmailOAuthSession as clearOAuthSessionInStore,
    clearGmailToken,
    loadGmailOAuthSession as loadOAuthSessionFromStore,
    loadGmailTokenDict,
    saveGmailOAuthSession as saveOAuthSessionInStore,
    saveGmailTokenDict,
)


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
    data = loadGmailTokenDict()
    if not data:
        return None, []
    try:
        granted = _grantedScopesFromToken(data)
        creds = Credentials.from_authorized_user_info(data, scopes=granted or None)
        return creds, granted
    except (ValueError, TypeError, json.JSONDecodeError):
        return None, []


def saveCredentials(creds: Credentials) -> None:
    saveGmailTokenDict(json.loads(creds.to_json()))


def clearCredentials() -> None:
    clearGmailToken()


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


def saveOAuthSession(state: str, codeVerifier: str | None, returnTo: str = "/") -> None:
    saveOAuthSessionInStore(state, codeVerifier, returnTo)


def loadOAuthSession() -> dict | None:
    return loadOAuthSessionFromStore()


def clearOAuthSession() -> None:
    clearOAuthSessionInStore()


def getGmailService(*, needModify: bool = False):
    creds = loadCredentials(needModify=needModify)
    if not creds:
        if needModify:
            raise RuntimeError(
                "Gmail needs re-authorization for label changes (gmail.modify). Reconnect Gmail."
            )
        raise RuntimeError("Gmail not connected. Complete OAuth first.")
    return build("gmail", "v1", credentials=creds, cache_discovery=False)
