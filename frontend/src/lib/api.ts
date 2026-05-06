import type { JobListResponse, JobRow, JobSummary } from "@/lib/types";
import { readAuthToken, type AuthUser } from "@/lib/authStorage";

function extractDetailMessage(detail: unknown): string | null {
  if (typeof detail === "string") {
    const s = detail.trim();
    return s || null;
  }
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const msg = (item as Record<string, unknown>).msg;
          if (typeof msg === "string") return msg.trim();
        }
        return "";
      })
      .filter(Boolean);
    return parts.length ? parts.join("; ") : null;
  }
  if (detail && typeof detail === "object") {
    const rec = detail as Record<string, unknown>;
    if (typeof rec.message === "string" && rec.message.trim()) return rec.message.trim();
    if (typeof rec.error === "string" && rec.error.trim()) return rec.error.trim();
    if (typeof rec.msg === "string" && rec.msg.trim()) return rec.msg.trim();
  }
  return null;
}

async function buildApiError(response: Response): Promise<Error> {
  const fallback = `HTTP ${response.status}`;
  const text = (await response.text()).trim();
  if (!text) return new Error(fallback);
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const detail =
      extractDetailMessage(parsed.detail) ??
      extractDetailMessage(parsed.error) ??
      extractDetailMessage(parsed.message);
    return new Error(detail || fallback);
  } catch {
    return new Error(text);
  }
}

export function formatClientError(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof Error) {
    const s = error.message.trim();
    return s || fallback;
  }
  if (typeof error === "string") {
    const s = error.trim();
    return s || fallback;
  }
  return fallback;
}

function buildUrl(path: string, searchParams?: Record<string, string | undefined>): string {
  const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  const url = base ? `${base}${path}` : path;
  if (!searchParams) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== "") {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `${url}?${query}` : url;
}

async function fetchJson<T>(path: string, searchParams?: Record<string, string | undefined>): Promise<T> {
  const token = readAuthToken();
  const response = await fetch(buildUrl(path, searchParams), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: "omit",
  });
  if (!response.ok) {
    throw await buildApiError(response);
  }
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  const url = base ? `${base}${path}` : path;
  const token = readAuthToken();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "omit",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await buildApiError(response);
  }
  return response.json() as Promise<T>;
}

export async function fetchJobList(params: {
  page: number;
  pageSize: number;
  platform?: string;
  applyStatus?: string;
  search?: string;
}): Promise<JobListResponse> {
  return fetchJson<JobListResponse>("/api/jobs", {
    page: String(params.page),
    pageSize: String(params.pageSize),
    platform: params.platform,
    applyStatus: params.applyStatus,
    search: params.search,
  });
}

export async function fetchJobSummary(): Promise<JobSummary> {
  return fetchJson<JobSummary>("/api/jobs/summary");
}

export async function fetchJobPlatforms(): Promise<{ platforms: string[] }> {
  return fetchJson<{ platforms: string[] }>("/api/jobs/platforms");
}

export async function fetchJobDetail(jobId: string): Promise<JobRow> {
  return fetchJson<JobRow>(`/api/jobs/${encodeURIComponent(jobId)}`);
}

export type JobDecision = "accept" | "reject";

export type AuthResponse = {
  ok: boolean;
  token: string;
  user: AuthUser;
};

export type WeeklyDecisionEvent = {
  eventType: string;
  jobId: string | null;
  delta: number;
  timestampIso: string;
};

export type WeeklyReportRow = {
  weekKey: string;
  weekStartIso: string;
  weekEndIso: string;
  acceptedCount: number;
  rejectedCount: number;
  totalCount: number;
  updatedAt: string;
  createdAt: string;
  events: WeeklyDecisionEvent[];
};

export type WeeklyReportResponse = {
  weeks: WeeklyReportRow[];
  summary: {
    acceptedCount: number;
    rejectedCount: number;
    totalCount: number;
  };
};

export type JobDecisionProfile = {
  name: string;
  email: string;
  password: string;
};

export type JobDecisionStep = {
  phase: string;
  ok: boolean;
  message: string;
};

export type JobDecisionSkippedReason =
  | "ALREADY_APPLIED"
  | "APPLY_IN_PROGRESS"
  | "INVALID_STATUS_FOR_ACCEPT";

export type JobDecisionResponse = {
  ok: boolean;
  decision: JobDecision;
  steps: JobDecisionStep[];
  applyStatusUpdated: string | null;
  error: string | null;
  /** Apply status in Mongo after this response (or at skip time). */
  dbApplyStatus: string | null;
  /** Set when the action was blocked without calling Midhtech / without changing status as requested. */
  skippedReason: JobDecisionSkippedReason | null;
};

export async function postRejectedJobToApply(jobId: string): Promise<{ ok: boolean; applyStatus: string }> {
  return postJson<{ ok: boolean; applyStatus: string }>(
    `/api/jobs/${encodeURIComponent(jobId)}/rejected-to-apply`,
    {},
  );
}

export async function submitJobDecision(params: {
  decision: JobDecision;
  job: JobRow;
  profile: JobDecisionProfile;
}): Promise<JobDecisionResponse> {
  return postJson<JobDecisionResponse>("/api/jobs/decision", {
    decision: params.decision,
    job: params.job,
    profileName: params.profile.name,
    profileEmail: params.profile.email,
    profilePassword: params.profile.password,
  });
}

export function registerUser(name: string, email: string, password: string): Promise<AuthResponse> {
  return postJson<AuthResponse>("/api/auth/register", { name, email, password });
}

export function loginUser(email: string, password: string): Promise<AuthResponse> {
  return postJson<AuthResponse>("/api/auth/login", { email, password });
}

export function fetchCurrentUser(): Promise<{ ok: boolean; user: AuthUser }> {
  return fetchJson<{ ok: boolean; user: AuthUser }>("/api/auth/me");
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>("/api/auth/change-password", {
    currentPassword,
    newPassword,
  });
}

export function logoutUser(): Promise<{ ok: boolean; userId: string }> {
  return postJson<{ ok: boolean; userId: string }>("/api/auth/logout", {});
}

export function fetchWeeklyReport(): Promise<WeeklyReportResponse> {
  return fetchJson<WeeklyReportResponse>("/api/profile/weekly-report");
}
