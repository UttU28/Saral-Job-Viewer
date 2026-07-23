from __future__ import annotations

import base64
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from utils.gmailAuth import getGmailService
from utils.gmailConfig import defaultSenderName
from utils.gmailEmailHtml import bodyToHtml


class MailPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    to: EmailStr
    subject: str = Field(min_length=1, max_length=998)
    body: str = Field(min_length=1)
    recipientName: str | None = Field(default=None, alias="recipient_name")
    senderName: str | None = Field(default=None, alias="sender_name")
    senderEmail: EmailStr | None = Field(default=None, alias="sender_email")
    cc: EmailStr | None = None
    includeResume: bool = Field(default=True, alias="include_resume")


class AttachmentInput(BaseModel):
    filename: str
    contentType: str
    data: bytes

    model_config = ConfigDict(populate_by_name=True)

    @property
    def content_type(self) -> str:
        return self.contentType


def _formatFrom(senderName: str | None, senderEmail: str | None) -> str:
    name = (senderName or defaultSenderName()).strip()
    if senderEmail:
        return f"{name} <{senderEmail}>"
    return name


def buildRawMessage(payload: MailPayload, attachments: list[AttachmentInput]) -> str:
    root = MIMEMultipart("mixed")
    root["To"] = str(payload.to)
    root["Subject"] = payload.subject
    root["From"] = _formatFrom(payload.senderName, str(payload.senderEmail) if payload.senderEmail else None)
    if payload.cc:
        root["Cc"] = str(payload.cc)

    alternative = MIMEMultipart("alternative")
    alternative.attach(MIMEText(payload.body, "plain", "utf-8"))
    alternative.attach(MIMEText(bodyToHtml(payload.body), "html", "utf-8"))
    root.attach(alternative)

    for attachment in attachments:
        part = MIMEBase("application", "octet-stream")
        part.set_payload(attachment.data)
        encoders.encode_base64(part)
        part.add_header(
            "Content-Disposition",
            f'attachment; filename="{attachment.filename}"',
        )
        if attachment.contentType:
            part.set_type(attachment.contentType)
        root.attach(part)

    rawBytes = base64.urlsafe_b64encode(root.as_bytes()).decode("ascii")
    return rawBytes.rstrip("=")


def createDraft(payload: MailPayload, attachments: list[AttachmentInput]) -> dict:
    gmail = getGmailService()
    raw = buildRawMessage(payload, attachments)
    draft = (
        gmail.users()
        .drafts()
        .create(userId="me", body={"message": {"raw": raw}})
        .execute()
    )
    return {
        "draftId": draft.get("id"),
        "messageId": draft.get("message", {}).get("id"),
    }


def sendMessage(payload: MailPayload, attachments: list[AttachmentInput]) -> dict:
    gmail = getGmailService()
    raw = buildRawMessage(payload, attachments)
    sent = (
        gmail.users()
        .messages()
        .send(userId="me", body={"raw": raw})
        .execute()
    )
    return {
        "messageId": sent.get("id"),
        "threadId": sent.get("threadId"),
    }
