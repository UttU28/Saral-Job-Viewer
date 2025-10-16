import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { FilterButtons, type TimeFilter } from "@/components/FilterButtons";
import { JobCard } from "@/components/JobCard";
import { JobDetailsModal } from "@/components/JobDetailsModal";
import { KeywordsModal } from "@/components/KeywordsModal";
import type { Job, Keyword } from "@shared/schema";
import { Loader2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [keywordsModalOpen, setKeywordsModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const { toast } = useToast();

  const { data: jobs = [], isLoading: jobsLoading, refetch: refetchJobs } = useQuery<Job[]>({
    queryKey: ["/api/getAllJobs"],
  });

  const { data: keywords = [], isLoading: keywordsLoading } = useQuery<Keyword[]>({
    queryKey: ["/api/getKeywords"],
  });

  const addKeywordMutation = useMutation({
    mutationFn: async ({ name, type }: { name: string; type: "SearchList" | "NoCompany" }) => {
      const response = await apiRequest("POST", "/api/addKeyword", { name, type });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/getKeywords"] });
      toast({
        title: "Success",
        description: "Keyword added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add keyword",
        variant: "destructive",
      });
    },
  });

  const removeKeywordMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", "/api/removeKeyword", { id });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/getKeywords"] });
      toast({
        title: "Success",
        description: "Keyword removed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove keyword",
        variant: "destructive",
      });
    },
  });

  const filteredJobs = useMemo(() => {
    let filtered = jobs;

    // Apply time filter
    if (timeFilter !== "all") {
      const now = Math.floor(Date.now() / 1000);
      const filterSeconds = timeFilter * 3600;
      filtered = filtered.filter(job => {
        const diff = now - parseInt(job.timeStamp);
        return diff <= filterSeconds;
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(job =>
        job.title.toLowerCase().includes(query) ||
        job.companyName.toLowerCase().includes(query) ||
        job.location.toLowerCase().includes(query) ||
        job.jobDescription.toLowerCase().includes(query)
      );
    }

    // Sort by timestamp (newest first)
    filtered = [...filtered].sort((a, b) => parseInt(b.timeStamp) - parseInt(a.timeStamp));

    return filtered;
  }, [jobs, timeFilter, searchQuery]);

  const handleBlacklistCompany = (companyName: string) => {
    addKeywordMutation.mutate({ name: companyName, type: "NoCompany" });
  };

  const handleAddKeyword = (name: string, type: "SearchList" | "NoCompany") => {
    addKeywordMutation.mutate({ name, type });
  };

  const handleRemoveKeyword = (id: number) => {
    removeKeywordMutation.mutate(id);
  };

  const isLoading = jobsLoading || keywordsLoading;

  return (
    <div className="min-h-screen bg-background">
      <Header
        onRefresh={() => {
          refetchJobs();
          toast({
            title: "Refreshing",
            description: "Fetching latest jobs...",
          });
        }}
      />

      <main className="container mx-auto max-w-7xl px-4 md:px-6 py-6 md:py-8">
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1">
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search jobs by title, company, location, or description..."
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <FilterButtons activeFilter={timeFilter} onChange={setTimeFilter} />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setKeywordsModalOpen(true)}
                data-testid="button-keywords"
              >
                <Settings className="h-4 w-4" />
                <span className="sr-only">Keywords</span>
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground" data-testid="text-job-count">
              {isLoading ? (
                <span>Loading jobs...</span>
              ) : (
                <span>
                  Showing {filteredJobs.length} of {jobs.length} jobs
                </span>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-lg text-muted-foreground">
                {searchQuery ? "No jobs found matching your search" : "No jobs available"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onOpenDetails={setSelectedJob}
                  onBlacklistCompany={handleBlacklistCompany}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <JobDetailsModal
        open={!!selectedJob}
        onOpenChange={(open) => !open && setSelectedJob(null)}
        job={selectedJob}
        onBlacklistCompany={handleBlacklistCompany}
      />

      <KeywordsModal
        open={keywordsModalOpen}
        onOpenChange={setKeywordsModalOpen}
        keywords={keywords}
        onAddKeyword={handleAddKeyword}
        onRemoveKeyword={handleRemoveKeyword}
      />
    </div>
  );
}
