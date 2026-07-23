export type GmailStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  needsReauth?: boolean;
  reason?: string | null;
  missingScopes?: string[];
};

export type MailApiPayload = {
  to: string;
  subject: string;
  body: string;
  recipient_name?: string;
  sender_name?: string;
  sender_email?: string;
  cc?: string;
  include_resume?: boolean;
};

export type ResumeInfo = {
  saved: boolean;
  filename: string | null;
  path: string | null;
  originalName?: string | null;
  savedAt?: string | null;
};

export type MailApiResult = {
  success: boolean;
  to: string;
  subject: string;
  attachmentsCount?: number;
  attachments_count?: number;
  draftId?: string;
  messageId?: string;
  threadId?: string;
};

export type SentRecipientsResult = {
  since: string;
  fetchedAt?: string;
  fetched_at?: string;
  messageCount?: number;
  message_count?: number;
  recipientCount?: number;
  recipient_count?: number;
  recipients: string[];
};

function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  return base ? `${base}${path}` : path;
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) {
      return body.detail.map((item: { msg?: string }) => item.msg ?? String(item)).join(", ");
    }
    return JSON.stringify(body);
  } catch {
    return response.statusText || "Request failed";
  }
}

export class MailApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MailApiError";
    this.status = status;
  }
}

function normalizeGmailStatus(raw: Record<string, unknown>): GmailStatus {
  return {
    configured: Boolean(raw.configured),
    connected: Boolean(raw.connected),
    email: typeof raw.email === "string" ? raw.email : null,
    needsReauth: Boolean(raw.needsReauth ?? raw.needs_reauth),
    reason: typeof raw.reason === "string" ? raw.reason : null,
    missingScopes: (raw.missingScopes ?? raw.missing_scopes) as string[] | undefined,
  };
}

function normalizeResumeInfo(raw: Record<string, unknown>): ResumeInfo {
  return {
    saved: Boolean(raw.saved),
    filename: typeof raw.filename === "string" ? raw.filename : null,
    path: typeof raw.path === "string" ? raw.path : null,
    originalName: (raw.originalName ?? raw.original_name) as string | null | undefined,
    savedAt: (raw.savedAt ?? raw.saved_at) as string | null | undefined,
  };
}

function normalizeSentRecipients(raw: Record<string, unknown>): SentRecipientsResult {
  return {
    since: String(raw.since ?? ""),
    fetchedAt: (raw.fetchedAt ?? raw.fetched_at) as string | undefined,
    messageCount: (raw.messageCount ?? raw.message_count) as number | undefined,
    recipientCount: (raw.recipientCount ?? raw.recipient_count) as number | undefined,
    recipients: Array.isArray(raw.recipients) ? (raw.recipients as string[]) : [],
  };
}

export async function fetchGmailStatus(): Promise<GmailStatus> {
  const response = await fetch(apiUrl("/api/gmail/status"));
  if (!response.ok) {
    throw new MailApiError(await parseError(response), response.status);
  }
  return normalizeGmailStatus((await response.json()) as Record<string, unknown>);
}

export function startGmailAuth(returnTo = "/placetrack"): void {
  const params = new URLSearchParams({ returnTo });
  window.location.href = apiUrl(`/api/gmail/auth/start?${params}`);
}

export async function disconnectGmail(): Promise<void> {
  const response = await fetch(apiUrl("/api/gmail/disconnect"), { method: "POST" });
  if (!response.ok) {
    throw new MailApiError(await parseError(response), response.status);
  }
}

export async function fetchResumeInfo(): Promise<ResumeInfo> {
  const response = await fetch(apiUrl("/api/gmail/resume"));
  if (!response.ok) {
    throw new MailApiError(await parseError(response), response.status);
  }
  return normalizeResumeInfo((await response.json()) as Record<string, unknown>);
}

export async function uploadResume(file: File): Promise<ResumeInfo> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(apiUrl("/api/gmail/resume"), {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new MailApiError(await parseError(response), response.status);
  }

  const body = (await response.json()) as Record<string, unknown>;
  return normalizeResumeInfo(body);
}

export async function deleteResume(): Promise<void> {
  const response = await fetch(apiUrl("/api/gmail/resume"), { method: "DELETE" });
  if (!response.ok) {
    throw new MailApiError(await parseError(response), response.status);
  }
}

async function postMail(
  endpoint: "/api/gmail/draft" | "/api/gmail/send",
  payload: MailApiPayload,
  attachments: File[],
): Promise<MailApiResult> {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  for (const file of attachments) {
    form.append("attachments", file);
  }

  const response = await fetch(apiUrl(endpoint), {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new MailApiError(await parseError(response), response.status);
  }

  return response.json() as Promise<MailApiResult>;
}

export function createGmailDraft(payload: MailApiPayload, attachments: File[] = []): Promise<MailApiResult> {
  return postMail("/api/gmail/draft", payload, attachments);
}

export function sendGmail(payload: MailApiPayload, attachments: File[] = []): Promise<MailApiResult> {
  return postMail("/api/gmail/send", payload, attachments);
}

export async function fetchSentRecipients(options?: {
  since?: string;
  refresh?: boolean;
}): Promise<SentRecipientsResult> {
  const params = new URLSearchParams();
  if (options?.since) params.set("since", options.since);
  if (options?.refresh) params.set("refresh", "true");

  const query = params.toString();
  const response = await fetch(apiUrl(`/api/gmail/sent-recipients${query ? `?${query}` : ""}`));

  if (!response.ok) {
    throw new MailApiError(await parseError(response), response.status);
  }

  return normalizeSentRecipients((await response.json()) as Record<string, unknown>);
}
