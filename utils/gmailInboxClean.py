from __future__ import annotations

import base64
import re
from datetime import datetime, timezone
from email.utils import parseaddr

from utils.gmailAuth import getGmailService
from utils.gmailLabels import (
    CLEAN_LABEL_BAHARMIL,
    CLEAN_LABEL_JOBADS,
    CLEAN_LABEL_ONESIDED,
    resolveCleanLabels,
)
from utils.localLlm import (
    chatCompletions,
    extractJsonObject,
    localLlmEnabled,
)

HEADER_NAMES = ("From", "Subject", "Date", "To", "Reply-To")

PERSONAL_DOMAINS = frozenset(
    {
        "gmail.com",
        "googlemail.com",
        "yahoo.com",
        "yahoo.co.uk",
        "hotmail.com",
        "outlook.com",
        "live.com",
        "msn.com",
        "icloud.com",
        "me.com",
        "mac.com",
        "aol.com",
        "proton.me",
        "protonmail.com",
        "pm.me",
        "gmx.com",
        "gmx.net",
        "mail.com",
        "yandex.com",
        "yandex.ru",
    }
)

# Domains / hosts that strongly indicate ATS / recruiting systems.
ATS_DOMAIN_HINTS = (
    "icims.com",
    "myworkday.com",
    "workday.com",
    "lever.co",
    "greenhouse.io",
    "greenhouse-mail.io",
    "smartrecruiters.com",
    "ashbyhq.com",
    "bamboohr.com",
    "jobvite.com",
    "applytojob.com",
    "successfactors.com",
    "pinpoint.email",
    "oraclecloud.com",
    "jobs2web.com",
    "taleo.net",
    "brassring.com",
    "ultipro.com",
    "paylocity.com",
    "recruitee.com",
    "teamtailor.com",
    "rippling.com",
    "hire.lever.co",
    "vanguardhr.com",
)

JOB_SIGNAL_PATTERNS = [
    re.compile(p, re.I)
    for p in (
        r"\bapplication\b",
        r"\bappl(y|ied|ying)\b",
        r"\bcandidacy\b",
        r"\bcandidate\b",
        r"\brecruit(er|ing|ment)?\b",
        r"\btalent\s+acquisition\b",
        r"\bhiring\b",
        r"\bcareer(s)?\b",
        r"\bjob\s+(application|opening|opportunity|alert|requisition)\b",
        r"\bposition\b",
        r"\brole\b",
        r"\bresume\b",
        r"\bcv\b",
        r"\bicims\b",
        r"\bworkday\b",
        r"\bgreenhouse\b",
        r"\blever\b",
    )
]

COMPANY_SENDER_PATTERNS = [
    re.compile(p, re.I)
    for p in (
        r"^(careers|jobs|recruiting|recruitment|talent|hr|noreply|no-reply|donotreply|do-not-reply|"
        r"notifications?|hiring|people|staffing|autoreply)@",
        r"@(careers|jobs|recruiting|talent)\.",
        r"@(greenhouse\.io|lever\.co|myworkday\.com|workday\.com|smartrecruiters\.com|"
        r"icims\.com|bamboohr\.com|ashbyhq\.com|jobvite\.com|greenhouse-mail\.io|"
        r"hire\.lever\.co|successfactors\.com|applytojob\.com|pinpoint\.email|"
        r"talent\.icims\.com|vanguardhr\.com)\b",
    )
]

REJECTION_PATTERNS = [
    re.compile(p, re.I)
    for p in (
        r"regret\s+to\s+inform",
        r"we\s+regret\s+that",
        r"unfortunately\b",
        r"we\s+are\s+sorry\b",
        r"we'?re\s+sorry\b",
        r"not\s+(be\s+)?moving\s+forward",
        r"will\s+not\s+be\s+moving\s+forward",
        r"won'?t\s+be\s+moving\s+forward",
        r"decided\s+(not\s+)?to\s+(pursue|take\s+your\s+profile\s+forward|proceed)",
        r"pursue\s+other\s+candidates?",
        r"other\s+(more\s+)?qualified\s+candidates?",
        r"other\s+candidates?\s+(have\s+been\s+)?selected",
        r"identified\s+other\s+(more\s+)?qualified",
        r"position\s+has\s+been\s+filled",
        r"role\s+has\s+been\s+filled",
        r"not\s+selected\s+(for|to)",
        r"not\s+be\s+selected",
        r"unsuccessful\s+(on\s+this\s+occasion|application|candidate)",
        r"will\s+not\s+be\s+proceeding",
        r"not\s+proceeding\s+with\s+your\s+(application|candidacy)",
        r"after\s+careful(ly)?\s+(consideration|reviewing|review)",
        r"not\s+the\s+right\s+fit",
        r"not\s+a\s+(good|strong)\s+fit",
        r"declined\s+your\s+application",
        r"application\s+was\s+unsuccessful",
        r"unable\s+to\s+(offer|move\s+forward|proceed)",
        r"no\s+longer\s+under\s+consideration",
        r"not\s+advance(d|)\s+your\s+application",
        r"chosen\s+(not\s+to\s+move|another\s+candidate)",
        r"filled\s+the\s+(position|role)",
        r"we\s+have\s+decided\s+not\s+to\s+proceed",
        r"will\s+no(?:t|\s+longer)\s+be\s+(moving|proceeding|continuing)",
        r"not\s+to\s+take\s+your\s+(profile|application|candidacy)\s+forward",
    )
]

ONESIDED_PATTERNS = [
    re.compile(p, re.I)
    for p in (
        r"thank(?:s|\s+you)(?:\s+so\s+much)?\s+for\s+(your\s+)?(applying|application|interest|submitting)",
        r"thanks?\s+for\s+applying",
        r"thanks?\s+for\s+your\s+application",
        r"thank\s+you\s+for\s+your\s+application",
        r"thank\s+you\s+very\s+much\s+for\s+your\s+(recent\s+)?application",
        r"we\s+(have\s+)?received\s+your\s+(application|resume|cv)",
        r"we'?ve\s+received\s+your\s+(application|resume|cv)",
        r"application\s+(has\s+)?(now\s+)?(been\s+)?received",
        r"your\s+application\s+has\s+now\s+been\s+received",
        r"successfully\s+submitted\s+your\s+application",
        r"application\s+(was\s+)?successfully\s+submitted",
        r"confirming\s+(receipt\s+of\s+)?your\s+application",
        r"confirmation\s+of\s+your\s+application",
        r"application\s+confirmation",
        r"application\s+received",
        r"we\s+got\s+your\s+application",
        r"your\s+application\s+is\s+(being\s+)?(reviewed|under\s+review)",
        r"currently\s+reviewing\s+your\s+application",
        r"resume\s+will\s+be\s+reviewed",
        r"you'?ve\s+started\s+your\s+(job\s+)?application",
        r"thanks?\s+for\s+starting\s+your\s+application",
        r"you\s+are\s+now\s+being\s+considered",
        r"you\s+did\s+it!\s+your\s+application",
        r"we\s+appreciate\s+you(r)?\s+(interest|applying|time)",
        r"thanks?\s+for\s+your\s+interest\s+in",
        r"thank\s+you\s+for\s+reaching",
        r"we\s+have\s+received\s+your\s+cv",
    )
]

JOBADS_PATTERNS = [
    re.compile(p, re.I)
    for p in (
        r"\d+\s+(ready\s+)?(job\s+)?applications?\s+are\s+ready",
        r"your\s+\d+\s+applications?\s+are\s+ready",
        r"\d+\s+ready\s+for\s+your\s+approval",
        r"we\s+(have\s+)?(got|found)\s+a\s+job\s+for\s+you",
        r"job\s+for\s+you\b",
        r"jobs?\s+based\s+on\s+your\s+profile",
        r"\d+\s*[-–—to]+\s*\d+\s+more\s+jobs?",
        r"\d+\s+more\s+jobs?\b",
        r"new\s+jobs?\s+posted",
        r"job\s+alert",
        r"jobs?\s+matching\s+your",
        r"recommended\s+jobs?",
        r"jobs?\s+you\s+may\s+(like|be\s+interested)",
        r"linkedin\.com/jobs",
        r"jobs?\s+for\s+you\s+from\s+linkedin",
        r"ready\s+for\s+a\s+new\s+job",
        r"matched\s+you\s+and\s+filled\s+out",
        r"view\s+job\s+matches",
        r"talent\s+community",
        r"you\s+joined\s+the\s+.+\s+talent\s+community",
        r"career\.io",
        r"tealhq\.com",
        r"optimhire",
        r"are\s+you\s+interested\??",
        r"exciting\s+opportunity\s+with\s+our\s+client",
        r"please\s+share\s+(me\s+)?your\s+latest\s+resume",
        r"open\s+for\s+c2c",
        r"job\s+title:\s*",
        r"we\s+have\s+a\s+.+\s+role\s+at",
        r"based\s+on\s+your\s+profile,?\s+we\s+have",
    )
]

LLM_SYSTEM_PROMPT = """You classify inbound emails for a job seeker inbox cleaner.
Return ONLY valid JSON.

Labels (choose exactly one per email):
- "baharMil": company rejection / not selected / not moving forward / other candidates chosen.
- "oneSided": automated application acknowledgment or receipt (thanks for applying, application received, resume received, started application confirmation, under review auto-reply). No human reply needed.
- "jobAds": job ads / alerts / marketing for openings — e.g. "we have a job for you", "N jobs based on your profile", LinkedIn job digests, "your X applications are ready", Career.io matches, recruiter cold pitches ("are you interested?", share resume, C2C role blasts), staffing mass outreach, job-alert newsletters.
- "none": everything else — banking, payments, credit alerts, unrelated newsletters, interview scheduling that needs a reply, account-created portal welcomes without an application decision, personal mail.

Rules:
1. Prefer baharMil when both thanks-for-applying AND rejection language appear.
2. oneSided is only for application receipt / auto-ack for a job YOU already applied to.
3. Recruiter cold outreach / job blasts / "jobs for you" / LinkedIn job mails are jobAds (not none).
4. Payment/credit/newsletter mail is none even if it says "received".
5. If unsure between jobAds and none, prefer jobAds when the email is clearly about promoting job openings.
6. If unsure otherwise, use none.
"""


def _headerMap(payload: dict) -> dict[str, str]:
    headers = payload.get("headers") or []
    return {h.get("name", "").lower(): h.get("value", "") for h in headers if h.get("name")}


def _decodePartData(data: str | None) -> str:
    if not data:
        return ""
    padded = data + "=" * (-len(data) % 4)
    try:
        return base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8", errors="replace")
    except Exception:
        return ""


def _extractBodyText(payload: dict | None) -> str:
    if not payload:
        return ""

    mimeType = (payload.get("mimeType") or "").lower()
    body = payload.get("body") or {}
    data = body.get("data")
    parts = payload.get("parts") or []

    chunks: list[str] = []
    if mimeType.startswith("text/plain") and data:
        chunks.append(_decodePartData(data))
    elif mimeType.startswith("text/html") and data:
        chunks.append(_stripHtml(_decodePartData(data)))

    for part in parts:
        partMime = (part.get("mimeType") or "").lower()
        if partMime.startswith("multipart/"):
            chunks.append(_extractBodyText(part))
            continue
        partData = (part.get("body") or {}).get("data")
        if not partData:
            if part.get("parts"):
                chunks.append(_extractBodyText(part))
            continue
        text = _decodePartData(partData)
        if partMime.startswith("text/html"):
            text = _stripHtml(text)
        elif not partMime.startswith("text/plain"):
            continue
        chunks.append(text)

    return "\n".join(chunk for chunk in chunks if chunk).strip()


def _stripHtml(html: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", html)
    text = re.sub(r"(?is)<br\s*/?>", "\n", text)
    text = re.sub(r"(?is)</p>", "\n", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&#39;", "'", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _domainOf(email: str) -> str:
    if "@" not in email:
        return ""
    return email.rsplit("@", 1)[-1].strip().lower()


def isAtsSender(fromEmail: str) -> bool:
    domain = _domainOf(fromEmail)
    if not domain:
        return False
    return any(domain == hint or domain.endswith("." + hint) for hint in ATS_DOMAIN_HINTS)


def isCompanySender(fromEmail: str) -> bool:
    addr = (fromEmail or "").strip().lower()
    if not addr or "@" not in addr:
        return False
    if isAtsSender(addr):
        return True
    domain = _domainOf(addr)
    if domain in PERSONAL_DOMAINS:
        return any(pattern.search(addr) for pattern in COMPANY_SENDER_PATTERNS)
    if any(pattern.search(addr) for pattern in COMPANY_SENDER_PATTERNS):
        return True
    return True


def hasJobSignals(text: str) -> bool:
    return any(pattern.search(text) for pattern in JOB_SIGNAL_PATTERNS)


def _labelForCategory(category: str | None) -> str | None:
    if category == "baharMil":
        return CLEAN_LABEL_BAHARMIL
    if category == "oneSided":
        return CLEAN_LABEL_ONESIDED
    if category == "jobAds":
        return CLEAN_LABEL_JOBADS
    return None


def _result(category: str | None, reason: str, *, isCompany: bool, isJobRelated: bool, source: str) -> dict:
    return {
        "category": category,
        "labelName": _labelForCategory(category),
        "reason": reason,
        "isCompany": isCompany,
        "isJobRelated": isJobRelated,
        "source": source,
    }


def classifyWithRegex(text: str, *, fromEmail: str = "") -> dict:
    haystack = (text or "").strip()
    company = isCompanySender(fromEmail)
    ats = isAtsSender(fromEmail)
    jobRelated = ats or hasJobSignals(haystack) or any(
        pattern.search(haystack)
        for pattern in (*REJECTION_PATTERNS, *ONESIDED_PATTERNS, *JOBADS_PATTERNS)
    )

    if not company or not jobRelated:
        return _result(
            None,
            "notCompanyJobMail" if not company else "noJobSignals",
            isCompany=company,
            isJobRelated=jobRelated,
            source="regex",
        )

    for pattern in REJECTION_PATTERNS:
        match = pattern.search(haystack)
        if match:
            return _result(
                "baharMil",
                f"rejection:{match.group(0)}",
                isCompany=True,
                isJobRelated=True,
                source="regex",
            )

    for pattern in ONESIDED_PATTERNS:
        match = pattern.search(haystack)
        if match:
            return _result(
                "oneSided",
                f"ack:{match.group(0)}",
                isCompany=True,
                isJobRelated=True,
                source="regex",
            )

    for pattern in JOBADS_PATTERNS:
        match = pattern.search(haystack)
        if match:
            return _result(
                "jobAds",
                f"jobAd:{match.group(0)}",
                isCompany=True,
                isJobRelated=True,
                source="regex",
            )

    return _result(
        None,
        "jobRelatedUnmatched",
        isCompany=True,
        isJobRelated=True,
        source="regex",
    )


def _truncate(text: str, limit: int = 1800) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 3] + "..."


def _shouldAskLlm(regexResult: dict, text: str, fromEmail: str) -> bool:
    if not localLlmEnabled():
        return False
    # Always LLM-classify ATS / job-application-looking mail; regex is fallback only.
    if isAtsSender(fromEmail):
        return True
    if regexResult.get("isJobRelated"):
        return True
    if regexResult.get("category") in {"baharMil", "oneSided", "jobAds"}:
        return True
    return hasJobSignals(text)


def _normalizeLlmCategory(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower().replace(" ", "").replace("_", "").replace("-", "")
    if normalized in {"baharmil", "bahar", "rejection", "reject"}:
        return "baharMil"
    if normalized in {"onesided", "ack", "acknowledgement", "acknowledgment", "received"}:
        return "oneSided"
    if normalized in {"jobads", "jobad", "jobalert", "jobalerts", "ads", "marketingjobs"}:
        return "jobAds"
    if normalized in {"none", "skip", "other", "ignore", "untouched"}:
        return None
    return None


def classifyBatchWithLlm(items: list[dict]) -> dict[str, dict]:
    """
    items: [{id, fromEmail, subject, text}]
    returns id -> classification dict
    """
    if not items:
        return {}

    lines = []
    for index, item in enumerate(items, start=1):
        lines.append(
            f"[{index}] id={item['id']}\n"
            f"From: {item.get('fromEmail') or ''}\n"
            f"Subject: {item.get('subject') or ''}\n"
            f"Body: {_truncate(item.get('text') or '', 1400)}"
        )

    userPrompt = (
        "Classify each email. Respond with JSON only:\n"
        '{"results":[{"id":"...","label":"baharMil|oneSided|jobAds|none","reason":"short"}]}\n\n'
        + "\n\n".join(lines)
    )

    raw = chatCompletions(
        [
            {"role": "system", "content": LLM_SYSTEM_PROMPT},
            {"role": "user", "content": userPrompt},
        ],
        temperature=0.0,
        maxTokens=min(1200, 80 * len(items) + 200),
    )
    parsed = extractJsonObject(raw)
    rows = parsed.get("results") if isinstance(parsed, dict) else parsed
    if not isinstance(rows, list):
        raise RuntimeError("LLM JSON missing results list.")

    byId: dict[str, dict] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        msgId = str(row.get("id") or "").strip()
        if not msgId:
            continue
        category = _normalizeLlmCategory(row.get("label") or row.get("category"))
        reason = str(row.get("reason") or "llm").strip() or "llm"
        byId[msgId] = _result(
            category,
            f"llm:{reason}",
            isCompany=True,
            isJobRelated=category is not None,
            source="llm",
        )
    return byId


def classifyJobApplicationText(text: str, *, fromEmail: str = "", useLlm: bool = False) -> dict:
    """
    Fast path for list preview (regex). Set useLlm=True for single-message LLM.
    """
    regexResult = classifyWithRegex(text, fromEmail=fromEmail)
    if not useLlm:
        return regexResult

    # For explicit one-by-one classify, always try LLM when enabled.
    if not localLlmEnabled():
        return regexResult

    try:
        batch = classifyBatchWithLlm(
            [
                {
                    "id": "single",
                    "fromEmail": fromEmail,
                    "subject": "",
                    "text": text,
                }
            ]
        )
        return batch.get("single") or regexResult
    except Exception as exc:
        fallback = dict(regexResult)
        fallback["reason"] = f"{regexResult.get('reason')}|llmFailed:{exc}"
        return fallback


def classifyOneUnreadEmail(messageId: str, *, useLlm: bool = True) -> dict:
    """Load one Gmail message and classify it (LLM preferred)."""
    results = classifyManyUnreadEmails([messageId], useLlm=useLlm)
    if not results:
        raise RuntimeError(f"Failed to classify message {messageId}")
    return results[0]


def classifyManyUnreadEmails(messageIds: list[str], *, useLlm: bool = True) -> list[dict]:
    """
    Load and classify several Gmail messages in one LLM call (recommended batch size: 3).
    Falls back to regex per message if LLM is disabled or fails.
    """
    if not messageIds:
        return []

    gmail = getGmailService()
    loaded: list[dict] = []
    for messageId in messageIds:
        item = _loadMessageForClassify(gmail, messageId.strip())
        regexResult = classifyWithRegex(item.get("text") or "", fromEmail=item.get("fromEmail") or "")
        item["classification"] = regexResult
        loaded.append(item)

    if useLlm and localLlmEnabled():
        try:
            llmResults = classifyBatchWithLlm(
                [
                    {
                        "id": item["id"],
                        "fromEmail": item.get("fromEmail") or "",
                        "subject": item.get("subject") or "",
                        "text": item.get("text") or "",
                    }
                    for item in loaded
                ]
            )
            for item in loaded:
                if item["id"] in llmResults:
                    item["classification"] = llmResults[item["id"]]
        except Exception as exc:
            for item in loaded:
                current = dict(item.get("classification") or {})
                current["reason"] = f"{current.get('reason')}|llmFailed:{exc}"
                item["classification"] = current

    output: list[dict] = []
    for item in loaded:
        classification = item.get("classification") or {}
        output.append(
            {
                "id": item["id"],
                "threadId": item.get("threadId"),
                "fromName": item.get("fromName"),
                "fromEmail": item.get("fromEmail"),
                "subject": item.get("subject"),
                "snippet": item.get("snippet"),
                "category": classification.get("category"),
                "labelName": classification.get("labelName"),
                "reason": classification.get("reason"),
                "source": classification.get("source"),
                "isCompany": classification.get("isCompany"),
                "isJobRelated": classification.get("isJobRelated"),
            }
        )
    return output


def applyEmailLabelActions(
    items: list[dict],
    *,
    archive: bool = True,
    markRead: bool = True,
) -> dict:
    """
    Apply confirmed categories to Gmail messages.
    - none: leave untouched in Primary / Inbox
    - baharMil / oneSided / jobAds: add that label, mark read, remove from Inbox (leaves Primary)
    """
    gmail = getGmailService(needModify=True)
    labels = resolveCleanLabels(createMissing=True)
    results: list[dict] = []
    counts = {
        "requested": len(items),
        "baharMil": 0,
        "oneSided": 0,
        "jobAds": 0,
        "skipped": 0,
        "applied": 0,
        "errors": 0,
    }

    # System labels to strip so mail leaves Primary inbox view.
    inboxLeaveLabels = ["INBOX", "CATEGORY_PERSONAL"]

    for raw in items:
        messageId = str(raw.get("messageId") or raw.get("id") or "").strip()
        category = raw.get("category")
        if isinstance(category, str):
            category = category.strip()
        if category in ("", "none", None):
            category = None
        elif category not in ("baharMil", "oneSided", "jobAds"):
            counts["errors"] += 1
            results.append(
                {
                    "messageId": messageId,
                    "category": category,
                    "action": "error",
                    "error": "category must be baharMil, oneSided, jobAds, or none",
                }
            )
            continue

        if not messageId:
            counts["errors"] += 1
            results.append({"messageId": "", "action": "error", "error": "messageId required"})
            continue

        if category is None:
            counts["skipped"] += 1
            results.append({"messageId": messageId, "category": None, "action": "skipped"})
            continue

        labelName = _labelForCategory(category)
        if not labelName or labelName not in labels:
            counts["errors"] += 1
            results.append(
                {
                    "messageId": messageId,
                    "category": category,
                    "action": "error",
                    "error": f"label not resolved for {category}",
                }
            )
            continue

        labelMeta = labels[labelName]
        addIds = [labelMeta["id"]]
        removeIds: list[str] = []
        if markRead:
            removeIds.append("UNREAD")
        if archive:
            removeIds.extend(inboxLeaveLabels)

        # Deduplicate while preserving order
        removeIds = list(dict.fromkeys(removeIds))

        try:
            gmail.users().messages().modify(
                userId="me",
                id=messageId,
                body={"addLabelIds": addIds, "removeLabelIds": removeIds},
            ).execute()
            if category == "baharMil":
                counts["baharMil"] += 1
            elif category == "oneSided":
                counts["oneSided"] += 1
            else:
                counts["jobAds"] += 1
            counts["applied"] += 1
            results.append(
                {
                    "messageId": messageId,
                    "category": category,
                    "action": "applied",
                    "appliedLabel": {"id": labelMeta["id"], "name": labelMeta["name"]},
                    "removedLabelIds": removeIds,
                }
            )
        except Exception as exc:
            counts["errors"] += 1
            results.append(
                {
                    "messageId": messageId,
                    "category": category,
                    "action": "error",
                    "error": str(exc),
                }
            )

    return {
        "archive": archive,
        "markRead": markRead,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "labels": {
            name: {"id": meta["id"], "name": meta["name"], "created": meta["created"]}
            for name, meta in labels.items()
        },
        "counts": counts,
        "results": results,
    }


def _listUnreadPrimaryIds(gmail, *, maxResults: int) -> list[str]:
    messageIds: list[str] = []
    pageToken: str | None = None
    query = "is:unread in:inbox category:primary"

    while True:
        remaining = maxResults - len(messageIds)
        if remaining <= 0:
            break
        response = (
            gmail.users()
            .messages()
            .list(
                userId="me",
                q=query,
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


def _loadMessageForClassify(gmail, msgId: str) -> dict:
    message = (
        gmail.users()
        .messages()
        .get(
            userId="me",
            id=msgId,
            format="full",
        )
        .execute()
    )
    headers = _headerMap(message.get("payload") or {})
    fromName, fromEmail = parseaddr(headers.get("from", ""))
    subject = (headers.get("subject") or "").strip()
    snippet = (message.get("snippet") or "").strip()
    body = _extractBodyText(message.get("payload") or {})
    text = "\n".join(part for part in (subject, snippet, body) if part)
    return {
        "id": msgId,
        "threadId": message.get("threadId"),
        "fromName": fromName or None,
        "fromEmail": fromEmail or None,
        "subject": subject or "(no subject)",
        "snippet": snippet,
        "text": text,
        "labelIds": message.get("labelIds") or [],
    }


def _classifyLoadedMessages(items: list[dict], *, forceLlm: bool = True) -> None:
    pendingLlm: list[dict] = []

    for item in items:
        regexResult = classifyWithRegex(item.get("text") or "", fromEmail=item.get("fromEmail") or "")
        item["classification"] = regexResult
        if forceLlm and _shouldAskLlm(regexResult, item.get("text") or "", item.get("fromEmail") or ""):
            pendingLlm.append(
                {
                    "id": item["id"],
                    "fromEmail": item.get("fromEmail") or "",
                    "subject": item.get("subject") or "",
                    "text": item.get("text") or "",
                }
            )

    if not pendingLlm:
        return

    # Batch to keep latency reasonable on local Gemma.
    batchSize = 8
    for start in range(0, len(pendingLlm), batchSize):
        chunk = pendingLlm[start : start + batchSize]
        try:
            llmResults = classifyBatchWithLlm(chunk)
        except Exception as exc:
            for item in items:
                if any(row["id"] == item["id"] for row in chunk):
                    current = dict(item.get("classification") or {})
                    current["reason"] = f"{current.get('reason')}|llmFailed:{exc}"
                    item["classification"] = current
            continue

        byId = {item["id"]: item for item in items}
        for msgId, classification in llmResults.items():
            target = byId.get(msgId)
            if target is not None:
                target["classification"] = classification


def cleanUnreadPrimaryInbox(
    *,
    maxResults: int = 100,
    dryRun: bool = False,
    archive: bool = True,
    markRead: bool = True,
    useLlm: bool = True,
) -> dict:
    """
    Scan unread Primary mail, label rejections as BaharMil, application
    acknowledgments as oneSided, and job ads/alerts as jobAds (LLM + regex),
    then optionally archive + mark read.
    """
    gmail = getGmailService()
    labels = resolveCleanLabels(createMissing=True)
    messageIds = _listUnreadPrimaryIds(gmail, maxResults=max(1, min(maxResults, 200)))

    loaded: list[dict] = []
    results: list[dict] = []
    counts = {
        "scanned": 0,
        "baharMil": 0,
        "oneSided": 0,
        "jobAds": 0,
        "skipped": 0,
        "applied": 0,
        "errors": 0,
        "llmUsed": 0,
        "regexUsed": 0,
    }

    for msgId in messageIds:
        counts["scanned"] += 1
        try:
            loaded.append(_loadMessageForClassify(gmail, msgId))
        except Exception as exc:
            counts["errors"] += 1
            results.append({"id": msgId, "error": str(exc), "action": "error"})

    _classifyLoadedMessages(loaded, forceLlm=useLlm and localLlmEnabled())

    for item in loaded:
        classification = item.get("classification") or {}
        if classification.get("source") == "llm":
            counts["llmUsed"] += 1
        else:
            counts["regexUsed"] += 1

        labelName = classification.get("labelName")
        entry = {
            "id": item["id"],
            "threadId": item.get("threadId"),
            "fromEmail": item.get("fromEmail"),
            "fromName": item.get("fromName"),
            "subject": item.get("subject"),
            "snippet": item.get("snippet"),
            "classification": classification,
            "action": "skipped",
            "appliedLabel": None,
        }

        if not labelName:
            counts["skipped"] += 1
            results.append(entry)
            continue

        if classification.get("category") == "baharMil":
            counts["baharMil"] += 1
        elif classification.get("category") == "oneSided":
            counts["oneSided"] += 1
        elif classification.get("category") == "jobAds":
            counts["jobAds"] += 1

        labelMeta = labels[labelName]
        entry["appliedLabel"] = {"id": labelMeta["id"], "name": labelMeta["name"]}

        if dryRun:
            entry["action"] = "wouldApply"
            results.append(entry)
            continue

        addIds = [labelMeta["id"]]
        removeIds: list[str] = []
        if markRead:
            removeIds.append("UNREAD")
        if archive:
            removeIds.append("INBOX")

        try:
            gmail.users().messages().modify(
                userId="me",
                id=item["id"],
                body={"addLabelIds": addIds, "removeLabelIds": removeIds},
            ).execute()
            entry["action"] = "applied"
            counts["applied"] += 1
        except Exception as exc:
            entry["action"] = "error"
            entry["error"] = str(exc)
            counts["errors"] += 1

        results.append(entry)

    return {
        "dryRun": dryRun,
        "archive": archive,
        "markRead": markRead,
        "useLlm": useLlm and localLlmEnabled(),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "labels": {
            name: {"id": meta["id"], "name": meta["name"], "created": meta["created"]}
            for name, meta in labels.items()
        },
        "counts": counts,
        "results": results,
    }


def previewClassifyUnreadPrimary(*, maxResults: int = 100) -> dict:
    return cleanUnreadPrimaryInbox(
        maxResults=maxResults,
        dryRun=True,
        archive=False,
        markRead=False,
        useLlm=True,
    )
