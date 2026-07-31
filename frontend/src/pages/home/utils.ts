import type { JobDecisionResponse } from "@/lib/api";
import type { JobListResponse, JobRow } from "@/lib/types";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { ALL_VALUE, DEFAULT_APPLY_FILTER } from "./constants";

export function normalizedApplyStatus(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

export function isAppliedStatus(applyStatus: string | null | undefined): boolean {
  return normalizedApplyStatus(applyStatus) === "APPLIED";
}

export function isApplyingStatus(applyStatus: string | null | undefined): boolean {
  return normalizedApplyStatus(applyStatus) === "APPLYING";
}

/** Accept is only valid when the row is APPLY in Mongo (server enforces the same). */
export function showAcceptForStatus(applyStatus: string | null | undefined): boolean {
  return normalizedApplyStatus(applyStatus) === "APPLY";
}

export function showRejectForStatus(applyStatus: string | null | undefined): boolean {
  const s = normalizedApplyStatus(applyStatus);
  return s !== "REJECTED" && !isAppliedStatus(applyStatus) && !isApplyingStatus(applyStatus);
}

export function isRejectedStatus(applyStatus: string | null | undefined): boolean {
  return normalizedApplyStatus(applyStatus) === "REJECTED";
}

export function formatApplyStatusLabel(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "Pending";
  return s.replaceAll("_", " ");
}

/** Display scraper category in Title Case (e.g. "cloud engineer" → "Cloud Engineer"). */
export function formatCategoryLabel(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function applyStatusBadgeVariant(
  raw: string | null | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  const s = (raw ?? "").trim();
  if (!s) return "outline";
  if (s === "APPLY" || s === "APPLIED") return "default";
  if (s === "APPLYING") return "secondary";
  if (s === "DO_NOT_APPLY" || s === "REJECTED") return "destructive";
  if (s === "EXISTING") return "secondary";
  return "outline";
}

export function applyStatusBadgeClasses(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toUpperCase();
  if (!s) return "border-border/80 bg-background/70 text-foreground/85";
  if (s === "APPLY" || s === "APPLIED") {
    return "border-emerald-500/45 bg-emerald-500/[0.08] text-emerald-800 dark:text-emerald-200";
  }
  if (s === "APPLYING") {
    return "border-amber-500/45 bg-amber-500/[0.08] text-amber-900 dark:text-amber-200";
  }
  if (s === "DO_NOT_APPLY" || s === "REJECTED") {
    return "border-rose-500/45 bg-rose-500/[0.08] text-rose-800 dark:text-rose-200";
  }
  if (s === "EXISTING") {
    return "border-sky-500/45 bg-sky-500/[0.08] text-sky-800 dark:text-sky-200";
  }
  return "border-border/80 bg-background/70 text-foreground/85";
}

/** Non-empty meta fragments for the header line (seniority, experience, work model, type). */
export function jobMetaHighlights(job: JobRow): string[] {
  const out: string[] = [];
  for (const raw of [job.seniority, job.experience, job.workModel, job.employmentType]) {
    const s = (raw ?? "").trim();
    if (s && s !== "—") {
      out.push(s);
    }
  }
  return out;
}

export function formatApiDecisionError(res: JobDecisionResponse): string {
  const parts: string[] = [];
  const error = res.error?.trim();
  if (error) parts.push(error);
  for (const st of res.steps ?? []) {
    if (!st.ok) {
      const message = st.message.trim();
      if (!message) continue;
      if (error && (message === error || error.includes(message))) continue;
      parts.push(`${st.phase}: ${st.message}`);
    }
  }
  const out = parts.filter(Boolean).join("\n");
  return out || "Something went wrong.";
}

export function isAutoResolvedMidhtechDecision(res: JobDecisionResponse): boolean {
  return !res.ok && Boolean(res.applyStatusUpdated?.trim());
}

export function selectNextJobId(
  items: ReadonlyArray<{ jobId?: string | null }>,
  currentJobId: string,
): string | null {
  const ids = items.map((job) => (job.jobId ?? "").trim()).filter(Boolean);
  const idx = ids.indexOf(currentJobId);
  if (ids.length === 0) return null;
  if (idx === -1) return ids[0] ?? null;
  if (ids.length === 1) return null;
  return ids[idx + 1] ?? ids[idx - 1] ?? null;
}

export function jobShouldLeaveFilteredList(
  applyFilter: string,
  updatedStatus: string | null | undefined,
): boolean {
  const status = normalizedApplyStatus(updatedStatus);
  if (!status) return false;
  if (applyFilter === ALL_VALUE || applyFilter === "pending") return false;
  if (applyFilter === DEFAULT_APPLY_FILTER) return status !== "APPLY";
  return applyFilter.toUpperCase() !== status;
}

export function removeJobFromJobListInfiniteCache(queryClient: QueryClient, jobId: string): void {
  queryClient.setQueriesData<InfiniteData<JobListResponse>>(
    { queryKey: ["jobListInfinite"] },
    (old) => {
      if (!old) return old;
      const pages = old.pages.map((page) => {
        const before = page.items.length;
        const items = page.items.filter((job) => job.jobId !== jobId);
        const removed = before - items.length;
        return removed
          ? { ...page, items, total: Math.max(0, page.total - removed) }
          : page;
      });
      return { ...old, pages };
    },
  );
}

export function advancePastJobInList(
  queryClient: QueryClient,
  items: ReadonlyArray<{ jobId?: string | null }>,
  actingJobId: string,
  updatedStatus: string | null | undefined,
  applyFilter: string,
  setSelectedJobId: (value: string | null | ((prev: string | null) => string | null)) => void,
): void {
  if (!jobShouldLeaveFilteredList(applyFilter, updatedStatus)) return;
  const nextId = selectNextJobId(items, actingJobId);
  removeJobFromJobListInfiniteCache(queryClient, actingJobId);
  setSelectedJobId((prev) => (prev === actingJobId ? nextId : prev));
}
