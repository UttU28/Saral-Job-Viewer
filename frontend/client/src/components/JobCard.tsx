import { Ban, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
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
import type { Job } from "@shared/schema";

interface JobCardProps {
  job: Job;
  onOpenDetails?: (job: Job) => void;
  onBlacklistCompany?: (companyName: string) => void;
}

export function JobCard({ job, onOpenDetails, onBlacklistCompany }: JobCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);

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
    <Card
      className="p-4 hover-elevate cursor-pointer transition-all"
      data-testid={`card-job-${job.id}`}
      onClick={() => onOpenDetails?.(job)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3
              className="font-semibold text-base md:text-lg hover:text-primary transition-colors cursor-pointer line-clamp-1 flex-1"
              onClick={(e) => {
                e.stopPropagation();
                window.open(job.link, '_blank', 'noopener,noreferrer');
              }}
              data-testid={`text-title-${job.id}`}
            >
              {job.title}
            </h3>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span data-testid={`text-time-${job.id}`}>{getTimeAgo(job.timeStamp)}</span>
              </div>
              {onBlacklistCompany && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowConfirm(true);
                    }}
                    className="h-8 w-8"
                    data-testid={`button-blacklist-${job.id}`}
                  >
                    <Ban className="h-4 w-4" />
                    <span className="sr-only">Blacklist Company</span>
                  </Button>

                  <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Blacklist Company</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to blacklist "{job.companyName}"? Jobs from this company will be hidden from your feed.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => {
                            e.stopPropagation();
                            onBlacklistCompany(job.companyName);
                            setShowConfirm(false);
                          }}
                        >
                          Blacklist
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" data-testid={`text-company-${job.id}`}>
              {job.companyName}
            </Badge>
            <Badge variant="outline" data-testid={`text-location-${job.id}`}>
              {job.location}
            </Badge>
            <Badge variant="outline" data-testid={`text-jobtype-${job.id}`}>
              {job.jobType}
            </Badge>
            {job.aiTags && job.aiTags.split(",").slice(0, 3).map((tag, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">
                {tag.trim()}
              </Badge>
            ))}
          </div>

          <p className="text-sm text-muted-foreground mt-3 line-clamp-2" data-testid={`text-description-${job.id}`}>
            {job.jobDescription}
          </p>
        </div>
      </div>
    </Card>
  );
}