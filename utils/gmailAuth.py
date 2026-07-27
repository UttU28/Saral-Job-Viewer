from __future__ import annotations

import json
from pathlib import Path

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from utils.gmailConfig import (
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


def _hasRequiredScopes(creds: Credentials) -> bool:
    granted = set(creds.scopes or [])
    return set(GMAIL_SCOPES).issubset(granted)


def _readStoredCredentials() -> Credentials | None:
    data = loadGmailTokenDict()
    if not data:
        return None
    try:
        return Credentials.from_authorized_user_info(data, GMAIL_SCOPES)
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


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
            "needsReauth": False,
            "email": None,
            "reason": "missingClientSecret",
        }

    creds = _readStoredCredentials()
    if creds is None:
        return {
            "configured": True,
            "connected": False,
            "needsReauth": True,
            "email": None,
            "reason": "noToken",
        }

    creds = _refreshCredentials(creds)
    if creds is None or not creds.valid:
        return {
            "configured": True,
            "connected": False,
            "needsReauth": True,
            "email": None,
            "reason": "refreshFailed",
        }

    missingScopes = sorted(set(GMAIL_SCOPES) - set(creds.scopes or []))
    if missingScopes:
        return {
            "configured": True,
            "connected": False,
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
            "needsReauth": True,
            "email": None,
            "reason": "apiUnreachable",
        }

    return {
        "configured": True,
        "connected": True,
        "needsReauth": False,
        "email": email,
        "reason": None,
    }


def loadCredentials() -> Credentials | None:
    creds = _readStoredCredentials()
    if creds is None:
        return None

    creds = _refreshCredentials(creds)
    if creds is None or not creds.valid or not _hasRequiredScopes(creds):
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


def getGmailService():
    creds = loadCredentials()
    if not creds:
        raise RuntimeError("Gmail not connected. Complete OAuth first.")
    return build("gmail", "v1", credentials=creds, cache_discovery=False)
