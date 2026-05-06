import { useEffect, useState } from "react";
import { CircleX, Flame, Loader2, RefreshCw, Shield, ShieldCheck, ShieldX } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { Footer } from "@/components/Footer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  runAdminJobAction,
  setUserAdminStatus,
  type AdminJobAction,
  type CloudRunExecutionRow,
} from "@/lib/api";
import { formatClientError } from "@/lib/api";
import {
  useAdminCloudRunExecutionsQuery,
  useAdminJobStatusSummaryQuery,
  useAdminUsersQuery,
} from "@/hooks/use-jobs";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

function parseExecutionInstant(raw: string): Date | null {
  const s = (raw || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatExecutionStartDate(d: Date): string {
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
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

function cloudRunExecutionTiming(row: CloudRunExecutionRow, nowMs: number): {
  startLabel: string;
  durationLabel: string;
  title: string;
} {
  const start = parseExecutionInstant(row.startTime);
  if (!start) {
    return { startLabel: "—", durationLabel: "", title: "" };
  }
  const startLabel = formatExecutionStartDate(start);
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
function cloudRunExecutionDisplayId(shortName: string, executionName: string): string {
  const raw = (shortName || executionName.split("/").filter(Boolean).pop() || "").trim();
  if (!raw) return "—";
  const i = raw.lastIndexOf("-");
  const suffix = i >= 0 ? raw.slice(i + 1) : raw;
  return suffix.toUpperCase();
}

const CLOUD_RUN_EXECUTIONS_INITIAL = 4;

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

export default function Admin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const adminUsersQuery = useAdminUsersQuery(Boolean(user?.isAdmin));
  const adminJobStatusQuery = useAdminJobStatusSummaryQuery(Boolean(user?.isAdmin));
  const cloudRunExecQuery = useAdminCloudRunExecutionsQuery(Boolean(user?.isAdmin));
  const [cloudRunExecutionsExpanded, setCloudRunExecutionsExpanded] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<AdminJobAction | null>(null);

  if (!user?.isAdmin) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-themed">
          <div className="min-h-full flex flex-col">
            <div className="flex-1 w-full max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-5 min-w-0">
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

  const cloudRunExecutionsAll = cloudRunExecQuery.data?.executions ?? [];
  const hasRunningCloudExecution = cloudRunExecutionsAll.some((r) => r.state === "RUNNING");
  const [, setCloudRunNowTick] = useState(0);
  useEffect(() => {
    if (!hasRunningCloudExecution) return;
    const id = window.setInterval(() => setCloudRunNowTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasRunningCloudExecution]);

  const cloudRunExecutionsVisible =
    cloudRunExecutionsExpanded || cloudRunExecutionsAll.length <= CLOUD_RUN_EXECUTIONS_INITIAL
      ? cloudRunExecutionsAll
      : cloudRunExecutionsAll.slice(0, CLOUD_RUN_EXECUTIONS_INITIAL);
  const cloudRunHiddenCount = Math.max(0, cloudRunExecutionsAll.length - CLOUD_RUN_EXECUTIONS_INITIAL);

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
      if (action === "delete_unwanted_classified_jobs") {
        await queryClient.invalidateQueries({ queryKey: ["adminJobStatusSummary"] });
        await queryClient.invalidateQueries({ queryKey: ["jobSummary"] });
        await queryClient.invalidateQueries({ queryKey: ["jobListInfinite"] });
      }
      if (result.cloudRun?.executionName) {
        await queryClient.invalidateQueries({ queryKey: ["adminCloudRunExecutions"] });
      }
      const execLabel = result.cloudRun?.executionName
        ? cloudRunExecutionDisplayId("", result.cloudRun.executionName)
        : "";
      toast({
        title:
          action === "delete_unwanted_classified_jobs"
            ? "Delete completed successfully"
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

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-themed">
        <div className="min-h-full flex flex-col">
          <div className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-5 sm:space-y-6 min-w-0">
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

            <div className="rounded-2xl border border-border bg-card/50 p-4 sm:p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                    <p className="text-xs text-muted-foreground">Top 4 counters</p>
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
                    Run bulk admin actions for pending-classification, direct delete cleanup, and APPLY push flow.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                          onRunAdminAction(
                            "classify_all_pending_null_jobs",
                            "Classify pending null jobs",
                          )
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
                        Removes jobs that were classified as not needed so the list stays clean and focused.
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        disabled={Boolean(runningAction)}
                        onClick={() =>
                          onRunAdminAction(
                            "delete_unwanted_classified_jobs",
                            "Delete unwanted classified jobs",
                          )
                        }
                      >
                        {runningAction === "delete_unwanted_classified_jobs" ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2 shrink-0" aria-hidden />
                        ) : null}
                        Delete Unwanted Jobs
                      </Button>
                    </div>

                    <div className="space-y-2 rounded-lg border border-border/60 bg-background/55 p-3">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Pushes APPLY jobs to the suggest API using Cloud Run job mode 2.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        className="w-full"
                        disabled={Boolean(runningAction)}
                        onClick={() =>
                          onRunAdminAction(
                            "push_apply_jobs",
                            "Push APPLY jobs",
                          )
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
                  <h2 className="text-sm sm:text-base font-semibold text-foreground">Cloud Run job executions</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
                    Recent runs of your configured validation job (newest first on each page).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-start"
                  disabled={cloudRunExecQuery.isFetching}
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["adminCloudRunExecutions"] })}
                >
                  <RefreshCw
                    className={cn("h-4 w-4 mr-2", cloudRunExecQuery.isFetching && "animate-spin")}
                    aria-hidden
                  />
                  Refresh
                </Button>
              </div>
              {cloudRunExecQuery.isLoading ? (
                <div className="h-24 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading executions…
                </div>
              ) : cloudRunExecQuery.isError ? (
                <Alert variant="destructive" className="rounded-xl">
                  <AlertTitle>Could not load Cloud Run executions</AlertTitle>
                  <AlertDescription>
                    {formatClientError(cloudRunExecQuery.error, "Check GCP credentials and RUN_JOB_NAME / region.")}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  {cloudRunExecutionsAll.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No executions returned for this job yet.</p>
                  ) : null}
                  {cloudRunExecutionsVisible.map((row) => {
                    const timing = cloudRunExecutionTiming(row, Date.now());
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
                          {cloudRunExecutionDisplayId(row.shortName, row.executionName)}
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
                  {cloudRunHiddenCount > 0 ? (
                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setCloudRunExecutionsExpanded((v) => !v)}
                      >
                        {cloudRunExecutionsExpanded
                          ? "Show less"
                          : `Show more (${cloudRunHiddenCount} older)`}
                      </Button>
                    </div>
                  ) : null}
                  {cloudRunExecQuery.data?.nextPageToken ? (
                    <p className="text-[11px] text-muted-foreground pt-1">
                      More executions exist in GCP; only the first page is shown here.
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card/45 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm sm:text-base font-semibold text-foreground">User management</h2>
                <p className="text-xs text-muted-foreground">Manage admin access</p>
              </div>
              {adminUsersQuery.isLoading ? (
                <div className="h-40 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading users...
                </div>
              ) : adminUsersQuery.isError ? (
                <Alert variant="destructive" className="rounded-xl">
                  <AlertTitle>Failed to load users</AlertTitle>
                  <AlertDescription>
                    {formatClientError(adminUsersQuery.error, "Could not fetch admin user data.")}
                  </AlertDescription>
                </Alert>
              ) : (
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
              )}
            </div>
          </div>
          <Footer />
        </div>
      </div>
    </div>
  );
}
