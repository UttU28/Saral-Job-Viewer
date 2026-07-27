from __future__ import annotations

import json
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import RedirectResponse

from utils.gmailAuth import (
    clearCredentials,
    clearOAuthSession,
    createOAuthFlow,
    credentialsConfigured,
    inspectGmailStatus,
    loadCredentials,
    loadOAuthSession,
    saveCredentials,
    saveOAuthSession,
)
from utils.gmailConfig import (
    DEFAULT_SENT_SINCE,
    gmailFrontendUrl,
    gmailOAuthRedirectUri,
)
from utils.gmailResumeStore import deleteResume, getResumeInfo, loadResumeAttachment, saveResume
from utils.gmailSentRecipients import fetchSentRecipientEmails
from utils.gmailService import AttachmentInput, MailPayload, createDraft, sendMessage

gmailRouter = APIRouter(tags=["gmail"])


def _parseMailPayload(payloadJson: str) -> MailPayload:
    try:
        data = json.loads(payloadJson)
        return MailPayload.model_validate(data)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid payload: {exc}") from exc


async def _readAttachments(files: list[UploadFile] | None) -> list[AttachmentInput]:
    attachments: list[AttachmentInput] = []
    for upload in files or []:
        if not upload.filename:
            continue
        content = await upload.read()
        if not content:
            continue
        attachments.append(
            AttachmentInput(
                filename=upload.filename,
                contentType=upload.content_type or "application/octet-stream",
                data=content,
            )
        )
    return attachments


async def _collectAttachments(
    mail: MailPayload,
    files: list[UploadFile] | None,
) -> list[AttachmentInput]:
    attachments = await _readAttachments(files)
    if mail.includeResume:
        savedResume = loadResumeAttachment()
        if savedResume:
            attachments.insert(0, savedResume)
    return attachments


def _requireConnectedStatus() -> dict:
    status = inspectGmailStatus()
    if status.get("connected"):
        return status

    detail = "Gmail not connected."
    reason = status.get("reason")
    if reason == "missingScopes":
        detail = "Gmail needs re-authorization for sent-mail access. Connect again."
    elif reason:
        detail = f"Gmail not connected ({reason})."
    raise HTTPException(status_code=401, detail=detail)


@gmailRouter.get("/api/gmail/status")
def getGmailStatus() -> dict:
    return inspectGmailStatus()


@gmailRouter.get("/api/gmail/auth/start")
def startGmailAuth(returnTo: str = "/"):
    if not credentialsConfigured():
        raise HTTPException(
            status_code=503,
            detail="Missing client_secret.json. Set GMAIL_CREDENTIALS_FILE or place client_secret.json in the project root.",
        )

    safeReturn = returnTo if returnTo.startswith("/") else "/"
    redirectUri = gmailOAuthRedirectUri()
    flow = createOAuthFlow(redirectUri)
    authorizationUrl, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    saveOAuthSession(state, flow.code_verifier, safeReturn)
    return RedirectResponse(authorizationUrl)


@gmailRouter.get("/api/gmail/auth/callback")
def gmailAuthCallback(code: str, state: str):
    session = loadOAuthSession()
    if not session or session.get("state") != state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state. Try Connect Gmail again.")

    redirectUri = gmailOAuthRedirectUri()
    flow = createOAuthFlow(redirectUri)
    codeVerifier = session.get("codeVerifier") or session.get("code_verifier")
    if codeVerifier:
        flow.code_verifier = codeVerifier

    try:
        flow.fetch_token(code=code)
    except Exception as exc:
        clearOAuthSession()
        raise HTTPException(status_code=400, detail=f"Gmail auth failed: {exc}") from exc

    saveCredentials(flow.credentials)
    clearOAuthSession()

    returnTo = session.get("returnTo") or session.get("return_to") or "/"
    if not isinstance(returnTo, str) or not returnTo.startswith("/"):
        returnTo = "/"

    return RedirectResponse(f"{gmailFrontendUrl()}{returnTo}?gmail=connected")


@gmailRouter.post("/api/gmail/disconnect")
def disconnectGmail() -> dict:
    clearCredentials()
    return {"connected": False}


@gmailRouter.get("/api/gmail/resume")
def getGmailResumeStatus() -> dict:
    return getResumeInfo()


@gmailRouter.post("/api/gmail/resume")
async def uploadGmailResume(file: Annotated[UploadFile, File()]) -> dict:
    if not file.filename:
        raise HTTPException(status_code=422, detail="Resume file required.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="Empty file.")

    info = saveResume(
        content,
        originalName=file.filename,
        contentType=file.content_type or "application/pdf",
    )
    return {"success": True, **info}


@gmailRouter.delete("/api/gmail/resume")
def deleteGmailResume() -> dict:
    deleteResume()
    return {"success": True, "saved": False}


@gmailRouter.get("/api/gmail/sent-recipients")
def getGmailSentRecipients(since: str = DEFAULT_SENT_SINCE, refresh: bool = False) -> dict:
    _requireConnectedStatus()

    try:
        datetime.strptime(since, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="since must be YYYY-MM-DD") from exc

    try:
        return fetchSentRecipientEmails(since=since, refresh=refresh)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@gmailRouter.post("/api/gmail/draft")
async def postGmailDraft(
    payload: Annotated[str, Form()],
    attachments: Annotated[list[UploadFile] | None, File()] = None,
) -> dict:
    if loadCredentials() is None:
        raise HTTPException(status_code=401, detail="Gmail not connected.")

    mail = _parseMailPayload(payload)
    files = await _collectAttachments(mail, attachments)
    try:
        result = createDraft(mail, files)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "success": True,
        "to": str(mail.to),
        "subject": mail.subject,
        "attachmentsCount": len(files),
        **result,
    }


@gmailRouter.post("/api/gmail/send")
async def postGmailSend(
    payload: Annotated[str, Form()],
    attachments: Annotated[list[UploadFile] | None, File()] = None,
) -> dict:
    if loadCredentials() is None:
        raise HTTPException(status_code=401, detail="Gmail not connected.")

    mail = _parseMailPayload(payload)
    files = await _collectAttachments(mail, attachments)
    try:
        result = sendMessage(mail, files)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "success": True,
        "to": str(mail.to),
        "subject": mail.subject,
        "attachmentsCount": len(files),
        **result,
    }
