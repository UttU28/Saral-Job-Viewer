from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, ConfigDict, Field

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
    gmailOAuthReturnPath,
)
from utils.gmailInbox import fetchUnreadPrimaryEmails
from utils.gmailInboxClean import (
    applyEmailLabelActions,
    classifyManyUnreadEmails,
    classifyOneUnreadEmail,
    cleanUnreadPrimaryInbox,
)
from utils.gmailLabels import listGmailLabels
from utils.gmailResumeStore import deleteResume, getResumeInfo, loadResumeAttachment, loadResumeDownload, saveResume
from utils.gmailSentRecipients import fetchSentRecipientEmails
from utils.gmailService import AttachmentInput, MailPayload, createDraft, sendMessage

gmailRouter = APIRouter(tags=["gmail"])


# Request bodies for inbox classify / apply (camelCase JSON)
class ClassifyOneBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    messageId: str = Field(min_length=1)
    useLlm: bool = True


class ClassifyBatchBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    messageIds: list[str] = Field(min_length=1)
    useLlm: bool = True


class ApplyLabelItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    messageId: str = Field(min_length=1)
    category: str | None = None


class ApplyLabelsBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: list[ApplyLabelItem]
    archive: bool = True
    markRead: bool = True



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


def _requireConnectedStatus(*, needModify: bool = False) -> dict:
    status = inspectGmailStatus()
    if status.get("connected") and (not needModify or status.get("canModify")):
        return status

    detail = "Gmail not connected."
    reason = status.get("reason")
    if needModify and status.get("connected") and not status.get("canModify"):
        detail = "Gmail needs re-authorization for label changes (gmail.modify). Reconnect Gmail."
    elif reason == "missingScopes":
        detail = "Gmail needs re-authorization for sent-mail access. Connect again."
    elif reason:
        detail = f"Gmail not connected ({reason})."
    raise HTTPException(status_code=401, detail=detail)


@gmailRouter.get("/api/gmail/status")
def getGmailStatus() -> dict:
    return inspectGmailStatus()


@gmailRouter.get("/api/gmail/auth/start")
def startGmailAuth(returnTo: str | None = None):
    if not credentialsConfigured():
        raise HTTPException(
            status_code=503,
            detail="Missing client_secret.json. Set GMAIL_CREDENTIALS_FILE or place client_secret.json in the project root.",
        )

    safeReturn = (
        returnTo
        if isinstance(returnTo, str) and returnTo.startswith("/")
        else gmailOAuthReturnPath()
    )
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
        # Reconnect may add gmail.modify on top of older readonly scopes.
        os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"
        flow.fetch_token(code=code)
    except Exception as exc:
        clearOAuthSession()
        raise HTTPException(status_code=400, detail=f"Gmail auth failed: {exc}") from exc

    saveCredentials(flow.credentials)
    clearOAuthSession()

    returnTo = session.get("returnTo") or session.get("return_to") or gmailOAuthReturnPath()
    if not isinstance(returnTo, str) or not returnTo.startswith("/"):
        returnTo = gmailOAuthReturnPath()

    return RedirectResponse(f"{gmailFrontendUrl()}{returnTo}?gmail=connected")


@gmailRouter.post("/api/gmail/disconnect")
def disconnectGmail() -> dict:
    clearCredentials()
    return {"connected": False}


@gmailRouter.get("/api/gmail/resume")
def getGmailResumeStatus() -> dict:
    return getResumeInfo()


@gmailRouter.get("/api/gmail/resume/download")
def downloadGmailResume() -> Response:
    result = loadResumeDownload()
    if not result:
        raise HTTPException(status_code=404, detail="No resume saved.")

    pdfBytes, filename, contentType = result
    return Response(
        content=pdfBytes,
        media_type=contentType,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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


@gmailRouter.get("/api/gmail/inbox/unread")
def getGmailUnreadPrimary(maxResults: int = 100) -> dict:
    _requireConnectedStatus()

    if maxResults < 1 or maxResults > 200:
        raise HTTPException(status_code=422, detail="maxResults must be between 1 and 200")

    try:
        return fetchUnreadPrimaryEmails(maxResults=maxResults)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@gmailRouter.get("/api/gmail/labels")
def getGmailLabels() -> dict:
    _requireConnectedStatus()
    try:
        return listGmailLabels()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@gmailRouter.post("/api/gmail/inbox/clean")
def postGmailInboxClean(
    maxResults: int = 100,
    dryRun: bool = False,
    archive: bool = True,
    markRead: bool = True,
    useLlm: bool = True,
) -> dict:
    """
    Categorize unread Primary job-application mail via local LLM (+ regex fallback):
    - application received / thanks for applying → oneSided
    - rejection / regret to inform → BaharMil
    - job ads / alerts / LinkedIn digests / recruiter blasts → jobAds
    Then optionally archive + mark read to clean the inbox.
    """
    _requireConnectedStatus()

    if maxResults < 1 or maxResults > 200:
        raise HTTPException(status_code=422, detail="maxResults must be between 1 and 200")

    try:
        return cleanUnreadPrimaryInbox(
            maxResults=maxResults,
            dryRun=dryRun,
            archive=archive,
            markRead=markRead,
            useLlm=useLlm,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@gmailRouter.post("/api/gmail/inbox/classify-one")
def postGmailClassifyOne(body: ClassifyOneBody) -> dict:
    """Classify a single unread email (LLM when enabled). Does not change Gmail labels."""
    _requireConnectedStatus()
    try:
        return classifyOneUnreadEmail(body.messageId, useLlm=body.useLlm)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@gmailRouter.post("/api/gmail/inbox/classify-batch")
def postGmailClassifyBatch(body: ClassifyBatchBody) -> dict:
    """Classify up to 3 emails in one LLM call. Does not change Gmail labels."""
    _requireConnectedStatus()
    messageIds = [mid.strip() for mid in body.messageIds if isinstance(mid, str) and mid.strip()]
    if not messageIds:
        raise HTTPException(status_code=422, detail="messageIds required")
    if len(messageIds) > 3:
        raise HTTPException(status_code=422, detail="at most 3 messageIds per batch")

    try:
        results = classifyManyUnreadEmails(messageIds, useLlm=body.useLlm)
        return {"count": len(results), "results": results}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@gmailRouter.post("/api/gmail/inbox/apply-labels")
def postGmailApplyLabels(body: ApplyLabelsBody) -> dict:
    """Apply confirmed BaharMil / oneSided / jobAds labels after UI review."""
    _requireConnectedStatus(needModify=True)
    if not body.items:
        raise HTTPException(status_code=422, detail="items required")
    if len(body.items) > 200:
        raise HTTPException(status_code=422, detail="at most 200 items")

    try:
        return applyEmailLabelActions(
            [item.model_dump() for item in body.items],
            archive=body.archive,
            markRead=body.markRead,
        )
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
