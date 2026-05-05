import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Briefcase,
  Building2,
  ExternalLink,
  Loader2,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useJobDetailQuery, useJobInfiniteQuery, useJobPlatformsQuery } from "@/hooks/use-jobs";
import type { JobRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
] as const;

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
  if (s === "APPLY") return "default";
  if (s === "DO_NOT_APPLY") return "destructive";
  if (s === "EXISTING" || s === "APPLIED") return "secondary";
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

function JobListCard({
  job,
  selected,
  onSelect,
}: {
  job: JobRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const cardMetaLines = jobMetaHighlights(job);
  const companyText = (job.companyName ?? "").trim();
  const locationText = (job.location ?? "").trim();

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border px-3 py-2.5 sm:px-3.5 sm:py-3 transition-all duration-200",
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
          variant={applyStatusBadgeVariant(job.applyStatus)}
          className="text-[11px] px-2 py-0 h-6 font-medium"
        >
          {formatApplyStatusLabel(job.applyStatus)}
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
  );
}

function JobDetailPane({ jobId }: { jobId: string | null }) {
  const detailQuery = useJobDetailQuery(jobId, Boolean(jobId));

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
  const metaLine = jobMetaHighlights(job);
  const companyLine = (job.companyName ?? "").trim();
  const locationLine = (job.location ?? "").trim();

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
    <div className="w-full max-w-none p-4 sm:p-5 md:p-6 lg:px-8 lg:py-6 xl:px-10 xl:py-8 space-y-6 sm:space-y-8">
      <div className="space-y-3 sm:space-y-4">
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
        {originalUrl || platformUrl ? (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
        ) : null}
      </div>

      <div className="pb-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-primary dark:text-violet-300 mb-3">
          Full description
        </h3>
        <div className="rounded-2xl border border-border bg-gradient-to-b from-violet-100/50 via-muted/35 to-emerald-100/40 dark:from-violet-950/35 dark:via-zinc-900/55 dark:to-emerald-950/25 p-4 sm:p-6 w-full dark:shadow-[inset_0_1px_0_0_rgba(196,181,253,0.06)]">
          <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground/90 dark:text-zinc-200 leading-relaxed m-0 w-full">
            {(job.jobDescription ?? "").trim() || "No description stored for this job."}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [platformFilter, setPlatformFilter] = useState<string>(ALL_VALUE);
  const [applyFilter, setApplyFilter] = useState<string>(DEFAULT_APPLY_FILTER);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

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
                  {flatItems.map((job, rowIndex) => (
                    <JobListCard
                      key={job.jobId ? String(job.jobId) : `job-${rowIndex}`}
                      job={job}
                      selected={selectedJobId === job.jobId}
                      onSelect={() => setSelectedJobId(job.jobId)}
                    />
                  ))}
                  <div ref={loadMoreRef} className="h-6 flex justify-center items-center py-2">
                    {infiniteQuery.isFetchingNextPage ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary opacity-90" />
                    ) : null}
                  </div>
                </div>
              </aside>

              <section className="scrollbar-themed flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-contain bg-gradient-to-br from-background via-background to-primary/[0.03]">
                <JobDetailPane jobId={selectedJobId} />
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
