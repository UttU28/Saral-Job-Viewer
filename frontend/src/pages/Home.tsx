import { useMemo, useState, type ComponentType } from "react";
import { motion } from "framer-motion";
import {
  BriefcaseBusiness,
  Building2,
  Clock3,
  ExternalLink,
  Globe2,
  LayoutGrid,
  MapPin,
  Search,
  ChevronDown,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useJobs } from "@/hooks/use-jobs";
import type { Job, PlatformFilter } from "@/lib/types";

export default function Home() {
  const [platform, setPlatform] = useState<PlatformFilter>("All");
  const [searchText, setSearchText] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [searchDraft, setSearchDraft] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const { jobs, total, isLoading, isError } = useJobs({
    platform,
    search: searchText.trim(),
    limit: 200,
    offset: 0,
  });

  const sortedJobs = useMemo<Job[]>(() => {
    const copy = [...jobs];
    if (sortBy === "oldest") {
      copy.sort((a, b) => parseTimestamp(a.timestamp) - parseTimestamp(b.timestamp));
      return copy;
    }
    if (sortBy === "company") {
      copy.sort((a, b) => {
        const byCompany = (a.companyName || "").localeCompare(b.companyName || "");
        if (byCompany !== 0) {
          return byCompany;
        }
        return (a.title || "").localeCompare(b.title || "");
      });
      return copy;
    }
    copy.sort((a, b) => parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp));
    return copy;
  }, [jobs, sortBy]);

  const selectedJob = useMemo<Job | undefined>(() => {
    if (!sortedJobs.length) {
      return undefined;
    }
    return sortedJobs.find((job) => job.jobId === selectedJobId) || sortedJobs[0];
  }, [sortedJobs, selectedJobId]);

  const platforms: PlatformFilter[] = ["All", "JobRight", "GlassDoor", "ZipRecruiter"];
  const skeletonKeys = ["sk-1", "sk-2", "sk-3", "sk-4", "sk-5"];
  const platformButtonClass = (name: PlatformFilter): string => {
    if (platform === name) {
      return "px-3 py-1.5 text-xs rounded-full border transition bg-primary/20 border-primary/40 text-primary";
    }
    return "px-3 py-1.5 text-xs rounded-full border transition bg-white/[0.03] border-white/10 text-muted-foreground hover:text-foreground";
  };

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemAnim = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center text-destructive">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Unable to load jobs</h2>
          <p>Make sure FastAPI server is running at `http://127.0.0.1:8000`.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-hidden">
      <motion.nav
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="h-[72px] px-4 md:px-8 lg:px-10 flex items-center justify-between border-b border-white/10 bg-card/70 backdrop-blur-md"
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
            <BriefcaseBusiness className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold font-display">Saral Job Viewer</h1>
            <p className="text-xs text-muted-foreground">Jobs workspace</p>
          </div>
        </div>
        <div className="px-3 py-1.5 rounded-full bg-primary/15 border border-primary/30 text-sm text-primary font-medium">
          {total} jobs
        </div>
      </motion.nav>

      {isLoading && (
        <div className="p-4 md:p-6 lg:px-10 grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)] gap-6 h-[calc(100vh-72px)]">
          <div className="space-y-4">
            {skeletonKeys.map((key) => (
              <Skeleton key={key} className="h-[120px] w-full rounded-xl bg-white/5" />
            ))}
          </div>
          <Skeleton className="h-[72vh] w-full rounded-2xl bg-white/5" />
        </div>
      )}

      {!isLoading && sortedJobs.length > 0 && (
        <div className="p-4 md:p-6 lg:px-10 grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)] gap-6 h-[calc(100vh-72px)]">
          <div className="glass-card rounded-2xl p-4 space-y-4 sticky top-0 self-start h-[calc(100vh-120px)] flex flex-col">
            <div className="flex gap-2">
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    setSearchText(searchDraft);
                  }
                }}
                placeholder="Search company, description, jobId"
                className="bg-background/40 border-white/10"
              />
              <Button
                onClick={() => setSearchText(searchDraft)}
                size="icon"
                className="glow-button"
                aria-label="Search jobs"
              >
                <Search className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {platforms.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setPlatform(name)}
                  className={platformButtonClass(name)}
                >
                  {name}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2">
              <label htmlFor="job-sort" className="text-xs text-muted-foreground">
                Sort
              </label>
              <div className="relative w-[160px]">
                <select
                  id="job-sort"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="w-full appearance-none rounded-lg border border-white/12 bg-background/50 px-3 py-2 pr-9 text-xs font-medium text-foreground shadow-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/25"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="company">Company A-Z</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
              {sortedJobs.map((job) => {
                const isSelected = selectedJob?.jobId === job.jobId;
                let selectedClasses =
                  "bg-white/[0.03] border-white/10 hover:bg-white/[0.06]";
                if (isSelected) {
                  selectedClasses =
                    "bg-primary/15 border-primary/40 shadow-[0_0_0_1px_rgba(130,110,255,0.2)]";
                }
                return (
                  <motion.button
                    key={job.jobId}
                    variants={itemAnim}
                    initial="hidden"
                    animate="show"
                    type="button"
                    onClick={() => setSelectedJobId(job.jobId)}
                    className={`w-full text-left rounded-xl p-4 border transition ${selectedClasses}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <p className="font-semibold text-sm leading-snug line-clamp-2">
                          {job.title || "Untitled role"}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {job.companyName || "Unknown company"} • {job.jobId}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">{job.platform}</Badge>
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="line-clamp-1">{job.location || "Location not listed"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <BriefcaseBusiness className="w-3.5 h-3.5" />
                        <span className="line-clamp-1">
                          {[job.employmentType, job.workModel].filter(Boolean).join(" • ") || "Role details pending"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock3 className="w-3.5 h-3.5" />
                        <span className="line-clamp-1">{formatTimestamp(job.timestamp)}</span>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="h-[calc(100vh-120px)] overflow-y-auto px-2 md:px-4"
          >
            {selectedJob ? (
              <div className="space-y-6 pb-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-2">
                    <h2 className="text-2xl md:text-3xl font-bold">
                      {selectedJob.title || "Untitled role"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedJob.companyName || "Unknown company"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge>{selectedJob.platform}</Badge>
                      {selectedJob.applyStatus && <Badge variant="secondary">{selectedJob.applyStatus}</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a href={selectedJob.jobUrl} target="_blank" rel="noreferrer">
                      <Button className="glow-button">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Open Listing
                      </Button>
                    </a>
                    <a href={selectedJob.originalJobPostUrl} target="_blank" rel="noreferrer">
                      <Button variant="outline" className="border-white/20 bg-white/[0.03]">
                        <Globe2 className="w-4 h-4 mr-2" />
                        Original Post
                      </Button>
                    </a>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <MetaCard icon={MapPin} label="Location" value={selectedJob.location} />
                  <MetaCard icon={LayoutGrid} label="Work Model" value={selectedJob.workModel} />
                  <MetaCard icon={BriefcaseBusiness} label="Employment" value={selectedJob.employmentType} />
                  <MetaCard icon={Building2} label="Seniority" value={selectedJob.seniority} />
                </div>

                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Job Description</h3>
                  <div className="rounded-xl bg-black/20 border border-white/10 p-4 md:p-5">
                    <p className="text-sm leading-7 text-foreground/95 whitespace-pre-wrap">
                      {selectedJob.jobDescription || "No description available."}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border-t border-white/10 pt-4">
                  <div className="inline-flex items-center gap-1.5">
                    <Clock3 className="w-3.5 h-3.5" />
                    {selectedJob.timestamp || "Time unavailable"}
                  </div>
                  <div>Experience: {selectedJob.experience || "Not provided"}</div>
                  <div>Job ID: {selectedJob.jobId}</div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Select a job from the left list.
              </div>
            )}
          </motion.div>
        </div>
      )}

      {!isLoading && sortedJobs.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="m-4 md:m-6 lg:mx-10 h-[calc(100vh-120px)] flex flex-col items-center justify-center text-center border border-white/10 rounded-3xl bg-white/[0.02]"
        >
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-6">
            <BriefcaseBusiness className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-bold mb-2 font-display">No jobs found</h3>
          <p className="text-muted-foreground max-w-sm">
            Scrape jobs first, then reload. You can also clear filters/search.
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              onClick={() => {
                setPlatform("All");
                setSearchText("");
                setSearchDraft("");
              }}
              variant="outline"
              className="border-white/20 bg-white/[0.03]"
            >
              Clear Filters
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

type MetaCardProps = Readonly<{
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}>;

function MetaCard({ icon: Icon, label, value }: MetaCardProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <div className="inline-flex items-center gap-1.5 text-sm font-medium">
        <Icon className="w-4 h-4 text-primary" />
        <span>{value || "Not specified"}</span>
      </div>
    </div>
  );
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value || "");
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

function formatTimestamp(value: string): string {
  const ts = parseTimestamp(value);
  if (!ts) {
    return "Time unavailable";
  }
  return new Date(ts).toLocaleString();
}
