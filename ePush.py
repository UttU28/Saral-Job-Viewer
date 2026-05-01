from __future__ import annotations

import json

import requests

from dValidate import authenticateMidhtechSession, buildCheckPayload
from utils.dataManager import (
    deleteJobsByApplyStatusNotIn,
    loadJobsByApplyStatus,
    updateApplyStatusByJobId,
)


KEEP_STATUS = "APPLY"
STATUS_APPLIED = "APPLIED"
STATUS_REDO = "REDO"


def cleanupOnlyApply() -> int:
    deleted = deleteJobsByApplyStatusNotIn((KEEP_STATUS,))
    kept_after = loadJobsByApplyStatus(KEEP_STATUS)
    print(
        f"Cleanup complete: deleted {deleted} non-{KEEP_STATUS} job(s), "
        f"kept {len(kept_after)} {KEEP_STATUS} job(s)."
    )
    return deleted


def _responseLooksSuccessful(resp: requests.Response) -> bool:
    if resp.status_code < 200 or resp.status_code >= 400:
        return False
    # If auth expired, app usually redirects to login.
    return "/login" not in (resp.url or "")


def submitJobSuggestion(
    session: requests.Session,
    suggest_url: str,
    csrf_token: str,
    job: dict,
) -> tuple[bool, str]:
    payload = buildCheckPayload(job)
    payload["csrfmiddlewaretoken"] = csrf_token
    headers = {
        "Referer": suggest_url,
        "X-CSRFToken": csrf_token,
    }
    response = session.post(
        suggest_url,
        data=payload,
        headers=headers,
        allow_redirects=True,
        timeout=30,
    )
    ok = _responseLooksSuccessful(response)
    body = (response.text or "").strip()
    if not ok:
        preview = body[:300] if body else "<empty>"
        return False, f"HTTP {response.status_code} at {response.url} :: {preview}"
    return True, f"HTTP {response.status_code}"


def pushApplyJobs() -> int:
    cleanupOnlyApply()

    apply_jobs = loadJobsByApplyStatus(KEEP_STATUS)
    if not apply_jobs:
        print("No APPLY jobs found to submit.")
        return 0

    print(f"Submitting {len(apply_jobs)} APPLY job(s) to suggest endpoint...")

    session, _base_url, suggest_url, _check_url, csrf_token = authenticateMidhtechSession()

    applied = 0
    redo = 0
    for i, job in enumerate(apply_jobs, start=1):
        job_id = str(job.get("jobId") or "").strip()
        title = str(job.get("title") or "").strip()
        company = str(job.get("companyName") or "").strip()
        print(f"[{i}/{len(apply_jobs)}] submit {job_id} :: {company} :: {title}")
        try:
            success, info = submitJobSuggestion(
                session=session,
                suggest_url=suggest_url,
                csrf_token=csrf_token,
                job=job,
            )
        except Exception as exc:
            success = False
            info = f"exception: {exc}"

        if success:
            updateApplyStatusByJobId(job_id, STATUS_APPLIED)
            applied += 1
            print(f"  {STATUS_APPLIED} ({info})")
        else:
            updateApplyStatusByJobId(job_id, STATUS_REDO)
            redo += 1
            print(f"  {STATUS_REDO} ({info})")

    print(
        json.dumps(
            {
                "total": len(apply_jobs),
                "applied": applied,
                "redo": redo,
                "status_on_success": STATUS_APPLIED,
                "status_on_failure": STATUS_REDO,
            },
            indent=2,
        )
    )
    return applied


def main() -> int:
    pushApplyJobs()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
