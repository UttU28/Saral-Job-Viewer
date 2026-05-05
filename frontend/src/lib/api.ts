import type { JobListResponse, JobRow, JobSummary } from "@/lib/types";

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
  const response = await fetch(buildUrl(path, searchParams), {
    credentials: "omit",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
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
