import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Briefcase,
  Building2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  MapPin,
  Search,
} from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useJobDetailQuery, useJobListQuery, useJobPlatformsQuery, useJobSummaryQuery } from "@/hooks/use-jobs";
import type { JobRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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

const ALL_VALUE = "__all__";

const APPLY_OPTIONS = [
  { value: ALL_VALUE, label: "All statuses" },
  { value: "pending", label: "Pending (no status)" },
  { value: "APPLY", label: "APPLY" },
  { value: "DO_NOT_APPLY", label: "DO NOT APPLY" },
  { value: "EXISTING", label: "EXISTING" },
  { value: "APPLIED", label: "APPLIED" },
  { value: "REDO", label: "REDO" },
] as const;

function formatApplyStatusLabel(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "Pending";
  return s.replace(/_/g, " ");
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

export default function Home() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [platformFilter, setPlatformFilter] = useState<string>(ALL_VALUE);
  const [applyFilter, setApplyFilter] = useState<string>(ALL_VALUE);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);

  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const summaryQuery = useJobSummaryQuery();
  const platformsQuery = useJobPlatformsQuery();

  useEffect(() => {
    setPage(1);
  }, [platformFilter, applyFilter, debouncedSearch]);

  const listQuery = useJobListQuery({
    page,
    pageSize,
    platform: platformFilter === ALL_VALUE ? undefined : platformFilter,
    applyStatus: applyFilter === ALL_VALUE ? undefined : applyFilter,
    search: debouncedSearch.trim() || undefined,
  });

  const detailQuery = useJobDetailQuery(detailJobId, detailOpen);

  const openDetail = (jobId: string | null) => {
    if (!jobId) return;
    setDetailJobId(jobId);
    setDetailOpen(true);
  };

  const totalPages = listQuery.data?.totalPages ?? 1;
  const total = listQuery.data?.total ?? 0;

  return (
    <div className="min-h-screen pb-24 md:pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8 pt-8 md:pt-12 space-y-8">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold font-display bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
            Job viewer
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-2xl">
            Paginated jobs from MongoDB with light list payloads. Filters apply on the server so the
            database does not load full collections into memory.
          </p>
        </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass-card rounded-2xl p-4 sm:p-5 space-y-3"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Database summary
          </h2>
          {summaryQuery.isLoading ? (
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-7 w-24 rounded-full bg-white/5" />
              ))}
            </div>
          ) : summaryQuery.isError ? (
            <p className="text-sm text-destructive">Could not load summary.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-white/15">
                Total {summaryQuery.data?.total ?? 0}
              </Badge>
              <Badge variant="outline" className="border-amber-500/30 text-amber-200/90">
                Pending {summaryQuery.data?.nullPending ?? 0}
              </Badge>
              <Badge variant="secondary">APPLY {summaryQuery.data?.apply ?? 0}</Badge>
              <Badge variant="destructive" className="opacity-90">
                D.N.A. {summaryQuery.data?.doNotApply ?? 0}
              </Badge>
              <Badge variant="outline" className="border-white/15">
                Existing {summaryQuery.data?.existing ?? 0}
              </Badge>
              <Badge variant="outline" className="border-white/15">
                Other {summaryQuery.data?.otherStatus ?? 0}
              </Badge>
              <Badge variant="outline" className="border-white/10 text-muted-foreground">
                pastData {summaryQuery.data?.pastDataRows ?? 0}
              </Badge>
            </div>
          )}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-2xl p-4 sm:p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative sm:col-span-2 lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search title, company, job ID…"
                className="pl-9 bg-background/50 border-white/10"
                aria-label="Search jobs"
              />
            </div>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="bg-background/50 border-white/10 w-full">
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
              <SelectTrigger className="bg-background/50 border-white/10 w-full">
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
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-muted-foreground">
            <span>
              {listQuery.isFetching && !listQuery.isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating…
                </span>
              ) : (
                <>
                  Showing{" "}
                  <span className="text-foreground font-medium tabular-nums">{total}</span> match
                  {total === 1 ? "" : "es"}
                </>
              )}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/15"
                disabled={page <= 1 || listQuery.isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only sm:ml-1">Prev</span>
              </Button>
              <span className="tabular-nums px-2">
                Page {page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/15"
                disabled={page >= totalPages || listQuery.isLoading}
                onClick={() => setPage((p) => p + 1)}
              >
                <span className="sr-only sm:not-sr-only sm:mr-1">Next</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.section>

        {listQuery.isError ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-center text-destructive">
            <p className="font-medium">Failed to load jobs</p>
            <p className="text-sm mt-1 opacity-90">
              Start the API ({`python app.py`} or uvicorn) and ensure MongoDB env vars are set.
            </p>
          </div>
        ) : listQuery.isLoading ? (
          <div className="grid gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-36 w-full rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : (listQuery.data?.items.length ?? 0) === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-white/10 rounded-3xl bg-white/[0.02]"
          >
            <Briefcase className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold font-display">No jobs match</h3>
            <p className="text-muted-foreground text-sm max-w-sm mt-2">
              Try clearing filters or widening your search.
            </p>
          </motion.div>
        ) : (
          <motion.ul
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: { staggerChildren: 0.04 },
              },
            }}
            className="grid gap-4 list-none p-0 m-0"
          >
            {(listQuery.data?.items ?? []).map((job, rowIndex) => (
              <motion.li
                key={job.jobId ? String(job.jobId) : `job-row-${rowIndex}`}
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  show: { opacity: 1, y: 0 },
                }}
                className="glass-card rounded-2xl p-4 sm:p-5 border-white/10 hover:border-primary/25 transition-colors"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-primary/25 text-primary/90">
                        {job.platform ?? "?"}
                      </Badge>
                      <Badge variant={applyStatusBadgeVariant(job.applyStatus)}>
                        {formatApplyStatusLabel(job.applyStatus)}
                      </Badge>
                    </div>
                    <h3 className="text-base sm:text-lg font-semibold font-display text-foreground leading-snug">
                      {job.title ?? "Untitled role"}
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{job.companyName ?? "—"}</span>
                      </span>
                      {(job.location ?? "").trim() ? (
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{job.location}</span>
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground/80 font-mono truncate">
                      {job.jobId ?? ""}
                    </p>
                  </div>
                  <div className="flex flex-row sm:flex-col gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="flex-1 sm:flex-none"
                      onClick={() => openDetail(job.jobId)}
                    >
                      Details
                    </Button>
                    {primaryJobLink(job) ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 sm:flex-none border-white/15"
                        asChild
                      >
                        <a href={primaryJobLink(job)!} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Open</span>
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </div>

      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetailJobId(null);
        }}
      >
        <DialogContent className="max-w-[min(100vw-1rem,42rem)] max-h-[min(90vh,720px)] overflow-y-auto border-white/10 bg-card/95 backdrop-blur-xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-left pr-8">
              {detailQuery.data?.title ?? "Job"}
            </DialogTitle>
          </DialogHeader>
          {detailQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : detailQuery.isError ? (
            <p className="text-destructive text-sm">Could not load job details.</p>
          ) : detailQuery.data ? (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{detailQuery.data.platform ?? "?"}</Badge>
                <Badge variant={applyStatusBadgeVariant(detailQuery.data.applyStatus)}>
                  {formatApplyStatusLabel(detailQuery.data.applyStatus)}
                </Badge>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-muted-foreground">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground/70">Company</dt>
                  <dd className="text-foreground">{detailQuery.data.companyName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground/70">Location</dt>
                  <dd className="text-foreground">{detailQuery.data.location ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground/70">Work / type</dt>
                  <dd className="text-foreground">
                    {[detailQuery.data.workModel, detailQuery.data.employmentType]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground/70">Posted</dt>
                  <dd className="text-foreground">{detailQuery.data.timestamp ?? "—"}</dd>
                </div>
              </dl>
              {primaryJobLink(detailQuery.data) ? (
                <Button variant="default" size="sm" asChild>
                  <a href={primaryJobLink(detailQuery.data)!} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open posting
                  </a>
                </Button>
              ) : null}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Description
                </h4>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground/90 bg-black/20 rounded-lg p-3 border border-white/5 max-h-[40vh] overflow-y-auto">
                  {(detailQuery.data.jobDescription ?? "").trim() || "—"}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
