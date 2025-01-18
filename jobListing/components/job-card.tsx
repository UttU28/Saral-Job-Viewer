'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, Building2, Clock, MapPin } from "lucide-react";
import { Job } from "@/types/job";
import { useState } from "react";
import { JobDialog } from "./job-dialog";
import { highlightKeywords } from "@/lib/utils";

interface JobCardProps {
  job: Job;
}

function formatDate(dateString: string) {
  return new Date(parseInt(dateString) * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function JobCard({ job }: JobCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Card 
        className="bg-[#111111] hover:bg-[#161616] transition-colors border-purple-900/20 cursor-pointer w-full overflow-hidden"
        onClick={() => setDialogOpen(true)}
      >
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex flex-col gap-3">
            <div className="space-y-2">
              <CardTitle className="text-sm sm:text-base font-medium text-blue-300 break-words">
                {job.title}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 text-purple-300/70">
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span className="break-words">{job.companyName}</span>
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-blue-500/10 text-blue-300 px-3 py-1 rounded-full border border-blue-500/20 text-[10px] sm:text-xs">
                {job.method}
              </span>
              <span className="bg-purple-500/10 text-purple-300 px-3 py-1 rounded-full border border-purple-500/20 text-[10px] sm:text-xs">
                {job.jobType}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-4 px-5">
          <div className="flex flex-wrap gap-4 text-[10px] sm:text-xs text-gray-400 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="break-words">{job.location}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">{formatDate(job.timeStamp)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Briefcase className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">ID: {job.id}</span>
            </div>
          </div>
          <p className="text-[10px] sm:text-xs text-gray-500 line-clamp-2 break-words">
            {highlightKeywords(job.jobDescription)}
          </p>
        </CardContent>
      </Card>

      <JobDialog 
        job={job}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}