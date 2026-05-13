import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  ArrowUp,
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
  experienceTagImpliesAboveFiveYears,
  findJobDescriptionExperienceTags,
  maxNumericFromExperienceTag,
} from "@/lib/jobDescriptionExperience";
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

/** Smooth deceleration — slides in comfortably with no overshoot or wobble at the end. */
function easeOutCubic(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(1 - t, 3);
}

type RafRef = { current: number | null };

function runSmoothScrollTo(
  el: HTMLElement,
  targetTop: number,
  rafRef: RafRef,
  durationMs: number = 720,
): void {
  if (rafRef.current !== null) {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  const start = el.scrollTop;
  const clampedTarget = Math.max(0, targetTop);
  if (Math.abs(start - clampedTarget) < 0.5) {
    el.scrollTop = clampedTarget;
    el.dispatchEvent(new Event("scroll"));
    return;
  }

  const delta = clampedTarget - start;
  const t0 = performance.now();

  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / durationMs);
    const eased = easeOutCubic(t);
    el.scrollTop = Math.max(0, start + delta * eased);
    if (t < 1) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      el.scrollTop = clampedTarget;
      rafRef.current = null;
      el.dispatchEvent(new Event("scroll"));
    }
  };
  rafRef.current = requestAnimationFrame(tick);
}

function findScrollableParent(node: HTMLElement | null): HTMLElement | null {
  if (!node) return null;
  let cur: HTMLElement | null = node.parentElement;
  while (cur) {
    const style = globalThis.getComputedStyle(cur);
    const canScrollY = /(auto|scroll)/.test(style.overflowY);
    if (canScrollY && cur.scrollHeight > cur.clientHeight) return cur;
    cur = cur.parentElement;
  }
  return null;
}

/** Same ease-out scroll as Top button: center `anchor` inside its scroll container (or viewport). */
function smoothScrollElementIntoCenter(anchor: HTMLElement, rafRef: RafRef, durationMs: number = 720): void {
  const scroller = findScrollableParent(anchor);
  if (scroller) {
    const sRect = scroller.getBoundingClientRect();
    const aRect = anchor.getBoundingClientRect();
    const anchorTopInScroller = aRect.top - sRect.top + scroller.scrollTop;
    const targetScroll = anchorTopInScroller - scroller.clientHeight / 2 + aRect.height / 2;
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const targetTop = Math.max(0, Math.min(maxScroll, targetScroll));
    runSmoothScrollTo(scroller, targetTop, rafRef, durationMs);
    return;
  }
  const root = document.scrollingElement;
  if (root instanceof HTMLElement) {
    const aRect = anchor.getBoundingClientRect();
    const vh = root.clientHeight;
    const targetScroll = root.scrollTop + aRect.top - vh / 2 + aRect.height / 2;
    const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
    const targetTop = Math.max(0, Math.min(maxScroll, targetScroll));
    runSmoothScrollTo(root, targetTop, rafRef, durationMs);
    return;
  }
  anchor.scrollIntoView({ behavior: "smooth", block: "center" });
}

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
  const paneTopRef = useRef<HTMLDivElement | null>(null);
  const descriptionContainerRef = useRef<HTMLDivElement | null>(null);
  const topScrollRafRef = useRef<number | null>(null);
  const detailQuery = useJobDetailQuery(jobId, Boolean(jobId));
  const { sessionProfile } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [profileRequiredOpen, setProfileRequiredOpen] = useState(false);
  const [moveToApplyPending, setMoveToApplyPending] = useState(false);
  const [acceptProgressOpen, setAcceptProgressOpen] = useState(false);
  const [acceptProgressLoading, setAcceptProgressLoading] = useState(false);
  const [acceptProgressResult, setAcceptProgressResult] = useState<JobDecisionResponse | null>(null);
  const [acceptProgressNetworkError, setAcceptProgressNetworkError] = useState<string | null>(null);
  const [scrollToTopFabVisible, setScrollToTopFabVisible] = useState(false);

  useEffect(() => {
    setAcceptProgressOpen(false);
    setAcceptProgressLoading(false);
    setAcceptProgressResult(null);
    setAcceptProgressNetworkError(null);
  }, [jobId]);

  useEffect(() => {
    return () => {
      if (topScrollRafRef.current !== null) {
        cancelAnimationFrame(topScrollRafRef.current);
        topScrollRafRef.current = null;
      }
    };
  }, [jobId]);

  /** Hide the FAB when the detail pane is already near the top; show only when there is real scroll room. */
  useEffect(() => {
    if (!jobId || detailQuery.isLoading || !detailQuery.isSuccess || !detailQuery.data) {
      setScrollToTopFabVisible(false);
      return;
    }

    const pane = paneTopRef.current;
    if (!pane) return;

    const thresholdPx = 80;
    let alive = true;
    let removeListener: (() => void) | null = null;

    const bind = () => {
      removeListener?.();
      removeListener = null;

      const sc = findScrollableParent(pane);
      const sync = () => {
        if (!alive) return;
        if (sc) {
          const maxScroll = sc.scrollHeight - sc.clientHeight;
          setScrollToTopFabVisible(maxScroll > thresholdPx && sc.scrollTop > thresholdPx);
          return;
        }
        const root = document.scrollingElement;
        if (root instanceof HTMLElement) {
          const maxScroll = root.scrollHeight - root.clientHeight;
          setScrollToTopFabVisible(maxScroll > thresholdPx && root.scrollTop > thresholdPx);
          return;
        }
        setScrollToTopFabVisible(false);
      };

      if (sc) {
        sc.addEventListener("scroll", sync, { passive: true });
        removeListener = () => sc.removeEventListener("scroll", sync);
      } else {
        globalThis.addEventListener("scroll", sync, { passive: true });
        removeListener = () => globalThis.removeEventListener("scroll", sync);
      }
      sync();
    };

    bind();

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(bind);
    });
    ro.observe(pane);

    requestAnimationFrame(bind);

    return () => {
      alive = false;
      removeListener?.();
      ro.disconnect();
    };
  }, [jobId, detailQuery.isLoading, detailQuery.isSuccess, detailQuery.data]);

  const experienceTags = useMemo(
    () => findJobDescriptionExperienceTags(detailQuery.data?.jobDescription),
    [detailQuery.data?.jobDescription],
  );
  const descriptionHighlightSegments = useMemo(
    () => buildDescriptionHighlightSegments(detailQuery.data?.jobDescription ?? ""),
    [detailQuery.data?.jobDescription],
  );

  const normalizeExperienceTag = (v: string): string => v.replaceAll(/\s+/g, " ").trim().toLowerCase();

  const firstHighlightAnchorByTag = useMemo(() => {
    const byTag = new Map<string, string>();
    const normalizedTags = experienceTags.map((t) => ({ raw: t, normalized: normalizeExperienceTag(t) }));
    let highlightOrdinal = 0;
    for (const seg of descriptionHighlightSegments) {
      if (!seg.highlight) continue;
      const anchorId = `jd-exp-${highlightOrdinal}`;
      const normalizedSeg = normalizeExperienceTag(seg.text);
      for (const t of normalizedTags) {
        if (byTag.has(t.raw)) continue;
        if (normalizedSeg.includes(t.normalized)) {
          byTag.set(t.raw, anchorId);
        }
      }
      highlightOrdinal += 1;
    }
    return byTag;
  }, [descriptionHighlightSegments, experienceTags]);

  const getExperienceChipClassName = (tag: string): string => {
    const highest = maxNumericFromExperienceTag(tag);
    if (experienceTagImpliesAboveFiveYears(tag)) {
      return "border-red-500/55 bg-red-500/[0.12] text-red-950 hover:bg-red-500/[0.18] dark:border-red-400/50 dark:bg-red-950/45 dark:text-red-50/95";
    }
    if (highest !== null && highest <= 2) {
      return "border-emerald-500/55 bg-emerald-500/[0.13] text-emerald-950 hover:bg-emerald-500/[0.2] dark:border-emerald-400/50 dark:bg-emerald-950/45 dark:text-emerald-50/95";
    }
    return "border-amber-500/50 bg-amber-500/[0.14] text-amber-950 hover:bg-amber-500/[0.2] dark:border-amber-400/45 dark:bg-amber-950/40 dark:text-amber-50/95";
  };

  const scrollToExperienceTag = (tag: string) => {
    const anchorId = firstHighlightAnchorByTag.get(tag);
    if (!anchorId) return;
    const el = document.getElementById(anchorId);
    if (!el) return;
    smoothScrollElementIntoCenter(el, topScrollRafRef);
  };

  const scrollPaneToTop = () => {
    const topEl = paneTopRef.current;
    if (!topEl) return;
    const scroller = findScrollableParent(topEl);
    if (scroller) {
      runSmoothScrollTo(scroller, 0, topScrollRafRef);
      return;
    }
    const root = document.scrollingElement;
    if (root instanceof HTMLElement) {
      const rect = topEl.getBoundingClientRect();
      const pad = 12;
      const targetTop = Math.max(0, root.scrollTop + rect.top - pad);
      runSmoothScrollTo(root, targetTop, topScrollRafRef);
      return;
    }
    topEl.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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

      <div ref={paneTopRef} className="w-full max-w-none p-4 sm:p-5 md:p-6 lg:px-8 lg:py-6 xl:px-10 xl:py-8 space-y-6 sm:space-y-8">
        <div className="space-y-3 sm:space-y-4">
          {experienceTags.length > 0 ? (
            <div className="space-y-2">
              <div
                className="flex flex-wrap gap-2"
                aria-label="Experience-related phrases detected in the job description"
              >
                {experienceTags.map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => scrollToExperienceTag(tag)}
                    className={cn(
                      "inline-flex max-w-full items-center rounded-lg border px-3 py-1.5 text-sm font-medium leading-snug shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
                      getExperienceChipClassName(tag),
                    )}
                    title="Jump to this text in full description"
                  >
                    {tag}
                  </button>
                ))}
              </div>
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
                variant="outline"
                className="w-full sm:w-auto rounded-xl gap-2 h-11 sm:h-10 touch-manipulation border-emerald-400/80 bg-transparent text-emerald-700 hover:bg-emerald-500/[0.12] dark:text-emerald-300"
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
                variant="outline"
                disabled={decisionBusyHere}
                className="w-full sm:w-auto rounded-xl gap-2 h-11 sm:h-10 touch-manipulation border-rose-400/80 bg-transparent text-rose-700 hover:bg-rose-500/[0.12] dark:text-rose-300"
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
                className="w-full sm:w-auto rounded-xl gap-2 h-11 sm:h-10 touch-manipulation border-violet-400/80 bg-transparent text-violet-700 hover:bg-violet-500/[0.12] dark:text-violet-300"
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
              <Button size="default" variant="outline" className="w-full sm:w-auto rounded-xl gap-2 h-11 sm:h-10 touch-manipulation border-violet-400/80 bg-transparent text-violet-700 hover:bg-violet-500/[0.12] dark:text-violet-300" asChild>
                <a href={originalUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Original URL
                </a>
              </Button>
            ) : null}
            {platformUrl ? (
              <Button size="default" variant="outline" className="w-full sm:w-auto rounded-xl gap-2 h-11 sm:h-10 touch-manipulation border-zinc-400/80 bg-transparent text-zinc-700 hover:bg-zinc-500/[0.12] dark:text-zinc-300" asChild>
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
            {experienceTags.length > 0 ? (
              <span className="block mt-1.5 normal-case font-sans font-normal text-[11px] sm:text-xs text-muted-foreground tracking-normal">
                {
                  'Highlighted spans match experience-style requirements (ranges, "+ years", yr(s), etc.).'
                }
              </span>
            ) : null}
          </h3>
          <div
            ref={descriptionContainerRef}
            className="rounded-2xl border border-border/80 bg-background/65 p-4 sm:p-6 w-full shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
          >
            <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground/90 dark:text-zinc-200 leading-relaxed m-0 w-full [tab-size:2]">
              {(job.jobDescription ?? "").trim() ? (
                (() => {
                  let highlightOrdinal = 0;
                  return descriptionHighlightSegments.map((seg, i) => {
                    if (!seg.highlight) return <span key={`jd-${i}`}>{seg.text}</span>;
                    const anchorId = `jd-exp-${highlightOrdinal}`;
                    highlightOrdinal += 1;
                    return (
                      <mark
                        id={anchorId}
                        key={`jd-${i}`}
                        className="rounded-sm bg-amber-200/95 px-0.5 text-foreground shadow-[inset_0_-1px_0_0_rgba(180,83,9,0.35)] dark:bg-amber-500/30 dark:text-amber-50 dark:shadow-none"
                      >
                        {seg.text}
                      </mark>
                    );
                  });
                })()
              ) : (
                "No description stored for this job."
              )}
            </pre>
          </div>
        </div>
      </div>
      {scrollToTopFabVisible ? (
        <button
          type="button"
          onClick={scrollPaneToTop}
          className={cn(
            "fixed z-30 inline-flex items-center gap-2 rounded-2xl border border-border/90 bg-card/95 px-3.5 py-2.5 text-sm font-semibold text-foreground shadow-lg backdrop-blur-md",
            "ring-1 ring-black/[0.06] dark:ring-white/[0.08]",
            "transition-[transform,box-shadow,background-color] duration-200 ease-out",
            "hover:bg-card hover:shadow-xl active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "bottom-8 left-8 md:bottom-10 md:left-8",
            "lg:left-[calc(1.25rem+340px+1rem)] xl:left-[calc(1.25rem+380px+1rem)]",
          )}
          title="Scroll job details to top"
          aria-label="Scroll job details to top"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary dark:bg-primary/20 dark:text-primary">
            <ArrowUp className="h-4 w-4" aria-hidden />
          </span>
          <span className="pr-0.5">Top</span>
        </button>
      ) : null}
    </>
  );
}
