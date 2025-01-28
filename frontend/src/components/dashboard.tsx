import { JobCard } from '@/components/job-card';
import { StatsCounter } from '@/components/stats-counter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchIcon, Loader2Icon } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import type { Job } from '@/data/sample-jobs';

interface DashboardProps {
  jobs: Job[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  totalJobs: number;
  appliedJobs: number;
  rejectedJobs: number;
  pendingJobs: number;
  acceptDenyCounts: {
    countAccepted: number;
    countRejected: number;
  };
  updateJobStatus: (jobId: string, status: 'YES' | 'NEVER') => void;
  addKeyword: (name: string, type: string) => Promise<void>;
  isCompanyBlacklisted: (companyName: string) => boolean;
  useBot: boolean;
  onRetry?: () => void;
  onHoursChange: (hours: number) => Promise<void>;
}

export function Dashboard({
  jobs,
  isLoading,
  error,
  searchQuery,
  onSearchChange,
  totalJobs,
  appliedJobs,
  rejectedJobs,
  pendingJobs,
  acceptDenyCounts,
  updateJobStatus,
  addKeyword,
  isCompanyBlacklisted,
  useBot,
  onRetry,
  onHoursChange,
}: DashboardProps) {
  return (
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
        {!isLoading && !error && (
          <StatsCounter
            totalJobs={totalJobs}
            appliedJobs={appliedJobs}
            rejectedJobs={rejectedJobs}
            pendingJobs={pendingJobs}
            totalAccepted={acceptDenyCounts.countAccepted}
            totalRejected={acceptDenyCounts.countRejected}
          />
        )}

        <div className="flex gap-2 max-w-2xl mx-auto">
          <Input
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1"
          />
          <Button>
            <SearchIcon className="h-4 w-4 mr-2" />
            Search
          </Button>
        </div>

        <div className="grid gap-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2Icon className="h-8 w-8 animate-spin text-accent" />
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={onRetry} />
          ) : jobs.length === 0 ? (
            <EmptyState onHoursChange={onHoursChange} />
          ) : (
            jobs.map((job) => (
              <JobCard
                key={job.id}
                {...job}
                isBlacklisted={isCompanyBlacklisted(job.companyName)}
                onUpdateStatus={updateJobStatus}
                onAddKeyword={addKeyword}
                useBot={useBot}
              />
            ))
          )}
        </div>
      </div>
    </main>
  );
}