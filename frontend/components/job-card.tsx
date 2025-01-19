'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, Clock, Briefcase, Check, X, Trash2 } from "lucide-react";
import { Job } from "@/types/job";
import { useState, useEffect } from "react";
import { JobDialog } from "./job-dialog";
import { highlightKeywords } from "@/lib/utils";
import { toast } from "react-toastify";
import { addToSettings, applyJob, rejectJob, getSettings } from "@/lib/api";

interface JobCardProps {
  job: Job;
  showIfBlacklisted?: boolean;
  easyApplyEnabled?: boolean;
}

function formatDate(dateString: string) {
  return new Date(parseInt(dateString) * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function JobCard({ job: initialJob, showIfBlacklisted = false, easyApplyEnabled = false }: JobCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isBlacklisted, setIsBlacklisted] = useState(false);
  const [job, setJob] = useState(initialJob);
  const isApplied = job.applied === "YES" || job.applied === "1";
  const isNeverApply = job.applied === "NEVER";

  // Check blacklist status on mount and when showIfBlacklisted changes
  useEffect(() => {
    const checkBlacklistStatus = async () => {
      try {
        const { data } = await getSettings();
        const noNoCompanies = data
          .filter((kw: any) => kw.type === 'NoCompany')
          .map((kw: any) => kw.name.toLowerCase());
        
        setIsBlacklisted(noNoCompanies.includes(job.companyName.toLowerCase()));
      } catch (error) {
        console.error('Error checking blacklist status:', error);
      }
    };

    checkBlacklistStatus();
  }, [job.companyName, showIfBlacklisted]);

  const handleApply = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    
    try {
      const result = await applyJob(job.id, job.method, job.link);
      
      if (result.success) {
        setJob(prev => ({ ...prev, applied: "YES" }));
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
      setDialogOpen(false); // Close dialog after action
    }
  };

  const handleReject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    
    try {
      const result = await rejectJob(job.id);
      
      if (result.success) {
        setJob(prev => ({ ...prev, applied: "NEVER" }));
        toast.success('Job rejected successfully');
      } else {
        throw new Error(result.error || 'Failed to reject');
      }
    } catch (error) {
      console.error('Error rejecting job:', error);
      toast.error('Failed to reject job');
    } finally {
      setIsLoading(false);
      setDialogOpen(false); // Close dialog after action
    }
  };

  const addToNoNoCompanies = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLoading(true);
    try {
      const result = await addToSettings(job.companyName, 'NoCompany');
      if (result.success) {
        toast.success(`Added ${job.companyName} to NO NO Companies`);
        setIsBlacklisted(true);
        setDialogOpen(false);
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

  const handleJobUpdate = (updatedJob: Job) => {
    setJob(updatedJob);
  };

  // If job is blacklisted and we're not showing blacklisted jobs, don't render anything
  if (isBlacklisted && !showIfBlacklisted) {
    return null;
  }

  // Render blacklisted job card
  if (isBlacklisted) {
    return (
      <>
        <Card 
          className="bg-red-950/20 hover:bg-red-950/30 transition-colors border-red-900/20 cursor-pointer w-full overflow-hidden"
          onClick={() => setDialogOpen(true)}
        >
          <CardHeader className="pb-3 pt-4 px-5">
            <div className="flex flex-col gap-3">
              <div className="space-y-2">
                <CardTitle className="text-sm sm:text-base font-medium text-red-300 break-words">
                  {job.title}
                </CardTitle>
                <CardDescription className="flex items-center gap-2 text-red-300/70">
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="break-words">{job.companyName}</span>
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-red-500/10 text-red-300 px-3 py-1 rounded-full border border-red-500/20 text-[10px] sm:text-xs">
                  {job.method}
                </span>
                <span className="bg-red-500/10 text-red-300 px-3 py-1 rounded-full border border-red-500/20 text-[10px] sm:text-xs">
                  {job.jobType}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-4 px-5">
            <div className="flex flex-wrap gap-4 text-[10px] sm:text-xs text-red-300/70 mb-3">
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
            <p className="text-[10px] sm:text-xs text-red-300/50 line-clamp-2 break-words">
              {highlightKeywords(job.jobDescription)}
            </p>
          </CardContent>
        </Card>

        <JobDialog 
          job={job}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          easyApplyEnabled={easyApplyEnabled}
          onJobUpdate={handleJobUpdate}
        />
      </>
    );
  }

  // Render applied job card
  if (isApplied) {
    return (
      <>
        <Card 
          className="bg-green-950/20 hover:bg-green-950/30 transition-colors border-green-900/20 cursor-pointer w-full overflow-hidden"
          onClick={() => setDialogOpen(true)}
        >
          <CardHeader className="pb-3 pt-4 px-5">
            <div className="space-y-2">
              <CardTitle className="text-sm sm:text-base font-medium text-green-300 break-words">
                {job.title}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 text-green-300/70">
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span className="break-words">{job.companyName}</span>
              </CardDescription>
            </div>
          </CardHeader>
        </Card>

        <JobDialog 
          job={job}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          easyApplyEnabled={easyApplyEnabled}
          onJobUpdate={handleJobUpdate}
        />
      </>
    );
  }

  // Render never apply job card
  if (isNeverApply) {
    return (
      <>
        <Card 
          className="bg-gray-900/20 hover:bg-gray-900/30 transition-colors border-gray-800/20 cursor-pointer w-full overflow-hidden"
          onClick={() => setDialogOpen(true)}
        >
          <CardHeader className="pb-3 pt-4 px-5">
            <div className="space-y-2">
              <CardTitle className="text-sm sm:text-base font-medium text-gray-400 break-words">
                {job.title}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 text-gray-500">
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span className="break-words">{job.companyName}</span>
              </CardDescription>
            </div>
          </CardHeader>
        </Card>

        <JobDialog 
          job={job}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          easyApplyEnabled={easyApplyEnabled}
          onJobUpdate={handleJobUpdate}
        />
      </>
    );
  }

  // Render regular job card
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
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
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
          <div className="flex justify-end gap-2">
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
        easyApplyEnabled={easyApplyEnabled}
        onJobUpdate={handleJobUpdate}
      />
    </>
  );
}