import { useState } from "react";
import { Clock, ExternalLink, Ban, TrendingUp, AlertCircle, DollarSign, Calendar, Award, Users } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import type { Job, AIAnalysis } from "@shared/schema";

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

  const formatSalary = (min: number | null, max: number | null, type: string) => {
    if (!min && !max) return null;
    const formatNum = (num: number) => new Intl.NumberFormat('en-US').format(num);
    if (min && max) return `$${formatNum(min)} - $${formatNum(max)} ${type}`;
    if (min) return `$${formatNum(min)}+ ${type}`;
    if (max) return `Up to $${formatNum(max)} ${type}`;
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl md:text-2xl pr-8" data-testid="text-modal-title">
            {job.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
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

          {aiAnalysis && (
            <div className="border rounded-lg p-4 bg-muted/30 space-y-4" data-testid="ai-analysis-full">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <div>
                    <h4 className="font-semibold">AI Suitability Analysis</h4>
                    <p className="text-sm text-muted-foreground">{aiAnalysis.label}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-3xl font-bold ${getSuitabilityColor(aiAnalysis.suitability_score)}`}>
                    {aiAnalysis.suitability_score}%
                  </div>
                  <Badge 
                    variant={aiAnalysis.apply_decision === "Apply" ? "default" : "destructive"}
                    className={aiAnalysis.apply_decision === "Apply" ? "bg-green-600 hover:bg-green-700" : ""}
                  >
                    {aiAnalysis.apply_decision}
                  </Badge>
                </div>
              </div>

              <Separator />

              <div className="grid md:grid-cols-2 gap-4">
                {aiAnalysis.experience_detected?.years_text && (
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-primary mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">Experience Required</div>
                      <div className="text-sm text-muted-foreground">
                        {aiAnalysis.experience_detected.years_text}
                        {aiAnalysis.experience_detected.parsed_min_years && 
                          ` (${aiAnalysis.experience_detected.parsed_min_years}+ years)`
                        }
                      </div>
                    </div>
                  </div>
                )}

                {aiAnalysis.salary_detected?.salary_text && (
                  <div className="flex items-start gap-2">
                    <DollarSign className="h-4 w-4 text-primary mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">Salary Range</div>
                      <div className="text-sm text-muted-foreground">
                        {formatSalary(
                          aiAnalysis.salary_detected.parsed_min_annual_usd,
                          aiAnalysis.salary_detected.parsed_max_annual_usd,
                          aiAnalysis.salary_detected.pay_type
                        ) || aiAnalysis.salary_detected.salary_text}
                      </div>
                    </div>
                  </div>
                )}

                {aiAnalysis.seniority_detected && aiAnalysis.seniority_detected.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Award className="h-4 w-4 text-primary mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">Seniority Level</div>
                      <div className="text-sm text-muted-foreground">
                        {aiAnalysis.seniority_detected.join(", ")}
                      </div>
                    </div>
                  </div>
                )}

                {aiAnalysis.person_specific_recommendations && aiAnalysis.person_specific_recommendations.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Users className="h-4 w-4 text-primary mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">Recommended For</div>
                      <div className="text-sm text-muted-foreground">
                        {aiAnalysis.person_specific_recommendations.join(", ")}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {aiAnalysis.matched_keywords && aiAnalysis.matched_keywords.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Matched Skills & Keywords</div>
                  <div className="flex flex-wrap gap-1.5">
                    {aiAnalysis.matched_keywords.map((keyword, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {aiAnalysis.red_flags && aiAnalysis.red_flags.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-destructive mb-1">Red Flags Detected</div>
                      <ul className="text-xs text-destructive/90 space-y-1 list-disc list-inside">
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

              <div className="bg-muted/50 rounded-md p-3">
                <div className="text-sm font-medium mb-1">AI Rationale</div>
                <p className="text-sm text-muted-foreground">{aiAnalysis.rationale}</p>
              </div>

              {aiAnalysis.recommended_resume && (
                <div className="text-sm">
                  <span className="font-medium">Recommended Resume: </span>
                  <span className="text-muted-foreground">{aiAnalysis.recommended_resume}</span>
                </div>
              )}
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
                onBlacklistCompany?.(job.companyName);
                onOpenChange(false);
              }}>Continue</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
