import { useState } from "react";
import { Clock, ExternalLink, Ban } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Job } from "@shared/schema";

interface JobDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  onBlacklistCompany?: (companyName: string) => void;
}

export function JobDetailsModal({
  open,
  onOpenChange,
  job,
  onBlacklistCompany,
}: JobDetailsModalProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  if (!job) return null;

  const getTimeAgo = (timestamp: string) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - parseInt(timestamp);
    const hours = Math.floor(diff / 3600);

    if (hours < 1) return "Less than 1 hour ago";
    if (hours === 1) return "1 hour ago";
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto mx-auto my-4 flex flex-col items-center">
        <DialogHeader>
          <DialogTitle className="text-xl md:text-2xl pr-8" data-testid="text-modal-title">
            {job.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 w-full max-w-2xl">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{getTimeAgo(job.timeStamp)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              {job.companyName}
            </Badge>
            <Badge variant="outline" className="text-sm">
              {job.location}
            </Badge>
            <Badge variant="outline" className="text-sm">
              {job.jobType}
            </Badge>
          </div>

          {job.aiTags && (
            <div className="flex flex-wrap gap-2">
              {job.aiTags.split(",").map((tag, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {tag.trim()}
                </Badge>
              ))}
            </div>
          )}

          <div className="border-t pt-4">
            <h4 className="font-semibold mb-3">Job Description</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {job.jobDescription}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-4 border-t">
            <Button
              asChild
              data-testid="button-apply-modal"
            >
              <a href={job.link} target="_blank" rel="noopener noreferrer">
                Apply Now <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>

            {onBlacklistCompany && (
              <Button
                variant="outline"
                onClick={() => setShowConfirm(true)}
                data-testid="button-blacklist-modal"
              >
                <Ban className="mr-2 h-4 w-4" />
                Blacklist Company
              </Button>
            )}
          </div>
        </div>

        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to blacklist this company?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. {job.companyName} will be added to your blocklist.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                onBlacklistCompany(job.companyName);
                onOpenChange(false);
              }}>Continue</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}