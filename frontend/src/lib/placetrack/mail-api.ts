export type GmailStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  canModify?: boolean;
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

export type UnreadEmail = {
  id: string;
  threadId?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  subject: string;
  snippet: string;
  date?: string | null;
  internalDate?: string | null;
  labelIds?: string[];
};

export type EmailCategory =
  | "baharMil"
  | "oneSided"
  | "jobAds"
  | "pendingJobs"
  | "shopping"
  | "finTax"
  | "none";

export type ClassifyOneResult = {
  id: string;
  threadId?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  subject: string;
  snippet: string;
  category: EmailCategory;
  labelName?: string | null;
  reason?: string | null;
  source?: string | null;
};

export type ApplyLabelsResult = {
  archive: boolean;
  markRead: boolean;
  fetchedAt?: string;
  counts: {
    requested: number;
    baharMil: number;
    oneSided: number;
    jobAds: number;
    pendingJobs: number;
    shopping: number;
    finTax: number;
    skipped: number;
    applied: number;
    errors: number;
  };
  results: Array<Record<string, unknown>>;
};

export type UnreadInboxResult = {
  query: string;
  fetchedAt?: string;
  count: number;
  emails: UnreadEmail[];
};

export type GmailLabel = {
  id: string;
  name: string;
  type?: string | null;
};

export type GmailLabelsResult = {
  count: number;
  labels: GmailLabel[];
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
    canModify: raw.canModify == null && raw.can_modify == null ? undefined : Boolean(raw.canModify ?? raw.can_modify),
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

function normalizeUnreadEmail(raw: Record<string, unknown>): UnreadEmail {
  return {
    id: String(raw.id ?? ""),
    threadId: (raw.threadId ?? raw.thread_id) as string | null | undefined,
    fromName: (raw.fromName ?? raw.from_name) as string | null | undefined,
    fromEmail: (raw.fromEmail ?? raw.from_email) as string | null | undefined,
    subject: typeof raw.subject === "string" ? raw.subject : "(no subject)",
    snippet: typeof raw.snippet === "string" ? raw.snippet : "",
    date: (raw.date as string | null | undefined) ?? null,
    internalDate: (raw.internalDate ?? raw.internal_date) as string | null | undefined,
    labelIds: Array.isArray(raw.labelIds ?? raw.label_ids)
      ? ((raw.labelIds ?? raw.label_ids) as string[])
      : [],
  };
}

function normalizeCategory(value: unknown): EmailCategory {
  if (
    value === "baharMil" ||
    value === "oneSided" ||
    value === "jobAds" ||
    value === "pendingJobs" ||
    value === "shopping" ||
    value === "finTax"
  ) {
    return value;
  }
  return "none";
}

function normalizeClassifyOne(raw: Record<string, unknown>): ClassifyOneResult {
  return {
    id: String(raw.id ?? ""),
    threadId: (raw.threadId ?? raw.thread_id) as string | null | undefined,
    fromName: (raw.fromName ?? raw.from_name) as string | null | undefined,
    fromEmail: (raw.fromEmail ?? raw.from_email) as string | null | undefined,
    subject: typeof raw.subject === "string" ? raw.subject : "(no subject)",
    snippet: typeof raw.snippet === "string" ? raw.snippet : "",
    category: normalizeCategory(raw.category),
    labelName: (raw.labelName ?? raw.label_name) as string | null | undefined,
    reason: typeof raw.reason === "string" ? raw.reason : null,
    source: typeof raw.source === "string" ? raw.source : null,
  };
}

function normalizeUnreadInbox(raw: Record<string, unknown>): UnreadInboxResult {
  const emailsRaw = Array.isArray(raw.emails) ? raw.emails : [];
  const emails = emailsRaw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map(normalizeUnreadEmail)
    .filter((email) => email.id);

  return {
    query: typeof raw.query === "string" ? raw.query : "",
    fetchedAt: (raw.fetchedAt ?? raw.fetched_at) as string | undefined,
    count: typeof raw.count === "number" ? raw.count : emails.length,
    emails,
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

export async function downloadResume(fallbackFilename = "Resume.pdf"): Promise<void> {
  const response = await fetch(apiUrl("/api/gmail/resume/download"));
  if (!response.ok) {
    throw new MailApiError(await parseError(response), response.status);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? fallbackFilename;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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

export async function fetchUnreadPrimaryEmails(options?: {
  maxResults?: number;
}): Promise<UnreadInboxResult> {
  const params = new URLSearchParams();
  if (options?.maxResults != null) params.set("maxResults", String(options.maxResults));

  const query = params.toString();
  const response = await fetch(apiUrl(`/api/gmail/inbox/unread${query ? `?${query}` : ""}`));

  if (!response.ok) {
    throw new MailApiError(await parseError(response), response.status);
  }

  return normalizeUnreadInbox((await response.json()) as Record<string, unknown>);
}

export type NoiseCategoryCounts = {
  fetchedAt?: string;
  total: number;
  categories: {
    promotions: number;
    social: number;
    updates: number;
  };
};

export type NoiseDeleteResult = {
  fetchedAt?: string;
  permanent: boolean;
  requested: number;
  deleted: number;
  categories: Record<string, unknown>;
  errors: string[];
};

export async function fetchNoiseCategoryCount(): Promise<NoiseCategoryCounts> {
  const response = await fetch(apiUrl("/api/gmail/inbox/noise-count"));
  if (!response.ok) {
    throw new MailApiError(await parseError(response), response.status);
  }
  const raw = (await response.json()) as Record<string, unknown>;
  const cats = (raw.categories ?? {}) as Record<string, Record<string, unknown>>;
  return {
    fetchedAt: (raw.fetchedAt ?? raw.fetched_at) as string | undefined,
    total: Number(raw.total ?? 0),
    categories: {
      promotions: Number(cats.promotions?.count ?? 0),
      social: Number(cats.social?.count ?? 0),
      updates: Number(cats.updates?.count ?? 0),
    },
  };
}

export async function deleteNoiseCategoryMail(permanent = true): Promise<NoiseDeleteResult> {
  const params = new URLSearchParams({ permanent: permanent ? "true" : "false" });
  const response = await fetch(apiUrl(`/api/gmail/inbox/noise-delete?${params}`), {
    method: "POST",
  });
  if (!response.ok) {
    throw new MailApiError(await parseError(response), response.status);
  }
  const raw = (await response.json()) as Record<string, unknown>;
  return {
    fetchedAt: (raw.fetchedAt ?? raw.fetched_at) as string | undefined,
    permanent: Boolean(raw.permanent),
    requested: Number(raw.requested ?? 0),
    deleted: Number(raw.deleted ?? 0),
    categories: (raw.categories as Record<string, unknown>) ?? {},
    errors: Array.isArray(raw.errors) ? (raw.errors as string[]) : [],
  };
}

export async function fetchGmailLabels(): Promise<GmailLabelsResult> {
  const response = await fetch(apiUrl("/api/gmail/labels"));
  if (!response.ok) {
    throw new MailApiError(await parseError(response), response.status);
  }
  const raw = (await response.json()) as Record<string, unknown>;
  const labelsRaw = Array.isArray(raw.labels) ? raw.labels : [];
  const labels = labelsRaw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      id: String(item.id ?? ""),
      name: String(item.name ?? ""),
      type: typeof item.type === "string" ? item.type : null,
    }))
    .filter((label) => label.id && label.name);

  return {
    count: typeof raw.count === "number" ? raw.count : labels.length,
    labels,
  };
}

export async function classifyOneEmail(messageId: string, useLlm = true): Promise<ClassifyOneResult> {
  const response = await fetch(apiUrl("/api/gmail/inbox/classify-one"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId, useLlm }),
  });
  if (!response.ok) {
    throw new MailApiError(await parseError(response), response.status);
  }
  return normalizeClassifyOne((await response.json()) as Record<string, unknown>);
}

export async function classifyEmailBatch(
  messageIds: string[],
  useLlm = true,
): Promise<ClassifyOneResult[]> {
  const response = await fetch(apiUrl("/api/gmail/inbox/classify-batch"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageIds, useLlm }),
  });
  if (!response.ok) {
    throw new MailApiError(await parseError(response), response.status);
  }
  const raw = (await response.json()) as Record<string, unknown>;
  const rows = Array.isArray(raw.results) ? raw.results : [];
  return rows
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map(normalizeClassifyOne)
    .filter((item) => item.id);
}

const APPLY_LABELS_BATCH_SIZE = 200;

async function applyEmailLabelsOnce(options: {
  items: Array<{ messageId: string; category: EmailCategory }>;
  archive?: boolean;
  markRead?: boolean;
}): Promise<ApplyLabelsResult> {
  const response = await fetch(apiUrl("/api/gmail/inbox/apply-labels"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: options.items.map((item) => ({
        messageId: item.messageId,
        category: item.category === "none" ? null : item.category,
      })),
      archive: options.archive ?? true,
      markRead: options.markRead ?? true,
    }),
  });
  if (!response.ok) {
    throw new MailApiError(await parseError(response), response.status);
  }

  const raw = (await response.json()) as Record<string, unknown>;
  const countsRaw = (raw.counts ?? {}) as Record<string, unknown>;
  return {
    archive: Boolean(raw.archive),
    markRead: Boolean(raw.markRead ?? raw.mark_read),
    fetchedAt: (raw.fetchedAt ?? raw.fetched_at) as string | undefined,
    counts: {
      requested: Number(countsRaw.requested ?? 0),
      baharMil: Number(countsRaw.baharMil ?? 0),
      oneSided: Number(countsRaw.oneSided ?? 0),
      jobAds: Number(countsRaw.jobAds ?? 0),
      pendingJobs: Number(countsRaw.pendingJobs ?? 0),
      shopping: Number(countsRaw.shopping ?? 0),
      finTax: Number(countsRaw.finTax ?? 0),
      skipped: Number(countsRaw.skipped ?? 0),
      applied: Number(countsRaw.applied ?? 0),
      errors: Number(countsRaw.errors ?? 0),
    },
    results: Array.isArray(raw.results) ? (raw.results as Array<Record<string, unknown>>) : [],
  };
}

export async function applyEmailLabels(options: {
  items: Array<{ messageId: string; category: EmailCategory }>;
  archive?: boolean;
  markRead?: boolean;
}): Promise<ApplyLabelsResult> {
  const items = options.items;
  if (!items.length) {
    return {
      archive: options.archive ?? true,
      markRead: options.markRead ?? true,
      counts: {
        requested: 0,
        baharMil: 0,
        oneSided: 0,
        jobAds: 0,
        pendingJobs: 0,
        shopping: 0,
        finTax: 0,
        skipped: 0,
        applied: 0,
        errors: 0,
      },
      results: [],
    };
  }

  const merged: ApplyLabelsResult = {
    archive: options.archive ?? true,
    markRead: options.markRead ?? true,
    counts: {
      requested: 0,
      baharMil: 0,
      oneSided: 0,
      jobAds: 0,
      pendingJobs: 0,
      shopping: 0,
      finTax: 0,
      skipped: 0,
      applied: 0,
      errors: 0,
    },
    results: [],
  };

  for (let start = 0; start < items.length; start += APPLY_LABELS_BATCH_SIZE) {
    const chunk = items.slice(start, start + APPLY_LABELS_BATCH_SIZE);
    const batch = await applyEmailLabelsOnce({
      items: chunk,
      archive: options.archive,
      markRead: options.markRead,
    });
    merged.fetchedAt = batch.fetchedAt ?? merged.fetchedAt;
    merged.archive = batch.archive;
    merged.markRead = batch.markRead;
    merged.counts.requested += batch.counts.requested;
    merged.counts.baharMil += batch.counts.baharMil;
    merged.counts.oneSided += batch.counts.oneSided;
    merged.counts.jobAds += batch.counts.jobAds;
    merged.counts.pendingJobs += batch.counts.pendingJobs;
    merged.counts.shopping += batch.counts.shopping;
    merged.counts.finTax += batch.counts.finTax;
    merged.counts.skipped += batch.counts.skipped;
    merged.counts.applied += batch.counts.applied;
    merged.counts.errors += batch.counts.errors;
    merged.results.push(...batch.results);
  }

  return merged;
}
