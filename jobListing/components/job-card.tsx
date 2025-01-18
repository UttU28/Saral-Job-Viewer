'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, Building2, Clock, MapPin, Check, X, Plus } from "lucide-react";
import { Job } from "@/types/job";
import { useState } from "react";
import { JobDialog } from "./job-dialog";
import { highlightKeywords } from "@/lib/utils";
import { Button } from "./ui/button";
import { toast } from "react-toastify";
import { addToSettings } from "@/lib/api";

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
  const [isLoading, setIsLoading] = useState(false);

  const handleApply = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    
    try {
      if (job.method === "Manual") {
        window.open(job.link, '_blank');
        return;
      }

      const response = await fetch('/api/jobs/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          method: job.method,
          link: job.link
        }),
      });

      if (!response.ok) throw new Error('Failed to apply');
    } catch (error) {
      console.error('Error applying to job:', error);
      toast.error('Failed to submit application');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/jobs/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      });

      if (!response.ok) throw new Error('Failed to reject');
    } catch (error) {
      console.error('Error rejecting job:', error);
      toast.error('Failed to reject job');
    } finally {
      setIsLoading(false);
    }
  };

  const addToNoNoCompanies = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await addToSettings(job.companyName, 'NoCompany');
      if (result.success) {
        toast.success(`Added ${job.companyName} to NO NO Companies`);
        // After adding to NO NO list, automatically reject the job
        await handleReject(e);
      } else {
        throw new Error('Failed to add company');
      }
    } catch (error) {
      console.error('Error adding company:', error);
      toast.error('Failed to add company to NO NO list');
      // Even if adding to NO NO list fails, still reject the job
      await handleReject(e);
    }
  };

  return (
    <>
      <Card 
        className="bg-[#111111] hover:bg-[#161616] transition-colors border-purple-900/20 cursor-pointer w-full overflow-hidden group"
        onClick={() => setDialogOpen(true)}
      >
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex flex-col gap-3">
            <div className="space-y-2">
              <CardTitle className="text-sm sm:text-base font-medium text-blue-300 break-words">
                {job.title}
              </CardTitle>
              <div className="flex items-center justify-between gap-2">
                <CardDescription className="flex items-center gap-2 text-purple-300/70">
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="break-words">{job.companyName}</span>
                </CardDescription>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-400 border-red-500/20 hover:bg-red-500/10"
                  onClick={addToNoNoCompanies}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add to NO NO
                </Button>
              </div>
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
          <p className="text-[10px] sm:text-xs text-gray-500 line-clamp-2 break-words mb-4">
            {highlightKeywords(job.jobDescription)}
          </p>
          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="sm"
              variant="outline"
              className="bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
              onClick={handleReject}
              disabled={isLoading}
            >
              <X className="mr-2 h-3.5 w-3.5" />
              Pass
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={job.method === "Manual" 
                ? "bg-blue-500/10 text-blue-300 border-blue-500/20 hover:bg-blue-500/20"
                : "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20"
              }
              onClick={handleApply}
              disabled={isLoading}
            >
              <Check className="mr-2 h-3.5 w-3.5" />
              {job.method === "Manual" ? "Apply" : "Easy Apply"}
            </Button>
          </div>
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