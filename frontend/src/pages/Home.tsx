import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Briefcase, Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useJobInfiniteQuery, useJobPlatformsQuery } from "@/hooks/use-jobs";
import type { CurrentWeekAcceptsResponse, JobDecision, JobDecisionResponse } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ALL_VALUE, DEFAULT_APPLY_FILTER, PAGE_SIZE } from "./home/constants";
import { HomeJobsToolbar } from "./home/HomeJobsToolbar";
import { JobDetailPane } from "./home/JobDetailPane";
import { JobListCard } from "./home/JobListCard";
import type { JobCardDecisionState, JobListCardDecisionUi } from "./home/types";
import { formatApiDecisionError } from "./home/utils";

export default function Home() {
  const [platformFilter, setPlatformFilter] = useState<string>(ALL_VALUE);
  const [applyFilter, setApplyFilter] = useState<string>(DEFAULT_APPLY_FILTER);
  const [searchDraft, setSearchDraft] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
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
    search: committedSearch || undefined,
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

  const commitSearch = useCallback(() => {
    setCommittedSearch(searchDraft.trim());
  }, [searchDraft]);

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

      if (!result.ok && result.skippedReason) {
        void queryClient.invalidateQueries({ queryKey: ["jobDetail", actingJobId] });
        void queryClient.invalidateQueries({ queryKey: ["jobListInfinite"] });
        void queryClient.invalidateQueries({ queryKey: ["jobSummary"] });
        const detail = result.error?.trim() || "This action was skipped.";
        const title =
          result.skippedReason === "ALREADY_APPLIED"
            ? "Already applied"
            : result.skippedReason === "APPLY_IN_PROGRESS"
              ? "Someone is submitting this job"
              : result.skippedReason === "INVALID_STATUS_FOR_ACCEPT"
                ? "Not in APPLY status"
                : "Skipped";
        const detailWithDb =
          result.dbApplyStatus && !detail.includes(result.dbApplyStatus)
            ? `${detail}\n\nCurrent DB status: ${result.dbApplyStatus.replaceAll("_", " ")}`
            : detail;
        setJobCardDecisionState({
          jobId: actingJobId,
          loading: false,
          flash: {
            variant: "warning",
            message: title,
            detail: detailWithDb,
            applyStatus: result.dbApplyStatus,
          },
        });
        toast({
          title,
          description: detail.length > 280 ? `${detail.slice(0, 280)}…` : detail,
        });
        return;
      }

      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: ["jobDetail", actingJobId] });
        void queryClient.invalidateQueries({ queryKey: ["jobListInfinite"] });
        void queryClient.invalidateQueries({ queryKey: ["jobSummary"] });

        if (
          result.decision === "accept" &&
          result.applyStatusUpdated === "APPLIED"
        ) {
          queryClient.setQueryData<CurrentWeekAcceptsResponse>(
            ["currentWeekAccepts"],
            (prev) => {
              if (!prev) return prev;
              return { ...prev, acceptedCount: prev.acceptedCount + 1 };
            },
          );
          void queryClient.invalidateQueries({ queryKey: ["currentWeekAccepts"] });
          void queryClient.invalidateQueries({ queryKey: ["weeklyReport"] });
        }

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
        <div className="hidden lg:block">
          <HomeJobsToolbar
            searchDraft={searchDraft}
            onSearchDraftChange={setSearchDraft}
            onSearchCommit={commitSearch}
            platformFilter={platformFilter}
            onPlatformFilterChange={setPlatformFilter}
            applyFilter={applyFilter}
            onApplyFilterChange={setApplyFilter}
            platforms={platformsQuery.data?.platforms ?? []}
          />
        </div>

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
                "flex flex-col lg:flex-row gap-0 rounded-xl sm:rounded-2xl border border-border/80 overflow-hidden bg-card/50 dark:bg-card/35 shadow-[0_8px_30px_-16px_rgba(0,0,0,0.45)] w-full flex-1 min-h-0",
              )}
            >
              <aside className="w-full lg:w-[340px] xl:w-[380px] shrink-0 flex flex-col min-h-0 flex-1 lg:flex-none max-h-[40vh] min-h-[160px] sm:max-h-[44vh] sm:min-h-[200px] lg:max-h-none lg:min-h-0 border-b lg:border-b-0 lg:border-r border-border/80 bg-muted/20 dark:bg-zinc-950/40">
                <div className="px-3 py-2.5 border-b border-border/70 shrink-0 bg-background/50">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Results ({totalMatches})
                    </p>
                    <button
                      type="button"
                      className="lg:hidden inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-background/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                      onClick={() => setMobileFiltersOpen((v) => !v)}
                      aria-expanded={mobileFiltersOpen}
                      aria-controls="mobile-job-filters"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                      {mobileFiltersOpen ? "Hide" : "Filter"}
                    </button>
                  </div>
                </div>
                {mobileFiltersOpen ? (
                  <div id="mobile-job-filters" className="lg:hidden border-b border-border/70 px-2.5 py-2.5 bg-background/35">
                    <HomeJobsToolbar
                      searchDraft={searchDraft}
                      onSearchDraftChange={setSearchDraft}
                      onSearchCommit={commitSearch}
                      platformFilter={platformFilter}
                      onPlatformFilterChange={setPlatformFilter}
                      applyFilter={applyFilter}
                      onApplyFilterChange={setApplyFilter}
                      platforms={platformsQuery.data?.platforms ?? []}
                    />
                  </div>
                ) : null}
                <div
                  ref={listScrollRef}
                  className="scrollbar-themed flex-1 min-h-0 overflow-y-auto overscroll-contain px-2.5 py-2.5 space-y-2"
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

              <section className="scrollbar-themed flex-1 min-w-0 min-h-[45vh] lg:min-h-0 overflow-y-auto overscroll-contain bg-gradient-to-br from-background via-background to-muted/20">
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
