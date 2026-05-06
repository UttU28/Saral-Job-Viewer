import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MapPin,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useJobDetailQuery, useJobInfiniteQuery, useJobPlatformsQuery } from "@/hooks/use-jobs";
import {
  postRejectedJobToApply,
  submitJobDecision,
  type JobDecision,
  type JobDecisionResponse,
} from "@/lib/api";
import {
  buildDescriptionHighlightSegments,
  findJobDescriptionRestrictionTags,
} from "@/lib/jobDescriptionRestrictions";
import { readProfileFromCookie } from "@/lib/profileCookie";
import type { JobRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const ALL_VALUE = "__all__";
const PAGE_SIZE = 18;

const DEFAULT_APPLY_FILTER = "APPLY";

const APPLY_OPTIONS = [
  { value: ALL_VALUE, label: "All statuses" },
  { value: "pending", label: "Pending (no status)" },
  { value: DEFAULT_APPLY_FILTER, label: "APPLY" },
  { value: "DO_NOT_APPLY", label: "DO NOT APPLY" },
  { value: "EXISTING", label: "EXISTING" },
  { value: "APPLIED", label: "APPLIED" },
  { value: "REDO", label: "REDO" },
  { value: "REJECTED", label: "REJECTED" },
] as const;

function normalizedApplyStatus(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

/** Apply status after a successful Accept from the viewer. */
function isAppliedStatus(applyStatus: string | null | undefined): boolean {
  return normalizedApplyStatus(applyStatus) === "APPLIED";
}

function showAcceptForStatus(applyStatus: string | null | undefined): boolean {
  return !isAppliedStatus(applyStatus);
}

function showRejectForStatus(applyStatus: string | null | undefined): boolean {
  const s = normalizedApplyStatus(applyStatus);
  return s !== "REJECTED" && !isAppliedStatus(applyStatus);
}

function isRejectedStatus(applyStatus: string | null | undefined): boolean {
  return normalizedApplyStatus(applyStatus) === "REJECTED";
}

function formatApplyStatusLabel(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "Pending";
  return s.replaceAll("_", " ");
}

function applyStatusBadgeVariant(
  raw: string | null | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  const s = (raw ?? "").trim();
  if (!s) return "outline";
  if (s === "APPLY" || s === "APPLIED") return "default";
  if (s === "DO_NOT_APPLY" || s === "REJECTED") return "destructive";
  if (s === "EXISTING") return "secondary";
  return "outline";
}

function primaryJobLink(job: JobRow): string | null {
  const a = (job.originalJobPostUrl ?? "").trim();
  const b = (job.jobUrl ?? "").trim();
  return a || b || null;
}

/** Non-empty meta fragments for the header line (seniority, experience, work model, type). */
function jobMetaHighlights(job: JobRow): string[] {
  const out: string[] = [];
  for (const raw of [job.seniority, job.experience, job.workModel, job.employmentType]) {
    const s = (raw ?? "").trim();
    if (s && s !== "—") {
      out.push(s);
    }
  }
  return out;
}

/** Meta accents: on dark, use mid pastels (300/200) so blues never read as “ink on black”. */
const pastelMetaLineClasses = [
  "text-indigo-800/90 dark:text-indigo-300",
  "text-sky-800/88 dark:text-sky-300",
  "text-emerald-800/88 dark:text-emerald-300",
  "text-amber-900/85 dark:text-amber-200",
] as const;

/** Per-card Accept/Reject UI driven from Home (loading overlay + result strip). */
type JobListCardDecisionUi = {
  loading: boolean;
  kind?: JobDecision;
  flash?: {
    variant: "success" | "error";
    message: string;
    detail?: string;
    applyStatus?: string | null;
  };
};

function formatApiDecisionError(res: JobDecisionResponse): string {
  const parts: string[] = [];
  if (res.error?.trim()) parts.push(res.error.trim());
  for (const st of res.steps ?? []) {
    if (!st.ok) parts.push(`${st.phase}: ${st.message}`);
  }
  const out = parts.filter(Boolean).join("\n");
  return out || "Something went wrong.";
}

function JobListCard({
  job,
  selected,
  onSelect,
  decisionUi,
  onDismissFlash,
}: {
  job: JobRow;
  selected: boolean;
  onSelect: () => void;
  decisionUi?: JobListCardDecisionUi;
  onDismissFlash?: () => void;
}) {
  const cardMetaLines = jobMetaHighlights(job);
  const companyText = (job.companyName ?? "").trim();
  const locationText = (job.location ?? "").trim();

  const badgeApplyStatus =
    decisionUi?.flash?.variant === "success" && decisionUi.flash.applyStatus != null && decisionUi.flash.applyStatus !== ""
      ? decisionUi.flash.applyStatus
      : job.applyStatus;

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "relative z-0 w-full text-left rounded-xl border px-3 py-2.5 sm:px-3.5 sm:py-3 transition-all duration-200",
          "hover:border-primary/35 hover:bg-muted/60 dark:hover:bg-white/[0.04]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          selected
            ? "border-primary/50 bg-primary/[0.12] shadow-[0_0_0_1px_rgba(139,92,246,0.25)]"
            : "border-border bg-card/40",
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <Badge
            variant="outline"
            className={cn(
              "text-[11px] px-2 py-0 h-6 font-medium",
              selected ? "border-primary/40 text-primary" : "border-border dark:border-white/15",
            )}
          >
            {job.platform ?? "?"}
          </Badge>
          <Badge
            variant={applyStatusBadgeVariant(badgeApplyStatus)}
            className="text-[11px] px-2 py-0 h-6 font-medium"
          >
            {formatApplyStatusLabel(badgeApplyStatus)}
          </Badge>
        </div>
      <h3 className="text-[15px] sm:text-base font-semibold font-display text-foreground leading-snug line-clamp-2 mb-1.5">
        {job.title ?? "Untitled role"}
      </h3>
      {companyText || locationText ? (
        <div className="flex flex-col gap-1 text-xs min-w-0 leading-snug">
          {companyText ? (
            <span className="inline-flex items-center gap-1.5 text-sky-800/88 dark:text-sky-300 min-w-0">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-sky-600/70 dark:text-sky-400" />
              <span className="truncate">{companyText}</span>
            </span>
          ) : null}
          {locationText ? (
            <span className="inline-flex items-center gap-1.5 text-rose-800/88 dark:text-rose-300 min-w-0">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-rose-600/65 dark:text-rose-400" />
              <span className="truncate">{locationText}</span>
            </span>
          ) : null}
        </div>
      ) : null}
      {cardMetaLines.length > 0 ? (
        <div className="mt-2 pt-1.5 border-t border-border/80 dark:border-border/60 flex flex-wrap items-center gap-y-0 text-[11px] leading-snug rounded-md bg-gradient-to-r from-violet-500/[0.08] via-transparent to-emerald-500/[0.06] dark:from-violet-500/[0.12] dark:to-emerald-500/[0.08] px-2 py-1.5">
          {cardMetaLines.map((line, lineIndex) => (
            <span key={`${line}-${lineIndex}`} className="inline-flex items-center max-w-full">
              {lineIndex > 0 ? (
                <span className="text-muted-foreground/55 dark:text-zinc-500 mx-1.5 shrink-0 select-none" aria-hidden>
                  ·
                </span>
              ) : null}
              <span
                className={cn(
                  "font-medium truncate",
                  pastelMetaLineClasses[lineIndex % pastelMetaLineClasses.length],
                )}
              >
                {line}
              </span>
            </span>
          ))}
        </div>
      ) : null}
      </button>

      {decisionUi?.loading ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl border border-primary/25 bg-background/92 dark:bg-zinc-950/92 px-3 py-3 text-center shadow-sm pointer-events-auto"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-6 w-6 sm:h-7 sm:w-7 animate-spin text-primary shrink-0" aria-hidden />
          <p className="text-[11px] sm:text-xs font-semibold text-foreground leading-snug px-1">
            {decisionUi.kind === "accept" ? "Submitting via Midhtech…" : "Updating status…"}
          </p>
        </div>
      ) : null}

      {decisionUi?.flash && !decisionUi.loading ? (
        <div
          className={cn(
            "mt-1.5 rounded-lg border px-2.5 py-2 text-left text-[11px] sm:text-xs leading-snug",
            decisionUi.flash.variant === "success"
              ? "border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-900 dark:text-emerald-100/95"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          <p className="font-medium">{decisionUi.flash.message}</p>
          {decisionUi.flash.variant === "error" && decisionUi.flash.detail ? (
            <pre className="mt-1.5 whitespace-pre-wrap break-words font-sans text-[10px] sm:text-[11px] opacity-95">
              {decisionUi.flash.detail}
            </pre>
          ) : null}
          {decisionUi.flash.variant === "error" ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDismissFlash?.();
              }}
              className="mt-2 text-[10px] sm:text-xs font-semibold underline underline-offset-2 hover:opacity-90"
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function JobDetailPane({
  jobId,
  decisionBusyJobId,
  decisionBusyKind,
  beginDecision,
  finishDecision,
}: {
  jobId: string | null;
  decisionBusyJobId: string | null;
  decisionBusyKind: JobDecision | null;
  beginDecision: (actingJobId: string, kind: JobDecision) => number;
  finishDecision: (actingJobId: string, gen: number, result: JobDecisionResponse | null, err: unknown) => void;
}) {
  const detailQuery = useJobDetailQuery(jobId, Boolean(jobId));
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [profileRequiredOpen, setProfileRequiredOpen] = useState(false);
  const [acceptKeywordsConfirmOpen, setAcceptKeywordsConfirmOpen] = useState(false);
  const [moveToApplyPending, setMoveToApplyPending] = useState(false);
  const [acceptProgressOpen, setAcceptProgressOpen] = useState(false);
  const [acceptProgressLoading, setAcceptProgressLoading] = useState(false);
  const [acceptProgressResult, setAcceptProgressResult] = useState<JobDecisionResponse | null>(null);
  const [acceptProgressNetworkError, setAcceptProgressNetworkError] = useState<string | null>(null);

  useEffect(() => {
    setAcceptKeywordsConfirmOpen(false);
    setAcceptProgressOpen(false);
    setAcceptProgressLoading(false);
    setAcceptProgressResult(null);
    setAcceptProgressNetworkError(null);
  }, [jobId]);

  const restrictionTags = useMemo(
    () => findJobDescriptionRestrictionTags(detailQuery.data?.jobDescription),
    [detailQuery.data?.jobDescription],
  );
  const descriptionHighlightSegments = useMemo(
    () => buildDescriptionHighlightSegments(detailQuery.data?.jobDescription ?? ""),
    [detailQuery.data?.jobDescription],
  );

  if (!jobId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] lg:min-h-[480px] text-center px-6 py-16 border border-dashed border-border rounded-2xl bg-muted/25 dark:bg-white/[0.02] m-4 lg:m-6">
        <Sparkles className="h-10 w-10 text-primary/40 mb-4" />
        <p className="font-display font-semibold text-lg text-foreground">Select a job</p>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
          Choose a listing on the left to see the full description, links, and metadata here.
        </p>
      </div>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <div className="p-6 lg:p-8 space-y-4">
        <Skeleton className="h-10 w-4/5 max-w-xl rounded-lg bg-muted dark:bg-white/5" />
        <Skeleton className="h-5 w-64 rounded bg-muted dark:bg-white/5" />
        <Skeleton className="h-4 w-3/5 max-w-md rounded bg-muted dark:bg-white/5" />
        <Skeleton className="h-10 w-40 rounded-xl bg-muted dark:bg-white/5" />
        <Skeleton className="h-40 w-full rounded-xl bg-muted dark:bg-white/5" />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="p-6 lg:p-8 text-destructive text-sm">
        Could not load this job. Try another listing.
      </div>
    );
  }

  const job = detailQuery.data;
  const originalUrl = (job.originalJobPostUrl ?? "").trim();
  const platformUrl = (job.jobUrl ?? "").trim();

  const executeAcceptSubmit = async () => {
    const stored = readProfileFromCookie();
    const name = (stored?.name ?? "").trim();
    const email = (stored?.email ?? "").trim();
    const password = (stored?.password ?? "").trim();
    if (!email || !password) {
      setProfileRequiredOpen(true);
      return;
    }
    const actingJobId = (job.jobId ?? jobId ?? "").trim();
    if (!actingJobId) return;

    setAcceptProgressOpen(true);
    setAcceptProgressLoading(true);
    setAcceptProgressResult(null);
    setAcceptProgressNetworkError(null);

    const requestGen = beginDecision(actingJobId, "accept");
    try {
      const res = await submitJobDecision({
        decision: "accept",
        job,
        profile: { name, email, password },
      });
      setAcceptProgressLoading(false);
      setAcceptProgressResult(res);
      finishDecision(actingJobId, requestGen, res, null);
    } catch (err) {
      setAcceptProgressLoading(false);
      setAcceptProgressNetworkError(
        err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err),
      );
      finishDecision(actingJobId, requestGen, null, err);
    }
  };

  const sendJobDecision = async (decision: JobDecision) => {
    if (decision === "accept") {
      const stored = readProfileFromCookie();
      const email = (stored?.email ?? "").trim();
      const password = (stored?.password ?? "").trim();
      if (!email || !password) {
        setProfileRequiredOpen(true);
        return;
      }
      if (restrictionTags.length > 0) {
        setAcceptKeywordsConfirmOpen(true);
        return;
      }
      await executeAcceptSubmit();
      return;
    }

    const actingJobId = (job.jobId ?? jobId ?? "").trim();
    if (!actingJobId) return;
    const requestGen = beginDecision(actingJobId, "reject");
    try {
      const res = await submitJobDecision({
        decision: "reject",
        job,
        profile: { name: "", email: "", password: "" },
      });
      finishDecision(actingJobId, requestGen, res, null);
    } catch (err) {
      finishDecision(actingJobId, requestGen, null, err);
    }
  };

  const handleMoveRejectedToApply = async () => {
    const jid = (job.jobId ?? jobId ?? "").trim();
    if (!jid) return;
    setMoveToApplyPending(true);
    try {
      await postRejectedJobToApply(jid);
      await queryClient.invalidateQueries({ queryKey: ["jobDetail", jid] });
      await queryClient.invalidateQueries({ queryKey: ["jobListInfinite"] });
      await queryClient.invalidateQueries({ queryKey: ["jobSummary"] });
      toast({
        title: "Status updated",
        description: "Job moved from REJECTED to APPLY.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not update job",
        description: err instanceof Error ? err.message : "Request failed.",
      });
    } finally {
      setMoveToApplyPending(false);
    }
  };

  const metaLine = jobMetaHighlights(job);
  const companyLine = (job.companyName ?? "").trim();
  const locationLine = (job.location ?? "").trim();

  const decisionBusyHere = Boolean(
    decisionBusyJobId && jobId && decisionBusyJobId === jobId,
  );

  const titleRowSegments: ReactNode[] = [];
  if (companyLine) {
    titleRowSegments.push(
      <span
        key="company"
        className="inline-flex items-center gap-2 text-sky-800/90 dark:text-sky-300 min-w-0 max-w-full"
      >
        <Building2 className="h-4 w-4 text-sky-600/75 dark:text-sky-400 shrink-0" />
        <span className="truncate">{companyLine}</span>
      </span>,
    );
  }
  if (locationLine) {
    titleRowSegments.push(
      <span
        key="location"
        className="inline-flex items-center gap-2 text-rose-800/90 dark:text-rose-300 min-w-0 max-w-full"
      >
        <MapPin className="h-4 w-4 text-rose-600/70 dark:text-rose-400 shrink-0" />
        <span className="truncate">{locationLine}</span>
      </span>,
    );
  }
  for (let i = 0; i < metaLine.length; i += 1) {
    titleRowSegments.push(
      <span
        key={`meta-${i}`}
        className={cn("font-medium", pastelMetaLineClasses[i % pastelMetaLineClasses.length])}
      >
        {metaLine[i]}
      </span>,
    );
  }

  return (
    <>
      <AlertDialog open={profileRequiredOpen} onOpenChange={setProfileRequiredOpen}>
        <AlertDialogContent className="rounded-2xl border-border bg-card sm:max-w-md shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary shrink-0" aria-hidden />
              Email and password required
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-left text-muted-foreground space-y-3 text-sm leading-relaxed pt-1">
                <p>
                  <strong className="text-foreground font-medium">Accept</strong> logs into Midhtech with your saved{" "}
                  <strong className="text-foreground font-medium">email</strong> and{" "}
                  <strong className="text-foreground font-medium">password</strong> and submits this job. Add them in Settings, then click{" "}
                  <strong className="text-foreground font-medium">Save to cookie</strong>. <strong className="text-foreground font-medium">Reject</strong> only
                  updates the database and does not need credentials.
                </p>
                <p className="text-xs text-muted-foreground/90">Your name is optional but will be sent with Accept if you set it.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl border-border mt-0">Close</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl gap-2"
              onClick={() => {
                setProfileRequiredOpen(false);
                navigate("/settings");
              }}
            >
              <Settings className="h-4 w-4" aria-hidden />
              Open Settings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={acceptKeywordsConfirmOpen} onOpenChange={setAcceptKeywordsConfirmOpen}>
        <AlertDialogContent className="rounded-2xl border-border bg-card sm:max-w-lg shadow-xl max-h-[90vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl flex items-center gap-2 text-left">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden />
              Confirm accept — flagged description
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-left space-y-3 text-sm text-muted-foreground pt-1">
                <p>
                  This posting matches eligibility or sponsorship-related phrases. Submitting still sends it to Midhtech
                  and marks the job as applied if the request succeeds. Cancel if you want to skip.
                </p>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground/80 mb-2">Detected tags</p>
                  <div className="flex flex-wrap gap-2">
                    {restrictionTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex max-w-full items-center rounded-lg border border-rose-500/45 bg-rose-500/[0.11] px-2.5 py-1 text-xs font-medium text-rose-950 dark:border-rose-400/40 dark:bg-rose-950/50 dark:text-rose-100/95"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl border-border mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-600/90"
              onClick={() => {
                setAcceptKeywordsConfirmOpen(false);
                void executeAcceptSubmit();
              }}
            >
              Continue and submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={acceptProgressOpen}
        onOpenChange={(open) => {
          if (!open && acceptProgressLoading) return;
          setAcceptProgressOpen(open);
          if (!open) {
            setAcceptProgressResult(null);
            setAcceptProgressNetworkError(null);
          }
        }}
      >
        <DialogContent
          className="rounded-2xl border-border bg-card sm:max-w-md shadow-xl"
          onPointerDownOutside={(e) => {
            if (acceptProgressLoading) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (acceptProgressLoading) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2 pr-8">
              {acceptProgressLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" aria-hidden />
                  Submitting accept…
                </>
              ) : acceptProgressNetworkError ? (
                <>
                  <XCircle className="h-5 w-5 text-destructive shrink-0" aria-hidden />
                  Accept failed
                </>
              ) : acceptProgressResult?.ok ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden />
                  Accept complete
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-destructive shrink-0" aria-hidden />
                  Accept failed
                </>
              )}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-left space-y-3 text-sm text-muted-foreground pt-1">
                {acceptProgressLoading ? (
                  <p className="text-foreground/90">
                    Logging in to Midhtech and submitting this job. This usually takes a few seconds — please keep this
                    dialog open.
                  </p>
                ) : acceptProgressNetworkError ? (
                  <p className="text-destructive font-medium whitespace-pre-wrap break-words">
                    {acceptProgressNetworkError}
                  </p>
                ) : acceptProgressResult ? (
                  <>
                    {acceptProgressResult.ok ? (
                      <p className="text-foreground/90">
                        {acceptProgressResult.applyStatusUpdated ? (
                          <>
                            Status updated to{" "}
                            <strong className="text-foreground">
                              {acceptProgressResult.applyStatusUpdated.replaceAll("_", " ")}
                            </strong>
                            .
                          </>
                        ) : (
                          "The job was submitted successfully."
                        )}
                      </p>
                    ) : (
                      <>
                        {acceptProgressResult.error ? (
                          <p className="text-destructive font-medium whitespace-pre-wrap break-words">
                            {acceptProgressResult.error}
                          </p>
                        ) : null}
                        {acceptProgressResult.steps?.some((s) => !s.ok) ? (
                          <ol className="list-decimal pl-5 space-y-1 text-foreground/85">
                            {acceptProgressResult.steps
                              .filter((s) => !s.ok)
                              .map((st, stepIndex) => (
                                <li key={`${st.phase}-${stepIndex}`}>
                                  <span className="font-medium capitalize">{st.phase}:</span> {st.message}
                                </li>
                              ))}
                          </ol>
                        ) : !acceptProgressResult.error ? (
                          <p className="text-destructive">{formatApiDecisionError(acceptProgressResult)}</p>
                        ) : null}
                      </>
                    )}
                  </>
                ) : null}
              </div>
            </DialogDescription>
          </DialogHeader>
          {!acceptProgressLoading ? (
            <DialogFooter>
              <Button
                type="button"
                className="rounded-xl w-full sm:w-auto"
                onClick={() => {
                  setAcceptProgressOpen(false);
                  setAcceptProgressResult(null);
                  setAcceptProgressNetworkError(null);
                }}
              >
                OK
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="w-full max-w-none p-4 sm:p-5 md:p-6 lg:px-8 lg:py-6 xl:px-10 xl:py-8 space-y-6 sm:space-y-8">
      <div className="space-y-3 sm:space-y-4">
        {restrictionTags.length > 0 ? (
          <div
            className="flex flex-wrap gap-2"
            aria-label="Phrases detected in the job description"
          >
            {restrictionTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex max-w-full items-center rounded-lg border border-rose-500/45 bg-rose-500/[0.11] px-3 py-1.5 text-sm font-medium text-rose-950 dark:border-rose-400/40 dark:bg-rose-950/50 dark:text-rose-100/95 leading-snug shadow-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold font-display leading-tight tracking-tight text-foreground">
          {job.title ?? "Untitled role"}
        </h2>
        {titleRowSegments.length > 0 ? (
          <div className="flex flex-wrap items-center gap-y-2 text-sm sm:text-base leading-snug">
            {titleRowSegments.map((segment, segmentIndex) => (
              <span key={segmentIndex} className="inline-flex items-center max-w-full">
                {segmentIndex > 0 ? (
                  <span
                    className="text-muted-foreground mx-2 sm:mx-2.5 shrink-0 select-none"
                    aria-hidden
                  >
                    ·
                  </span>
                ) : null}
                {segment}
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {showAcceptForStatus(job.applyStatus) ? (
            <Button
              type="button"
              size="default"
              disabled={decisionBusyHere}
              className="rounded-xl gap-2 bg-emerald-600 text-white hover:bg-emerald-600/90 border border-emerald-500/40 shadow-sm shadow-emerald-950/30"
              onClick={() => sendJobDecision("accept")}
            >
              {decisionBusyHere && decisionBusyKind === "accept" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden />
              )}
              Accept
            </Button>
          ) : null}
          {showRejectForStatus(job.applyStatus) ? (
            <Button
              type="button"
              size="default"
              variant="destructive"
              disabled={decisionBusyHere}
              className="rounded-xl gap-2"
              onClick={() => sendJobDecision("reject")}
            >
              {decisionBusyHere && decisionBusyKind === "reject" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <XCircle className="h-4 w-4" aria-hidden />
              )}
              Reject
            </Button>
          ) : null}
          {isRejectedStatus(job.applyStatus) ? (
            <Button
              type="button"
              size="default"
              variant="outline"
              disabled={decisionBusyHere || moveToApplyPending}
              className="rounded-xl gap-2 border-violet-500/40 bg-violet-500/[0.08] text-foreground hover:bg-violet-500/15 dark:border-violet-400/35"
              onClick={() => void handleMoveRejectedToApply()}
            >
              {moveToApplyPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RotateCcw className="h-4 w-4" aria-hidden />
              )}
              Move to APPLY
            </Button>
          ) : null}
          {originalUrl ? (
            <Button size="default" variant="default" className="rounded-xl gap-2" asChild>
              <a href={originalUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Original URL
              </a>
            </Button>
          ) : null}
          {platformUrl ? (
            <Button size="default" variant="secondary" className="rounded-xl gap-2" asChild>
              <a href={platformUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Platform URL
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="pb-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-primary dark:text-violet-300 mb-3">
          Full description
        </h3>
        <div className="rounded-2xl border border-border bg-gradient-to-b from-violet-100/50 via-muted/35 to-emerald-100/40 dark:from-violet-950/35 dark:via-zinc-900/55 dark:to-emerald-950/25 p-4 sm:p-6 w-full dark:shadow-[inset_0_1px_0_0_rgba(196,181,253,0.06)]">
          <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground/90 dark:text-zinc-200 leading-relaxed m-0 w-full [tab-size:2]">
            {(job.jobDescription ?? "").trim() ? (
              descriptionHighlightSegments.map((seg, i) =>
                seg.highlight ? (
                  <mark
                    key={`jd-${i}`}
                    className="rounded-sm bg-amber-200/95 px-0.5 text-foreground shadow-[inset_0_-1px_0_0_rgba(180,83,9,0.35)] dark:bg-amber-500/30 dark:text-amber-50 dark:shadow-none"
                  >
                    {seg.text}
                  </mark>
                ) : (
                  <span key={`jd-${i}`}>{seg.text}</span>
                ),
              )
            ) : (
              "No description stored for this job."
            )}
          </pre>
        </div>
      </div>
    </div>
    </>
  );
}

type JobCardDecisionState =
  | null
  | { jobId: string; loading: true; kind: JobDecision }
  | {
      jobId: string;
      loading: false;
      flash:
        | { variant: "success"; message: string; applyStatus?: string | null }
        | { variant: "error"; message: string; detail: string };
    };

export default function Home() {
  const [platformFilter, setPlatformFilter] = useState<string>(ALL_VALUE);
  const [applyFilter, setApplyFilter] = useState<string>(DEFAULT_APPLY_FILTER);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobCardDecisionState, setJobCardDecisionState] = useState<JobCardDecisionState>(null);
  const decisionRequestGenRef = useRef(0);
  const successFlashClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queryClient = useQueryClient();
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const platformsQuery = useJobPlatformsQuery();

  const infiniteQuery = useJobInfiniteQuery({
    pageSize: PAGE_SIZE,
    platform: platformFilter === ALL_VALUE ? undefined : platformFilter,
    applyStatus: applyFilter === ALL_VALUE ? undefined : applyFilter,
    search: debouncedSearch.trim() || undefined,
  });

  const flatItems = useMemo(
    () => infiniteQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [infiniteQuery.data?.pages],
  );
  const totalMatches = infiniteQuery.data?.pages[0]?.total ?? 0;

  const listSignature = useMemo(
    () => flatItems.map((j) => j.jobId ?? "").join("\0"),
    [flatItems],
  );

  const lastDecisionKindRef = useRef<JobDecision | null>(null);

  const beginDecision = useCallback((actingJobId: string, kind: JobDecision) => {
    lastDecisionKindRef.current = kind;
    const nextGen = ++decisionRequestGenRef.current;
    setJobCardDecisionState({ jobId: actingJobId, loading: true, kind });
    return nextGen;
  }, []);

  const finishDecision = useCallback(
    (actingJobId: string, gen: number, result: JobDecisionResponse | null, err: unknown) => {
      if (decisionRequestGenRef.current !== gen) return;

      if (successFlashClearRef.current) {
        clearTimeout(successFlashClearRef.current);
        successFlashClearRef.current = null;
      }

      if (err != null) {
        const detail =
          err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
        setJobCardDecisionState({
          jobId: actingJobId,
          loading: false,
          flash: { variant: "error", message: "Could not reach the server.", detail },
        });
        const kind = lastDecisionKindRef.current ?? "accept";
        toast({
          variant: "destructive",
          title: kind === "accept" ? "Accept failed" : "Reject failed",
          description: detail.length > 280 ? `${detail.slice(0, 280)}…` : detail,
        });
        return;
      }

      if (!result) return;

      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: ["jobDetail", actingJobId] });
        void queryClient.invalidateQueries({ queryKey: ["jobListInfinite"] });
        void queryClient.invalidateQueries({ queryKey: ["jobSummary"] });

        const shortMessage =
          result.decision === "accept"
            ? "Submitted — applied."
            : "Rejected — saved to the database.";

        setJobCardDecisionState({
          jobId: actingJobId,
          loading: false,
          flash: {
            variant: "success",
            message: shortMessage,
            applyStatus: result.applyStatusUpdated,
          },
        });

        toast({
          title: result.decision === "accept" ? "Accept completed" : "Reject completed",
          description: shortMessage,
        });

        successFlashClearRef.current = setTimeout(() => {
          successFlashClearRef.current = null;
          setJobCardDecisionState((prev) => {
            if (
              prev &&
              !prev.loading &&
              prev.jobId === actingJobId &&
              prev.flash?.variant === "success"
            ) {
              return null;
            }
            return prev;
          });
        }, 4500);
        return;
      }

      const detail = formatApiDecisionError(result);
      const title = result.decision === "accept" ? "Accept failed" : "Reject failed";
      setJobCardDecisionState({
        jobId: actingJobId,
        loading: false,
        flash: { variant: "error", message: title, detail },
      });
      toast({
        variant: "destructive",
        title,
        description: detail.length > 280 ? `${detail.slice(0, 280)}…` : detail,
      });
    },
    [queryClient],
  );

  useEffect(() => {
    return () => {
      if (successFlashClearRef.current) clearTimeout(successFlashClearRef.current);
    };
  }, []);

  useEffect(() => {
    if (flatItems.length === 0) {
      setSelectedJobId(null);
      return;
    }
    setSelectedJobId((prev) => {
      if (prev && flatItems.some((j) => j.jobId === prev)) return prev;
      return flatItems[0]?.jobId ?? null;
    });
  }, [listSignature, flatItems]);

  useEffect(() => {
    const root = listScrollRef.current;
    const target = loadMoreRef.current;
    if (!root || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (
          first?.isIntersecting &&
          infiniteQuery.hasNextPage &&
          !infiniteQuery.isFetchingNextPage &&
          !infiniteQuery.isFetching
        ) {
          infiniteQuery.fetchNextPage();
        }
      },
      { root, rootMargin: "120px 0px", threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [
    infiniteQuery.fetchNextPage,
    infiniteQuery.hasNextPage,
    infiniteQuery.isFetchingNextPage,
    infiniteQuery.isFetching,
    infiniteQuery.data?.pages.length,
    listSignature,
  ]);

  return (
    <div className="w-full min-w-0 min-h-0 flex-1 flex flex-col overflow-hidden scrollbar-themed">
      <div className="w-full min-h-0 flex-1 flex flex-col overflow-hidden px-3 sm:px-4 md:px-5 pt-3 sm:pt-4 pb-3 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.02 }}
          className="flex flex-wrap items-center gap-2 shrink-0"
        >
          <div className="relative flex-1 min-w-[min(100%,14rem)]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search title, company, job ID…"
              className="pl-8 h-9 text-sm bg-background/60 border-border rounded-lg"
              aria-label="Search jobs"
            />
          </div>
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="h-9 text-sm bg-background/60 border-border rounded-lg w-full sm:w-[11.5rem] shrink-0">
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All platforms</SelectItem>
              {(platformsQuery.data?.platforms ?? []).map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={applyFilter} onValueChange={setApplyFilter}>
            <SelectTrigger className="h-9 text-sm bg-background/60 border-border rounded-lg w-full sm:w-[11.5rem] shrink-0">
              <SelectValue placeholder="Apply status" />
            </SelectTrigger>
            <SelectContent>
              {APPLY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </motion.div>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {infiniteQuery.isError ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-8 text-center text-destructive">
              <p className="font-medium">Failed to load jobs</p>
              <p className="text-sm mt-2 opacity-90">Run the API and check MongoDB env vars.</p>
            </div>
          ) : infiniteQuery.isLoading ? (
            <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
              <Skeleton className="w-full lg:w-[380px] shrink-0 min-h-[200px] lg:min-h-0 lg:h-full rounded-2xl bg-muted dark:bg-white/5" />
              <Skeleton className="flex-1 min-h-[200px] lg:min-h-0 rounded-2xl bg-muted dark:bg-white/5" />
            </div>
          ) : flatItems.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-border bg-muted/25 dark:bg-white/[0.02]"
            >
              <Briefcase className="h-11 w-11 text-muted-foreground mb-3 opacity-80" />
              <h3 className="text-lg font-semibold font-display">No jobs match</h3>
              <p className="text-muted-foreground text-sm max-w-md mt-2">Adjust filters or search.</p>
            </motion.div>
          ) : (
            <div
              className={cn(
                "flex flex-col lg:flex-row gap-0 rounded-xl sm:rounded-2xl border border-border overflow-hidden bg-card/30 shadow-xl shadow-black/10 dark:shadow-black/20 w-full flex-1 min-h-0",
              )}
            >
              <aside className="w-full lg:w-[340px] xl:w-[380px] shrink-0 flex flex-col min-h-0 flex-1 lg:flex-none border-b lg:border-b-0 lg:border-r border-border bg-muted/50 dark:bg-zinc-950/55 lg:dark:bg-zinc-950/45">
                <div className="px-3 py-2.5 border-b border-border/80 dark:border-border/60 shrink-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Results ({totalMatches})
                  </p>
                </div>
                <div
                  ref={listScrollRef}
                  className="scrollbar-themed flex-1 min-h-0 overflow-y-auto overscroll-contain px-2.5 py-2 space-y-2"
                >
                  {flatItems.map((job, rowIndex) => {
                    const jid = job.jobId == null ? "" : String(job.jobId);
                    const st = jobCardDecisionState;
                    const matchesCard = Boolean(jid && st && st.jobId === jid);

                    let decisionUi: JobListCardDecisionUi | undefined;
                    if (matchesCard && st) {
                      if (st.loading) {
                        decisionUi = { loading: true, kind: st.kind };
                      } else {
                        decisionUi = { loading: false, flash: st.flash };
                      }
                    }

                    const showErrorDismiss =
                      matchesCard &&
                      st &&
                      !st.loading &&
                      st.flash.variant === "error";

                    return (
                      <JobListCard
                        key={job.jobId ? String(job.jobId) : `job-${rowIndex}`}
                        job={job}
                        selected={selectedJobId === job.jobId}
                        onSelect={() => {
                          setSelectedJobId(job.jobId);
                          setJobCardDecisionState((u) => {
                            if (!u || u.loading) return u;
                            if (u.jobId !== jid) return null;
                            return u;
                          });
                        }}
                        decisionUi={decisionUi}
                        onDismissFlash={showErrorDismiss ? () => setJobCardDecisionState(null) : undefined}
                      />
                    );
                  })}
                  <div ref={loadMoreRef} className="h-6 flex justify-center items-center py-2">
                    {infiniteQuery.isFetchingNextPage ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary opacity-90" />
                    ) : null}
                  </div>
                </div>
              </aside>

              <section className="scrollbar-themed flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-contain bg-gradient-to-br from-background via-background to-primary/[0.03]">
                <JobDetailPane
                  jobId={selectedJobId}
                  decisionBusyJobId={
                    jobCardDecisionState?.loading ? jobCardDecisionState.jobId : null
                  }
                  decisionBusyKind={
                    jobCardDecisionState?.loading ? jobCardDecisionState.kind : null
                  }
                  beginDecision={beginDecision}
                  finishDecision={finishDecision}
                />
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
