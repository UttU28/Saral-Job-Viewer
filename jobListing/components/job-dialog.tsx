'use client';

import { Job } from "@/types/job";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, Clock, Briefcase, ExternalLink, Check, X } from "lucide-react";
import { highlightKeywords } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";

interface JobDialogProps {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDate(dateString: string) {
  return new Date(parseInt(dateString) * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function JobDialog({ job, open, onOpenChange }: JobDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleApply = async () => {
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
      
      const result = await response.json();
      if (result.success) {
        toast.success('Application submitted successfully');
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Error applying to job:', error);
      toast.error('Failed to submit application');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/jobs/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      });

      if (!response.ok) throw new Error('Failed to reject');
      
      const result = await response.json();
      if (result.success) {
        toast.success('Job marked as passed');
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Error rejecting job:', error);
      toast.error('Failed to reject job');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[#111111] border-purple-900/20 p-6">
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="text-lg sm:text-xl font-medium text-blue-300 pr-8 break-words">
            {job.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Company and Job Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 text-purple-300/70">
              <Building2 className="w-4 h-4 shrink-0" />
              <span className="text-base break-words">{job.companyName}</span>
            </div>
            
            <div className="flex flex-wrap gap-x-4 gap-y-2.5 text-xs text-gray-400">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="break-words">{job.location}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                {formatDate(job.timeStamp)}
              </div>
              <div className="flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5 shrink-0" />
                {job.jobType}
              </div>
            </div>

            <div className="flex gap-2 text-xs">
              <span className="bg-blue-500/10 text-blue-300 px-3 py-1 rounded-full border border-blue-500/20">
                {job.method}
              </span>
            </div>
          </div>

          {/* Job Description */}
          <ScrollArea className="h-[300px] rounded-md border border-purple-900/20 bg-[#0a0a0a] p-5">
            <div className="text-sm text-gray-300 whitespace-pre-line break-words">
              {highlightKeywords(job.jobDescription)}
            </div>
          </ScrollArea>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-4 justify-between items-center pt-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-gray-400 hover:text-gray-300"
                onClick={() => window.open(job.link, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2 shrink-0" />
                View Original
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                onClick={handleReject}
                disabled={isLoading}
              >
                <X className="mr-2 h-4 w-4" />
                Pass
              </Button>
            </div>
            
            <Button
              size="sm"
              className={job.method === "Manual" 
                ? "bg-blue-600 hover:bg-blue-700" 
                : "bg-green-600 hover:bg-green-700"}
              onClick={handleApply}
              disabled={isLoading}
            >
              <Check className="mr-2 h-4 w-4" />
              {job.method === "Manual" ? "Apply Now" : "Easy Apply"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}