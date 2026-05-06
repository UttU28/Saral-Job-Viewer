import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  MapPin,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useJobDetailQuery } from "@/hooks/use-jobs";
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
import { useAuth } from "@/auth/AuthProvider";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { pastelMetaLineClasses } from "./constants";
import { formatApiDecisionError, isRejectedStatus, jobMetaHighlights, showAcceptForStatus, showRejectForStatus } from "./utils";

export function JobDetailPane({
  jobId,
  decisionBusyJobId,
  decisionBusyKind,
  beginDecision,
  finishDecision,
}: Readonly<{
  jobId: string | null;
  decisionBusyJobId: string | null;
  decisionBusyKind: JobDecision | null;
  beginDecision: (actingJobId: string, kind: JobDecision) => number;
  finishDecision: (
    actingJobId: string,
    gen: number,
    result: JobDecisionResponse | null,
    err: unknown,
  ) => void;
}>) {
  const detailQuery = useJobDetailQuery(jobId, Boolean(jobId));
  const { sessionProfile } = useAuth();
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
    const name = (sessionProfile?.name ?? "").trim();
    const email = (sessionProfile?.email ?? "").trim();
    const password = (sessionProfile?.password ?? "").trim();
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
      const email = (sessionProfile?.email ?? "").trim();
      const password = (sessionProfile?.password ?? "").trim();
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
              <KeyRound className="h-5 w-5 text-primary shrink-0" aria-hidden />
              Email and password required
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-left text-muted-foreground space-y-3 text-sm leading-relaxed pt-1">
                <p>
                  <strong className="text-foreground font-medium">Accept</strong> logs into Midhtech with your current{" "}
                  <strong className="text-foreground font-medium">email</strong> and{" "}
                  <strong className="text-foreground font-medium">password</strong> from this session and submits this job. Update password in{" "}
                  <strong className="text-foreground font-medium">Password</strong> tab if needed. <strong className="text-foreground font-medium">Reject</strong> only
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
                  navigate("/change-password");
              }}
            >
              <KeyRound className="h-4 w-4" aria-hidden />
              Open Password
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
              ) : acceptProgressResult?.skippedReason ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden />
                  Accept skipped
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
                        {acceptProgressResult.skippedReason ? (
                          <p className="text-amber-800 dark:text-amber-100/90 font-medium whitespace-pre-wrap break-words">
                            {acceptProgressResult.error}
                          </p>
                        ) : acceptProgressResult.error ? (
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
                        ) : !acceptProgressResult.error && !acceptProgressResult.skippedReason ? (
                          <p className="text-destructive">{formatApiDecisionError(acceptProgressResult)}</p>
                        ) : null}
                        {acceptProgressResult.dbApplyStatus ? (
                          <p className="text-xs text-muted-foreground pt-2 border-t border-border/60 mt-2">
                            Database apply status:{" "}
                            <strong className="text-foreground">
                              {acceptProgressResult.dbApplyStatus.replaceAll("_", " ")}
                            </strong>
                            {acceptProgressResult.skippedReason ? (
                              <span className="block mt-1 opacity-90">
                                Code: <code className="text-[11px]">{acceptProgressResult.skippedReason}</code>
                              </span>
                            ) : null}
                          </p>
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
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
            {showAcceptForStatus(job.applyStatus) ? (
              <Button
                type="button"
                size="default"
                disabled={decisionBusyHere}
                className="w-full sm:w-auto rounded-xl gap-2 h-11 sm:h-10 touch-manipulation bg-emerald-600 text-white hover:bg-emerald-600/90 border border-emerald-500/40 shadow-sm shadow-emerald-950/30"
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
                className="w-full sm:w-auto rounded-xl gap-2 h-11 sm:h-10 touch-manipulation"
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
                className="w-full sm:w-auto rounded-xl gap-2 h-11 sm:h-10 touch-manipulation border-violet-500/40 bg-violet-500/[0.08] text-foreground hover:bg-violet-500/15 dark:border-violet-400/35"
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
              <Button size="default" variant="default" className="w-full sm:w-auto rounded-xl gap-2 h-11 sm:h-10 touch-manipulation" asChild>
                <a href={originalUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Original URL
                </a>
              </Button>
            ) : null}
            {platformUrl ? (
              <Button size="default" variant="secondary" className="w-full sm:w-auto rounded-xl gap-2 h-11 sm:h-10 touch-manipulation" asChild>
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
