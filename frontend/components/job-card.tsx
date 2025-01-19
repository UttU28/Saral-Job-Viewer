'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, Clock, Briefcase, Check, X, Trash2 } from "lucide-react";
import { Job } from "@/types/job";
import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { highlightKeywords } from "@/lib/utils";
import { toast } from "react-toastify";
import { addToSettings, applyJob, rejectJob } from "@/lib/api";

interface JobCardProps {
  job: Job;
  showIfBlacklisted?: boolean;
  easyApplyEnabled?: boolean;
  onJobUpdate?: (updatedJob: Job) => void;
  noNoCompanies: string[];
  onBlacklistUpdate?: () => void;
}

function formatDate(dateString: string) {
  return new Date(parseInt(dateString) * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function JobCard({ 
  job: initialJob, 
  showIfBlacklisted = false, 
  easyApplyEnabled = false,
  onJobUpdate,
  noNoCompanies,
  onBlacklistUpdate
}: JobCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [job, setJob] = useState(initialJob);
  const isApplied = job.applied === "YES" || job.applied === "1";
  const isNeverApply = job.applied === "NEVER";
  const isBlacklisted = noNoCompanies.includes(job.companyName.toLowerCase());

  const handleApply = async () => {
    setIsLoading(true);
    try {
      const result = await applyJob(job.id, job.method, job.link);
      
      if (result.success) {
        const updatedJob = { ...job, applied: "YES" };
        setJob(updatedJob);
        onJobUpdate?.(updatedJob);
        toast.success('Application submitted successfully');
        
        // If Easy Apply is disabled or it's a Manual application, open in new window
        if (!easyApplyEnabled || job.method === "Manual") {
          window.open(job.link, '_blank');
        }
      } else {
        throw new Error(result.error || 'Failed to apply');
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
      const result = await rejectJob(job.id);
      
      if (result.success) {
        const updatedJob = { ...job, applied: "NEVER" };
        setJob(updatedJob);
        onJobUpdate?.(updatedJob);
        toast.success('Job rejected successfully');
      } else {
        throw new Error(result.error || 'Failed to reject');
      }
    } catch (error) {
      console.error('Error rejecting job:', error);
      toast.error('Failed to reject job');
    } finally {
      setIsLoading(false);
    }
  };

  const addToNoNoCompanies = async () => {
    setIsLoading(true);
    try {
      const result = await addToSettings(job.companyName, 'NoCompany');
      if (result.success) {
        toast.success(`Added ${job.companyName} to NO NO Companies`);
        onBlacklistUpdate?.();
      } else {
        throw new Error('Failed to add company');
      }
    } catch (error) {
      console.error('Error adding company:', error);
      toast.error('Failed to add company to NO NO list');
    } finally {
      setIsLoading(false);
    }
  };

  // Update local job state when initialJob changes
  useEffect(() => {
    setJob(initialJob);
  }, [initialJob]);

  if (isBlacklisted && !showIfBlacklisted) {
    return null;
  }

  const cardContent = (
    color: string,
    textColor: string,
    borderColor: string,
    bgHoverColor: string,
    descriptionColor: string
  ) => (
    <Card 
      className={`${color} hover:${bgHoverColor} transition-all duration-200 ${borderColor} w-full overflow-hidden h-[430px]`}
    >
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="space-y-1.5">
          <CardTitle className={`text-base sm:text-lg font-medium ${textColor} truncate`}>
            {job.title}
          </CardTitle>
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2 text-purple-300">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="break-words">{job.companyName}</span>
            </CardDescription>
            <div className="flex items-center gap-2 shrink-0">
              <span className="bg-blue-500/10 text-blue-300 px-2 py-1 rounded-full border border-blue-500/20 text-[10px] font-medium">
                {job.method}
              </span>
              <span className="bg-purple-500/10 text-purple-300 px-2 py-1 rounded-full border border-purple-500/20 text-[10px] font-medium">
                {job.jobType}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4 px-5">
        <div className="flex flex-wrap gap-4 text-[10px] sm:text-xs text-blue-300/70 mb-3">
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
        <ScrollArea className={`h-[220px] rounded-md ${borderColor} bg-[#111111] p-4 mb-4`}>
          <div className="text-[11px] leading-relaxed tracking-wide text-gray-300 break-words">
            {highlightKeywords(job.jobDescription)}
          </div>
        </ScrollArea>
        {!isApplied && !isNeverApply && (
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              size="sm"
              className="text-red-400 border-red-500/20 hover:bg-red-500/10 transition-colors"
              onClick={addToNoNoCompanies}
              disabled={isLoading}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Add to NO NO
            </Button>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 transition-colors"
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
                  ? "bg-blue-500/10 text-blue-300 border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                  : "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20 transition-colors"
                }
                onClick={handleApply}
                disabled={isLoading}
              >
                <Check className="mr-2 h-3.5 w-3.5" />
                {job.method === "Manual" ? "Apply" : "Easy Apply"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <>
      {isBlacklisted ? (
        cardContent(
          'bg-[#111111]',
          'text-red-300',
          'border-red-900/20',
          'bg-[#161616]',
          'text-red-200/90'
        )
      ) : isApplied ? (
        cardContent(
          'bg-[#111111]',
          'text-green-300',
          'border-green-900/20',
          'bg-[#161616]',
          'text-green-200/90'
        )
      ) : isNeverApply ? (
        cardContent(
          'bg-[#111111]',
          'text-gray-400',
          'border-gray-800/20',
          'bg-[#161616]',
          'text-gray-400/90'
        )
      ) : (
        cardContent(
          'bg-[#111111]',
          'text-blue-300',
          'border-purple-900/20',
          'bg-[#161616]',
          'text-gray-300'
        )
      )}
    </>
  );
}