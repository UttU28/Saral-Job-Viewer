import { useEffect, useReducer, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CircleX,
  Flame,
  Loader2,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldX,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { Footer } from "@/components/Footer";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  runAdminJobAction,
  setUserAdminStatus,
  saveAdminScraperKeywords,
  type AdminJobAction,
  type ValidationExecutionRow,
} from "@/lib/api";
import { formatClientError } from "@/lib/api";
import {
  useAdminValidationExecutionsQuery,
  useAdminJobStatusSummaryQuery,
  useAdminScraperKeywordsQuery,
  useAdminUsersQuery,
} from "@/hooks/use-jobs";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

function parseExecutionInstant(raw: string): Date | null {
  const s = (raw || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatExecutionStartDateTime(d: Date): string {
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Human-readable duration from milliseconds (non-negative). */
function formatDurationMs(ms: number): string {
  let n = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(n / 3600);
  n %= 3600;
  const m = Math.floor(n / 60);
  const s = n % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function validationExecutionTiming(row: ValidationExecutionRow, nowMs: number): {
  startLabel: string;
  durationLabel: string;
  title: string;
} {
  const start = parseExecutionInstant(row.startTime);
  if (!start) {
    return { startLabel: "—", durationLabel: "", title: "" };
  }
  const startLabel = formatExecutionStartDateTime(start);
  if (row.state === "RUNNING") {
    const elapsed = formatDurationMs(nowMs - start.getTime());
    return {
      startLabel,
      durationLabel: `${elapsed} elapsed`,
      title: `Started ${start.toISOString()}, running`,
    };
  }
  const end = parseExecutionInstant(row.completionTime);
  if (end) {
    const total = formatDurationMs(end.getTime() - start.getTime());
    return {
      startLabel,
      durationLabel: total,
      title: `Started ${start.toISOString()}, finished ${end.toISOString()}, duration ${total}`,
    };
  }
  return {
    startLabel,
    durationLabel: "—",
    title: `Started ${start.toISOString()}`,
  };
}

/** Suffix after the final hyphen in the execution tail (e.g. KVGZ4), for compact display. */
function validationExecutionDisplayId(shortName: string, executionName: string): string {
  const raw = (shortName || executionName.split("/").filter(Boolean).pop() || "").trim();
  if (!raw) return "—";
  const i = raw.lastIndexOf("-");
  const suffix = i >= 0 ? raw.slice(i + 1) : raw;
  return suffix.toUpperCase();
}

const VALIDATION_EXECUTIONS_INITIAL = 4;
const VALIDATION_ERROR_LIMIT = 5;

function executionStateStyles(state: string): string {
  switch (state) {
    case "RUNNING":
      return "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-200";
    case "SUCCEEDED":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
    case "FAILED":
      return "border-rose-500/40 bg-rose-500/15 text-rose-800 dark:text-rose-200";
    case "CANCELLED":
      return "border-zinc-500/40 bg-zinc-500/12 text-zinc-700 dark:text-zinc-300";
    default:
      return "border-border bg-muted/40 text-foreground";
  }
}

type AdminActionDialogConfig = {
  action: AdminJobAction;
  runTitle: string;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Single card opens a dialog with Cancel + multiple flush actions. */
  flushMenu?: boolean;
  /** Single card opens a dialog with Cancel + multiple delete actions. */
  deleteMenu?: boolean;
};

export default function Admin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [validationPollingEnabled, setValidationPollingEnabled] = useState(true);
  const [validationErrorCount, setValidationErrorCount] = useState(0);
  const [lastValidationErrorAt, setLastValidationErrorAt] = useState(0);
  const adminUsersQuery = useAdminUsersQuery(Boolean(user?.isAdmin));
  const adminJobStatusQuery = useAdminJobStatusSummaryQuery(Boolean(user?.isAdmin));
  const validationExecQuery = useAdminValidationExecutionsQuery(
    Boolean(user?.isAdmin) && validationPollingEnabled,
  );
  const adminScraperKeywordsQuery = useAdminScraperKeywordsQuery(Boolean(user?.isAdmin));
  const [validationExecutionsExpanded, setValidationExecutionsExpanded] = useState(false);
  const [userListExpanded, setUserListExpanded] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<AdminJobAction | null>(null);
  const [keywordDrafts, setKeywordDrafts] = useState<string[]>([]);
  const [newKeywordDraft, setNewKeywordDraft] = useState("");
  const [keywordMutationInFlight, setKeywordMutationInFlight] = useState(false);
  const [adminActionDialog, setAdminActionDialog] = useState<AdminActionDialogConfig | null>(null);
  const [, forceValidationTick] = useReducer((value: number) => value + 1, 0);

  const validationExecutionsAll = validationExecQuery.data?.executions ?? [];
  const hasRunningValidation = validationExecutionsAll.some((r) => r.state === "RUNNING");

  useEffect(() => {
    if (!hasRunningValidation) return;
    const id = globalThis.setInterval(() => forceValidationTick(), 1000);
    return () => clearInterval(id);
  }, [hasRunningValidation]);

  useEffect(() => {
    if (!adminScraperKeywordsQuery.data) return;
    setKeywordDrafts(adminScraperKeywordsQuery.data.keywords ?? []);
  }, [adminScraperKeywordsQuery.data]);

  useEffect(() => {
    if (!validationExecQuery.isError) return;
    if (!validationExecQuery.errorUpdatedAt) return;
    if (validationExecQuery.errorUpdatedAt === lastValidationErrorAt) return;
    setLastValidationErrorAt(validationExecQuery.errorUpdatedAt);
    setValidationErrorCount((prev) => {
      const next = prev + 1;
      if (next >= VALIDATION_ERROR_LIMIT) {
        setValidationPollingEnabled(false);
      }
      return next;
    });
  }, [validationExecQuery.isError, validationExecQuery.errorUpdatedAt, lastValidationErrorAt]);

  useEffect(() => {
    if (!validationExecQuery.isSuccess) return;
    if (validationErrorCount === 0) return;
    setValidationErrorCount(0);
  }, [validationExecQuery.isSuccess, validationErrorCount]);

  if (!user?.isAdmin) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-themed">
          <div className="flex flex-col">
            <div className="w-full max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-5 min-w-0">
              <Alert variant="destructive" className="rounded-2xl">
                <AlertTitle>Admin access required</AlertTitle>
                <AlertDescription>
                  This page is only visible to users with admin access.
                </AlertDescription>
              </Alert>
            </div>
            <Footer />
          </div>
        </div>
      </div>
    );
  }

  const users = adminUsersQuery.data?.users ?? [];
  const summary = adminUsersQuery.data?.summary;
  const statusSummary = adminJobStatusQuery.data;
  const mergedRejectedCount =
    (statusSummary?.rejected ?? 0) + (statusSummary?.doNotApply ?? 0) + (statusSummary?.existing ?? 0);

  const validationExecutionsVisible =
    validationExecutionsExpanded || validationExecutionsAll.length <= VALIDATION_EXECUTIONS_INITIAL
      ? validationExecutionsAll
      : validationExecutionsAll.slice(0, VALIDATION_EXECUTIONS_INITIAL);
  const validationHiddenCount = Math.max(0, validationExecutionsAll.length - VALIDATION_EXECUTIONS_INITIAL);

  const onToggleAdmin = async (targetUserId: string, nextIsAdmin: boolean) => {
    setUpdatingUserId(targetUserId);
    try {
      await setUserAdminStatus(targetUserId, nextIsAdmin);
      await queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      toast({
        title: nextIsAdmin ? "Admin access granted" : "Admin access removed",
        description: targetUserId,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not update admin access",
        description: formatClientError(error, "Request failed"),
      });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const onRunAdminAction = async (action: AdminJobAction, title: string) => {
    setRunningAction(action);
    try {
      const result = await runAdminJobAction(action);
      if (action === "delete_unwanted_classified_jobs" || action === "delete_unwanted_plus_null_jobs") {
        await queryClient.invalidateQueries({ queryKey: ["adminJobStatusSummary"] });
        await queryClient.invalidateQueries({ queryKey: ["jobSummary"] });
        await queryClient.invalidateQueries({ queryKey: ["jobListInfinite"] });
      }
      if (action === "flush_db" || action === "flush_past_data_orphans") {
        await queryClient.invalidateQueries({ queryKey: ["adminJobStatusSummary"] });
        await queryClient.invalidateQueries({ queryKey: ["jobSummary"] });
        await queryClient.invalidateQueries({ queryKey: ["jobListInfinite"] });
      }
      if (result.validationRun?.executionName) {
        await queryClient.invalidateQueries({ queryKey: ["adminValidationExecutions"] });
      }
      const execLabel = result.validationRun?.executionName
        ? validationExecutionDisplayId("", result.validationRun.executionName)
        : "";
      toast({
        title:
          action === "delete_unwanted_classified_jobs" || action === "delete_unwanted_plus_null_jobs"
            ? "Delete completed successfully"
            : action === "flush_past_data_orphans" || action === "flush_db"
              ? "Flush completed successfully"
              : "Admin action triggered",
        description:
          execLabel && execLabel !== "—"
            ? `${result.message || title} · ${execLabel}`
            : result.message || title,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not trigger action",
        description: formatClientError(error, "Request failed"),
      });
    } finally {
      setRunningAction(null);
    }
  };

  const openAdminActionDialog = (config: AdminActionDialogConfig) => {
    setAdminActionDialog(config);
  };

  const saveKeywordsNow = async (nextKeywords: string[]) => {
    setKeywordMutationInFlight(true);
    try {
      const result = await saveAdminScraperKeywords(nextKeywords);
      setKeywordDrafts(result.keywords);
      await queryClient.invalidateQueries({ queryKey: ["adminScraperKeywords"] });
      return true;
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not save scraper keywords",
        description: formatClientError(error, "Request failed"),
      });
      return false;
    } finally {
      setKeywordMutationInFlight(false);
    }
  };

  const onDeleteKeyword = async (index: number) => {
    const nextKeywords = keywordDrafts.filter((_, i) => i !== index).map((value) => value.trim()).filter(Boolean);
    await saveKeywordsNow(nextKeywords);
  };

  const onAddKeyword = async () => {
    const next = newKeywordDraft.trim();
    if (!next) return;
    if (keywordDrafts.some((item) => item.trim().toLowerCase() === next.toLowerCase())) {
      toast({
        variant: "destructive",
        title: "Keyword already exists",
        description: next,
      });
      return;
    }
    const nextKeywords = [...keywordDrafts, next].map((value) => value.trim()).filter(Boolean);
    const ok = await saveKeywordsNow(nextKeywords);
    if (!ok) return;
    setNewKeywordDraft("");
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-themed">
        <div className="flex flex-col">
          <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-5 sm:space-y-6 min-w-0">
            <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card/50 to-emerald-500/[0.06] p-6 sm:p-7 shadow-sm shadow-primary/5">
              <div className="flex items-start gap-4 sm:gap-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 border border-primary/25">
                  <Shield className="h-6 w-6 text-primary" aria-hidden />
                </div>
                <div className="space-y-2 min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Admin</p>
                  <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground">Admin dashboard</h1>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    View all users, review counts, and manage admin access from one place.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card/45 p-4 sm:p-5">
              <div className="bg-gradient-to-br from-primary/[0.06] via-background/70 to-sky-500/[0.05] p-1 sm:p-2 rounded-xl">
                <div className="space-y-5 rounded-lg p-3 sm:p-4">
                <div className="space-y-1">
                  <h2 className="text-base sm:text-lg font-semibold text-foreground">Job operations</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Live status overview and quick admin actions for validation and cleanup.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm sm:text-base font-semibold text-foreground">Job status overview</h3>
                    <p className="text-xs text-muted-foreground">
                      Past Data: {statusSummary?.pastDataRows ?? 0}
                    </p>
                  </div>
                  {adminJobStatusQuery.isLoading ? (
                    <div className="h-24 flex items-center justify-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading status summary...
                    </div>
                  ) : adminJobStatusQuery.isError ? (
                    <Alert variant="destructive" className="rounded-xl">
                      <AlertTitle>Failed to load job status summary</AlertTitle>
                      <AlertDescription>
                        {formatClientError(adminJobStatusQuery.error, "Could not fetch admin job status data.")}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="rounded-xl border border-primary/25 bg-primary/[0.08] p-3">
                        <p className="text-xs uppercase tracking-wider text-primary text-center">Total jobs</p>
                        <p className="text-2xl font-semibold text-foreground mt-1 text-center">{statusSummary?.total ?? 0}</p>
                      </div>
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-3">
                        <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-300 text-center">Pending / null</p>
                        <p className="text-2xl font-semibold text-foreground mt-1 text-center">{statusSummary?.nullPending ?? 0}</p>
                      </div>
                      <div className="rounded-xl border border-sky-500/30 bg-sky-500/[0.08] p-3">
                        <p className="text-xs uppercase tracking-wider text-sky-700 dark:text-sky-300 text-center">Apply</p>
                        <p className="text-2xl font-semibold text-foreground mt-1 text-center">{statusSummary?.apply ?? 0}</p>
                      </div>
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.08] p-3">
                        <p className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-300 text-center">Rejected</p>
                        <p className="text-2xl font-semibold text-foreground mt-1 text-center">{mergedRejectedCount}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 border-t border-border/60 pt-4">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Run bulk admin actions for pending-classification, direct delete cleanup, full DB flush, and APPLY push flow.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div className="space-y-2 rounded-lg border border-border/60 bg-background/55 p-3">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Classifies every job that still has a NULL or pending status so decisions are up to date.
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        disabled={Boolean(runningAction)}
                        onClick={() =>
                          openAdminActionDialog({
                            action: "classify_all_pending_null_jobs",
                            runTitle: "Classify pending null jobs",
                            title: "Run validation classify job?",
                            description:
                              "This will start a local Docker validation container for pending classification. It can take some time to execute and finish.",
                            confirmLabel: "Yes, run classify job",
                          })
                        }
                      >
                        {runningAction === "classify_all_pending_null_jobs" ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2 shrink-0" aria-hidden />
                        ) : null}
                        Classify Pending Jobs
                      </Button>
                    </div>

                    <div className="space-y-2 rounded-lg border border-border/60 bg-background/55 p-3">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Remove classified jobs you do not need, or also clear NULL/pending rows.
                      </p>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="w-full"
                        disabled={Boolean(runningAction)}
                        onClick={() =>
                          openAdminActionDialog({
                            action: "delete_unwanted_classified_jobs",
                            runTitle: "Delete unwanted jobs",
                            title: "Delete unwanted jobs?",
                            description:
                              "Delete Unwanted Jobs removes non-APPLY classified jobs and pastData older than 48 hours while keeping NULL/blank and APPLY. Delete Unwanted + Null keeps only APPLY jobs.",
                            confirmLabel: "Delete Unwanted + Null",
                            destructive: true,
                            deleteMenu: true,
                          })
                        }
                      >
                        {runningAction === "delete_unwanted_classified_jobs" ||
                        runningAction === "delete_unwanted_plus_null_jobs" ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2 shrink-0" aria-hidden />
                        ) : null}
                        Delete Unwanted Jobs
                      </Button>
                    </div>

                    <div className="space-y-2 rounded-lg border border-border/60 bg-background/55 p-3">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Clean orphan pastData rows or wipe jobData and pastData completely.
                      </p>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="w-full"
                        disabled={Boolean(runningAction)}
                        onClick={() =>
                          openAdminActionDialog({
                            action: "flush_db",
                            runTitle: "Flush database",
                            title: "Flush database?",
                            description:
                              "Flush Past Match Job removes pastData rows whose jobId is not in jobData. Flush All permanently deletes every row in jobData and pastData.",
                            confirmLabel: "Flush All",
                            destructive: true,
                            flushMenu: true,
                          })
                        }
                      >
                        {runningAction === "flush_db" || runningAction === "flush_past_data_orphans" ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2 shrink-0" aria-hidden />
                        ) : null}
                        Flush the DB
                      </Button>
                    </div>

                    <div className="space-y-2 rounded-lg border border-border/60 bg-background/55 p-3">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Pushes APPLY jobs to the suggest API using validation mode 2.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        className="w-full"
                        disabled={Boolean(runningAction)}
                        onClick={() =>
                          openAdminActionDialog({
                            action: "push_apply_jobs",
                            runTitle: "Push APPLY jobs",
                            title: "Run validation apply job?",
                            description:
                              "This will start a local Docker validation container to process APPLY jobs. It can take some time to execute and finish.",
                            confirmLabel: "Yes, run apply job",
                          })
                        }
                      >
                        {runningAction === "push_apply_jobs" ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2 shrink-0" aria-hidden />
                        ) : null}
                        Submit APPLY Jobs
                      </Button>
                    </div>
                  </div>
                </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card/45 p-4 sm:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1 min-w-0">
                  <h2 className="text-sm sm:text-base font-semibold text-foreground">Validation runs</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
                    Recent local Docker validation containers (newest first on each page).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-start"
                  disabled={validationExecQuery.isFetching}
                  onClick={() => {
                    setValidationErrorCount(0);
                    setLastValidationErrorAt(0);
                    setValidationPollingEnabled(true);
                    queryClient.invalidateQueries({ queryKey: ["adminValidationExecutions"] });
                  }}
                >
                  <RefreshCw
                    className={cn("h-4 w-4 mr-2", validationExecQuery.isFetching && "animate-spin")}
                    aria-hidden
                  />
                  Refresh
                </Button>
              </div>
              {validationExecQuery.isLoading ? (
                <div className="h-24 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading executions…
                </div>
              ) : validationExecQuery.isError ? (
                <Alert variant="destructive" className="rounded-xl">
                  <AlertTitle>Could not load validation runs</AlertTitle>
                  <AlertDescription>
                    {formatClientError(validationExecQuery.error, "Check Docker is running and the API container has access to /var/run/docker.sock.")}
                    {validationErrorCount >= VALIDATION_ERROR_LIMIT ? (
                      <span className="block mt-1">
                        Auto-requests paused after {VALIDATION_ERROR_LIMIT} errors. Click Refresh to try again.
                      </span>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  {validationExecutionsAll.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No validation runs yet.</p>
                  ) : null}
                  {validationExecutionsVisible.map((row) => {
                    const timing = validationExecutionTiming(row, Date.now());
                    return (
                    <div
                      key={row.executionName}
                      className="rounded-xl border border-border/65 bg-background/55 px-3 py-2.5 sm:px-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4"
                    >
                      <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                        <span
                          className={cn(
                            "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                            executionStateStyles(row.state),
                          )}
                        >
                          {row.state}
                        </span>
                        <p
                          className="font-mono text-sm font-semibold tabular-nums tracking-wide text-foreground"
                          title={row.executionName}
                        >
                          {validationExecutionDisplayId(row.shortName, row.executionName)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] sm:text-xs text-muted-foreground tabular-nums">
                        <span title={timing.title || undefined}>
                          <span className="text-foreground/90">{timing.startLabel}</span>
                          {timing.durationLabel ? (
                            <>
                              <span className="mx-1.5 text-border">·</span>
                              <span>{timing.durationLabel}</span>
                            </>
                          ) : null}
                        </span>
                        <span title="Running / succeeded / failed task counts" className="whitespace-nowrap">
                          tasks: {row.runningCount} / {row.succeededCount} / {row.failedCount}
                          {row.cancelledCount ? ` · cancelled ${row.cancelledCount}` : ""}
                        </span>
                      </div>
                    </div>
                    );
                  })}
                  {validationHiddenCount > 0 ? (
                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setValidationExecutionsExpanded((v) => !v)}
                      >
                        {validationExecutionsExpanded
                          ? "Show less"
                          : `Show more (${validationHiddenCount} older)`}
                      </Button>
                    </div>
                  ) : null}
                  {validationExecQuery.data?.nextPageToken ? (
                    <p className="text-[11px] text-muted-foreground pt-1">
                      More validation runs exist; only the first page is shown here.
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card/45 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm sm:text-base font-semibold text-foreground">Scraper search keywords</h2>
                  <p className="text-xs text-muted-foreground">Managed in MongoDB and used by all scrapers.</p>
                </div>
              </div>
              {adminScraperKeywordsQuery.isLoading ? (
                <div className="h-24 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading scraper keywords...
                </div>
              ) : adminScraperKeywordsQuery.isError ? (
                <Alert variant="destructive" className="rounded-xl">
                  <AlertTitle>Failed to load scraper keywords</AlertTitle>
                  <AlertDescription>
                    {formatClientError(adminScraperKeywordsQuery.error, "Could not fetch scraper keyword settings.")}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {keywordDrafts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No keywords yet. Add at least one keyword.</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {keywordDrafts.map((keyword, index) => (
                        <div
                          key={`${index}-${keyword}`}
                          className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/50 px-3 py-1.5 text-sm"
                        >
                          <span className="max-w-[220px] truncate sm:max-w-[320px]" title={keyword}>
                            {keyword}
                          </span>
                          <button
                            type="button"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-background hover:text-foreground"
                            aria-label={`Remove keyword ${keyword}`}
                            disabled={keywordMutationInFlight}
                            onClick={() => void onDeleteKeyword(index)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={newKeywordDraft}
                      onChange={(event) => setNewKeywordDraft(event.target.value)}
                      placeholder="Add new keyword"
                      className="w-full"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void onAddKeyword();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      className="sm:w-auto w-full"
                      disabled={keywordMutationInFlight}
                      onClick={() => void onAddKeyword()}
                    >
                      {keywordMutationInFlight ? <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden /> : null}
                      Add keyword
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card/45 p-4 sm:p-5">
              <div className="mb-4 flex flex-row items-start justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <h2 className="text-sm sm:text-base font-semibold text-foreground">User management</h2>
                  <p className="text-xs text-muted-foreground">Manage admin access and view account totals.</p>
                </div>
                {!adminUsersQuery.isLoading && !adminUsersQuery.isError ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setUserListExpanded((v) => !v)}
                    aria-expanded={userListExpanded}
                  >
                    {userListExpanded ? (
                      <>
                        <ChevronUp className="h-4 w-4 mr-2 shrink-0" aria-hidden />
                        Hide users
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4 mr-2 shrink-0" aria-hidden />
                        Show users
                        <span className="ml-1.5 tabular-nums text-muted-foreground">({users.length})</span>
                      </>
                    )}
                  </Button>
                ) : null}
              </div>
              <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-primary/25 bg-primary/[0.08] p-3">
                  <p className="text-xs uppercase tracking-wider text-primary text-center">Total users</p>
                  <p className="text-2xl font-semibold text-foreground mt-1 text-center">{summary?.totalUsers ?? 0}</p>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] p-3">
                  <p className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300 text-center">
                    Admin users
                  </p>
                  <p className="text-2xl font-semibold text-foreground mt-1 text-center">{summary?.adminUsers ?? 0}</p>
                </div>
                <div className="rounded-xl border border-zinc-500/30 bg-zinc-500/[0.08] p-3">
                  <p className="text-xs uppercase tracking-wider text-zinc-700 dark:text-zinc-300 text-center">
                    Non-admin users
                  </p>
                  <p className="text-2xl font-semibold text-foreground mt-1 text-center">{summary?.nonAdminUsers ?? 0}</p>
                </div>
              </div>
              {adminUsersQuery.isLoading ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                  Loading user list…
                </div>
              ) : adminUsersQuery.isError ? (
                <Alert variant="destructive" className="rounded-xl">
                  <AlertTitle>Failed to load users</AlertTitle>
                  <AlertDescription>
                    {formatClientError(adminUsersQuery.error, "Could not fetch admin user data.")}
                  </AlertDescription>
                </Alert>
              ) : userListExpanded ? (
                    <div className="space-y-2.5">
                  {users.map((row) => {
                    const isUpdating = updatingUserId === row.userId;
                    const isSelf = row.userId === user.userId;
                    const rowInitials =
                      (row.name || "")
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase() ?? "")
                        .join("") || "U";
                    return (
                      <div
                        key={row.userId}
                        className="rounded-xl border border-border/65 bg-background/60 px-3.5 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <Avatar className="h-9 w-9 border border-border/70">
                            <AvatarImage src={row.profilePhotoUrl} alt={row.name || "User"} />
                            <AvatarFallback className="text-xs font-semibold">{rowInitials}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{row.name || "Unnamed user"}</p>
                            <p className="text-sm text-muted-foreground truncate">{row.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className="inline-flex items-center justify-center gap-1 shrink-0 rounded-full border px-2.5 py-0.5 border-amber-600/35 bg-gradient-to-b from-amber-100/95 to-orange-50/90 text-amber-950 shadow-[0_1px_0_0_rgba(251,146,60,0.25),0_0_14px_-3px_rgba(234,88,12,0.2)] dark:border-amber-400/40 dark:from-amber-500/25 dark:to-orange-600/18 dark:text-amber-50 dark:shadow-[0_0_14px_-3px_rgba(251,146,60,0.4)]"
                            title={`Current week streak: ${row.currentWeekStreak ?? 0}`}
                            aria-label={`Current week streak: ${row.currentWeekStreak ?? 0}`}
                          >
                            <Flame
                              className="h-4 w-4 shrink-0 text-orange-600 fill-orange-500/55 drop-shadow-sm dark:text-amber-400 dark:fill-amber-500/50 dark:drop-shadow-[0_0_6px_rgba(251,191,36,0.45)]"
                              aria-hidden
                            />
                            <span className="tabular-nums text-base font-bold leading-none tracking-tight text-amber-950 dark:text-amber-50">
                              {row.currentWeekStreak ?? 0}
                            </span>
                          </span>
                          <span
                            className="inline-flex items-center justify-center gap-1 shrink-0 rounded-full border px-2.5 py-0.5 border-rose-500/35 bg-gradient-to-b from-rose-100/95 to-red-50/90 text-rose-950 shadow-[0_1px_0_0_rgba(244,63,94,0.2),0_0_14px_-3px_rgba(239,68,68,0.2)] dark:border-rose-400/40 dark:from-rose-500/20 dark:to-red-600/15 dark:text-rose-100 dark:shadow-[0_0_14px_-3px_rgba(251,113,133,0.35)]"
                            title={`Current week rejects: ${row.currentWeekRejects ?? 0}`}
                            aria-label={`Current week rejects: ${row.currentWeekRejects ?? 0}`}
                          >
                            <CircleX
                              className="h-4 w-4 shrink-0 text-rose-600 drop-shadow-sm dark:text-rose-300"
                              aria-hidden
                            />
                            <span className="tabular-nums text-base font-bold leading-none tracking-tight text-rose-900 dark:text-rose-100">
                              {row.currentWeekRejects ?? 0}
                            </span>
                          </span>
                          <span
                            className={
                              row.isAdmin
                                ? "inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300"
                                : "inline-flex items-center gap-1 rounded-full border border-zinc-500/35 bg-zinc-500/10 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300"
                            }
                          >
                            {row.isAdmin ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldX className="h-3.5 w-3.5" />}
                            {row.isAdmin ? "Admin" : "User"}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant={row.isAdmin ? "outline" : "secondary"}
                            className="rounded-lg h-8"
                            disabled={isUpdating || isSelf}
                            onClick={() => onToggleAdmin(row.userId, !row.isAdmin)}
                            title={isSelf ? "You cannot change your own admin status here." : undefined}
                          >
                            {isUpdating ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : row.isAdmin ? (
                              "Remove admin"
                            ) : (
                              "Make admin"
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                    </div>
              ) : null}
            </div>
          </div>
          <Footer />
        </div>
      </div>
      <AlertDialog
        open={Boolean(adminActionDialog)}
        onOpenChange={(open) => {
          if (!open) setAdminActionDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{adminActionDialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{adminActionDialog?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(runningAction)}>Cancel</AlertDialogCancel>
            {adminActionDialog?.flushMenu ? (
              <>
                <AlertDialogAction
                  className="bg-amber-600 text-white hover:bg-amber-600/90"
                  disabled={Boolean(runningAction)}
                  onClick={(event) => {
                    event.preventDefault();
                    void onRunAdminAction("flush_past_data_orphans", "Flush past match job");
                    setAdminActionDialog(null);
                  }}
                >
                  Flush Past Match Job
                </AlertDialogAction>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={Boolean(runningAction)}
                  onClick={(event) => {
                    event.preventDefault();
                    void onRunAdminAction("flush_db", "Flush all");
                    setAdminActionDialog(null);
                  }}
                >
                  Flush All
                </AlertDialogAction>
              </>
            ) : adminActionDialog?.deleteMenu ? (
              <>
                <AlertDialogAction
                  className="bg-amber-600 text-white hover:bg-amber-600/90"
                  disabled={Boolean(runningAction)}
                  onClick={(event) => {
                    event.preventDefault();
                    void onRunAdminAction("delete_unwanted_classified_jobs", "Delete unwanted jobs");
                    setAdminActionDialog(null);
                  }}
                >
                  Delete Unwanted Jobs
                </AlertDialogAction>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={Boolean(runningAction)}
                  onClick={(event) => {
                    event.preventDefault();
                    void onRunAdminAction("delete_unwanted_plus_null_jobs", "Delete unwanted + null");
                    setAdminActionDialog(null);
                  }}
                >
                  Delete Unwanted + Null
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction
                className={
                  adminActionDialog?.destructive
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : undefined
                }
                disabled={Boolean(runningAction)}
                onClick={(event) => {
                  event.preventDefault();
                  if (!adminActionDialog) return;
                  void onRunAdminAction(adminActionDialog.action, adminActionDialog.runTitle);
                  setAdminActionDialog(null);
                }}
              >
                {adminActionDialog?.confirmLabel || "Confirm"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
