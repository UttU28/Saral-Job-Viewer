'use client';

import { Job } from "@/types/job";
import { JobCard } from "@/components/job-card";

interface JobSectionProps {
  title: string;
  jobs: Job[];
  showIfBlacklisted: boolean;
  easyApplyEnabled: boolean;
  onJobUpdate: (updatedJob: Job) => void;
  noNoCompanies: string[];
  onBlacklistUpdate: () => void;
}

export function JobSection({
  title,
  jobs,
  showIfBlacklisted,
  easyApplyEnabled,
  onJobUpdate,
  noNoCompanies,
  onBlacklistUpdate
}: JobSectionProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-blue-300 border-b border-blue-900/20 pb-2">
        {title}
        <span className="text-sm font-normal text-gray-400 ml-2">
          ({jobs.length} jobs)
        </span>
      </h2>
      <div className="grid gap-4">
        {jobs.map((job) => (
          <JobCard 
            key={job.id} 
            job={job} 
            showIfBlacklisted={showIfBlacklisted}
            easyApplyEnabled={easyApplyEnabled}
            onJobUpdate={onJobUpdate}
            noNoCompanies={noNoCompanies}
            onBlacklistUpdate={onBlacklistUpdate}
          />
        ))}
      </div>
      {jobs.length === 0 && (
        <div className="text-gray-400 text-center py-4 bg-[#111111] rounded-lg p-4">
          No jobs match your filters
        </div>
      )}
    </div>
  );
}