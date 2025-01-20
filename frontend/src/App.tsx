import { ThemeProvider } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { JobCard } from '@/components/job-card';
import { StatsCounter } from '@/components/stats-counter';
import { KeywordManager } from '@/components/keyword-manager';
import { useJobs } from '@/hooks/use-jobs';
import { useKeywords } from '@/hooks/use-keywords';
import { Toaster } from 'sonner';
import {
  LinkedinIcon,
  SearchIcon,
  FilterIcon,
  Loader2Icon,
  XCircleIcon,
} from 'lucide-react';
import { useState, useMemo } from 'react';

// Helper function to escape special regex characters
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function App() {
  const { jobs, isLoading: jobsLoading, error: jobsError, updateJobStatus } = useJobs();
  const {
    noCompanyKeywords,
    searchListKeywords,
    isLoading: keywordsLoading,
    addKeyword,
    removeKeyword,
  } = useKeywords();
  const [showBlacklisted, setShowBlacklisted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter and sort jobs based on search terms and blacklist status
  const filteredAndSortedJobs = useMemo(() => {
    // First, filter based on blacklist status
    const blacklistFiltered = jobs.filter(job => {
      const isCompanyBlacklisted = noCompanyKeywords.some(
        keyword => job.companyName.toLowerCase().includes(keyword.name.toLowerCase())
      );
      return showBlacklisted ? isCompanyBlacklisted : !isCompanyBlacklisted;
    });

    if (!searchQuery.trim()) {
      return blacklistFiltered;
    }

    // Split search query into terms and clean them
    const searchTerms = searchQuery
      .split(',')
      .map(term => term.trim().toLowerCase())
      .filter(Boolean);

    if (searchTerms.length === 0) {
      return blacklistFiltered;
    }

    // Calculate matches and sort
    return blacklistFiltered
      .map(job => {
        const description = job.jobDescription.toLowerCase();
        const title = job.title.toLowerCase();
        const company = job.companyName.toLowerCase();

        // Calculate match score
        let matchScore = 0;
        searchTerms.forEach(term => {
          const escapedTerm = escapeRegExp(term);
          try {
            const regex = new RegExp(escapedTerm, 'g');
            // Count occurrences in description (weighted more)
            const descriptionMatches = (description.match(regex) || []).length;
            matchScore += descriptionMatches * 2;

            // Count occurrences in title (weighted most)
            const titleMatches = (title.match(regex) || []).length;
            matchScore += titleMatches * 3;

            // Count occurrences in company name
            const companyMatches = (company.match(regex) || []).length;
            matchScore += companyMatches;
          } catch (error) {
            console.error('Invalid search term:', term);
          }
        });

        return {
          ...job,
          matchScore,
          matches: matchScore > 0,
        };
      })
      .filter(job => job.matches)
      .sort((a, b) => b.matchScore - a.matchScore);
  }, [jobs, searchQuery, showBlacklisted, noCompanyKeywords]);

  // Calculate stats based on filtered jobs
  const totalJobs = filteredAndSortedJobs.length;
  const appliedJobs = filteredAndSortedJobs.filter(job => job.applied === 'YES').length;
  const rejectedJobs = filteredAndSortedJobs.filter(job => job.applied === 'NEVER').length;
  const pendingJobs = filteredAndSortedJobs.filter(job => job.applied === 'NO').length;

  // Handle adding keyword with duplicate check
  const handleAddKeyword = async (name: string, type: string) => {
    // Check if keyword already exists
    const exists = noCompanyKeywords.some(
      keyword => keyword.name.toLowerCase() === name.toLowerCase()
    );
    
    if (!exists) {
      await addKeyword(name, type);
    }
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b border-border/10 sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-between h-14 px-4">
            <div className="flex items-center gap-2">
              <LinkedinIcon className="h-6 w-6 text-primary" />
              <h1 className="text-lg font-semibold">LinkedIn Saral Apply</h1>
            </div>
          </div>
        </header>

        <div className="flex-1 flex">
          {/* Sidebar */}
          <aside className="w-64 border-r border-border/10 p-4 hidden md:block">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <FilterIcon className="h-4 w-4" /> Filters
                </h3>
                <Separator className="my-2" />
                <div className="flex items-center space-x-2 mb-4">
                  <Switch
                    id="show-blacklisted"
                    checked={showBlacklisted}
                    onCheckedChange={setShowBlacklisted}
                  />
                  <label
                    htmlFor="show-blacklisted"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Show Blacklisted
                  </label>
                </div>
                <KeywordManager
                  noCompanyKeywords={noCompanyKeywords}
                  searchListKeywords={searchListKeywords}
                  onAddKeyword={addKeyword}
                  onRemoveKeyword={removeKeyword}
                  isLoading={keywordsLoading}
                />
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 p-4">
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-bold tracking-tight">
                  Find Your Next Opportunity
                </h2>
                <p className="text-muted-foreground">
                  Simplified job search and application process
                </p>
              </div>

              {/* Stats Counter */}
              {!jobsLoading && !jobsError && (
                <StatsCounter
                  totalJobs={totalJobs}
                  appliedJobs={appliedJobs}
                  rejectedJobs={rejectedJobs}
                  pendingJobs={pendingJobs}
                />
              )}

              <div className="flex gap-2 max-w-2xl mx-auto relative">
                <Input
                  placeholder="Search jobs (comma-separated terms)..."
                  className="flex-1"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-[3.25rem] top-1/2 -translate-y-1/2"
                    onClick={() => setSearchQuery('')}
                  >
                    <XCircleIcon className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}
                <Button>
                  <SearchIcon className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>

              <div className="grid gap-6">
                {jobsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2Icon className="h-8 w-8 animate-spin text-accent" />
                  </div>
                ) : jobsError ? (
                  <div className="text-center py-8 text-destructive">
                    <p>{jobsError}</p>
                  </div>
                ) : filteredAndSortedJobs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No jobs found</p>
                  </div>
                ) : (
                  filteredAndSortedJobs.map((job) => {
                    const isBlacklisted = noCompanyKeywords.some(
                      keyword => job.companyName.toLowerCase().includes(keyword.name.toLowerCase())
                    );
                    return (
                      <JobCard 
                        key={job.id} 
                        {...job} 
                        onUpdateStatus={updateJobStatus}
                        onAddKeyword={handleAddKeyword}
                        isBlacklisted={isBlacklisted}
                      />
                    );
                  })
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
      <Toaster />
    </ThemeProvider>
  );
}

export default App;