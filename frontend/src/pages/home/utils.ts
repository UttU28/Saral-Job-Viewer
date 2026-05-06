import type { JobDecisionResponse } from "@/lib/api";
import type { JobRow } from "@/lib/types";

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
  if (res.error?.trim()) parts.push(res.error.trim());
  for (const st of res.steps ?? []) {
    if (!st.ok) parts.push(`${st.phase}: ${st.message}`);
  }
  const out = parts.filter(Boolean).join("\n");
  return out || "Something went wrong.";
}
