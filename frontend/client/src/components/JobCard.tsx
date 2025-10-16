import { Ban, Clock, AlertCircle, CheckCircle, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Job, AIAnalysis } from "@shared/schema";

interface JobCardProps {
  job: Job;
  onOpenDetails?: (job: Job) => void;
  onBlacklistCompany?: (companyName: string) => void;
}

export function JobCard({ job, onOpenDetails, onBlacklistCompany }: JobCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [aiInsightsOpen, setAiInsightsOpen] = useState(false);

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

  // Parse AI analysis data
  let aiAnalysis: AIAnalysis | null = null;
  if (job.aiProcessed === true && job.aiTags) {
    try {
      if (typeof job.aiTags === 'string') {
        aiAnalysis = JSON.parse(job.aiTags);
      } else if (typeof job.aiTags === 'object' && 'suitability_score' in job.aiTags) {
        aiAnalysis = job.aiTags as AIAnalysis;
      }
    } catch (e) {
      console.error('Failed to parse aiTags:', e);
    }
  }

  const getSuitabilityColor = (score: number) => {
    if (score >= 70) return "text-green-500";
    if (score >= 40) return "text-yellow-500";
    return "text-red-500";
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

          <div className="flex flex-wrap items-center gap-2 mb-3">
            {aiAnalysis && (
              <div 
                className={`flex items-center gap-1.5 text-sm font-semibold ${getSuitabilityColor(aiAnalysis.suitability_score)}`}
                data-testid={`ai-score-${job.id}`}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                <span>{aiAnalysis.suitability_score}%</span>
              </div>
            )}
            <Badge variant="secondary" data-testid={`text-company-${job.id}`}>
              {job.companyName}
            </Badge>
            <Badge variant="outline" data-testid={`text-location-${job.id}`}>
              {job.location}
            </Badge>
            <Badge variant="outline" data-testid={`text-jobtype-${job.id}`}>
              {job.jobType}
            </Badge>
            {aiAnalysis?.experience_detected?.years_text && (
              <Badge variant="outline">
                {aiAnalysis.experience_detected.years_text}
              </Badge>
            )}
            {aiAnalysis?.seniority_detected && aiAnalysis.seniority_detected.length > 0 && (
              <Badge variant="outline">
                {aiAnalysis.seniority_detected.join(", ")}
              </Badge>
            )}
            {aiAnalysis?.person_specific_recommendations && aiAnalysis.person_specific_recommendations.length > 0 && (
              <>
                {aiAnalysis.person_specific_recommendations.map((person, idx) => (
                  <Badge key={idx} variant="outline" className="bg-primary/10">
                    {person}
                  </Badge>
                ))}
              </>
            )}
          </div>

          {aiAnalysis && (
            <Collapsible 
              open={aiInsightsOpen} 
              onOpenChange={setAiInsightsOpen}
              className="mb-3"
            >
              <CollapsibleTrigger
                className="flex items-center justify-between w-full p-2 bg-muted/30 hover-elevate rounded-md transition-colors"
                onClick={(e) => e.stopPropagation()}
                data-testid={`ai-toggle-${job.id}`}
              >
                <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                  <span className="text-xs font-medium text-muted-foreground shrink-0">Job Insights:</span>
                  {aiAnalysis.matched_keywords && aiAnalysis.matched_keywords.map((keyword, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                  {aiAnalysis.apply_decision === "Apply" ? (
                    <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Apply
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Don't Apply
                    </Badge>
                  )}
                </div>
                {aiInsightsOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                )}
              </CollapsibleTrigger>

              <CollapsibleContent className="mt-2 p-3 bg-muted/50 rounded-md space-y-3" data-testid={`ai-insights-${job.id}`}>
                {aiAnalysis.matched_keywords && aiAnalysis.matched_keywords.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1.5">Matched Skills</div>
                    <div className="flex flex-wrap gap-1.5">
                      {aiAnalysis.matched_keywords.map((keyword, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {aiAnalysis.experience_detected?.years_text && (
                  <div className="text-xs">
                    <span className="font-medium">Experience: </span>
                    <span className="text-muted-foreground">{aiAnalysis.experience_detected.years_text}</span>
                  </div>
                )}

                {aiAnalysis.salary_detected?.salary_text && (
                  <div className="text-xs">
                    <span className="font-medium">Salary: </span>
                    <span className="text-muted-foreground">{aiAnalysis.salary_detected.salary_text}</span>
                  </div>
                )}

                {aiAnalysis.seniority_detected && aiAnalysis.seniority_detected.length > 0 && (
                  <div className="text-xs">
                    <span className="font-medium">Level: </span>
                    <span className="text-muted-foreground">{aiAnalysis.seniority_detected.join(", ")}</span>
                  </div>
                )}

                {aiAnalysis.red_flags && aiAnalysis.red_flags.length > 0 && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded p-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                      <div>
                        <div className="text-xs font-medium text-destructive mb-1">Red Flags</div>
                        <ul className="text-xs text-destructive/90 space-y-0.5 list-disc list-inside">
                          {aiAnalysis.red_flags.map((flag, idx) => {
                            const flagText = typeof flag === 'string' 
                              ? flag 
                              : (flag as any).phrase || (flag as any).flag || 'Unknown flag';
                            return <li key={idx}>{flagText}</li>;
                          })}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                <div className="text-xs">
                  <span className="font-medium">AI Rationale: </span>
                  <span className="text-muted-foreground">{aiAnalysis.rationale}</span>
                </div>

                {aiAnalysis.person_specific_recommendations && aiAnalysis.person_specific_recommendations.length > 0 && (
                  <div className="text-xs">
                    <span className="font-medium">Recommended for: </span>
                    <span className="text-muted-foreground">{aiAnalysis.person_specific_recommendations.join(", ")}</span>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-description-${job.id}`}>
            {job.jobDescription}
          </p>
        </div>
      </div>
    </Card>
  );
}
