import { Button } from '@/components/ui/button';
import { formatTimestamp, highlightKeywords, countKeywords, getMatchedKeywords, getNegativeKeywords } from '@/lib/utils';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  BuildingIcon,
  MapPinIcon,
  ClockIcon,
  ExternalLinkIcon,
  XIcon,
  CheckIcon,
  BanIcon,
  BriefcaseIcon,
  CodeIcon,
  AlertTriangleIcon,
} from 'lucide-react';
import { useRef } from 'react';

interface JobCardProps {
  id: string;
  link: string;
  title: string;
  companyName: string;
  location: string;
  method: string;
  timeStamp: string;
  jobType: string;
  jobDescription: string;
  applied: string;
  isBlacklisted: boolean;
  onUpdateStatus: (jobId: string, status: 'YES' | 'NEVER') => void;
  onAddKeyword?: (name: string, type: string) => Promise<void>;
  useBot?: boolean;
  source: 'linkedin' | 'dice';
}

export function JobCard({
  id,
  link,
  title,
  companyName,
  location,
  method,
  timeStamp,
  jobType,
  jobDescription,
  applied,
  isBlacklisted,
  onUpdateStatus,
  onAddKeyword,
  useBot = false,
  source,
}: JobCardProps) {
  const descriptionRef = useRef<HTMLDivElement>(null);
  const formattedTime = formatTimestamp(timeStamp);
  const isEasyApply = method.toLowerCase() === 'easyapply';
  const keywordCount = countKeywords(jobDescription);
  const matchedKeywords = getMatchedKeywords(jobDescription);
  const negativeKeywords = getNegativeKeywords(jobDescription);

  const scrollToKeyword = (keyword: string) => {
    if (descriptionRef.current) {
      const descriptionText = descriptionRef.current.textContent || '';
      const keywordIndex = descriptionText.toLowerCase().indexOf(keyword.toLowerCase());
      
      if (keywordIndex !== -1) {
        // Get all text nodes in the description
        const textNodes = Array.from(descriptionRef.current.querySelectorAll('span'));
        let currentLength = 0;
        let targetNode = null;
        
        // Find the text node containing our keyword
        for (const node of textNodes) {
          const nodeText = node.textContent || '';
          if (keywordIndex >= currentLength && keywordIndex < currentLength + nodeText.length) {
            targetNode = node;
            break;
          }
          currentLength += nodeText.length;
        }

        if (targetNode) {
          targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Add a temporary highlight effect
          targetNode.style.transition = 'background-color 0.3s ease';
          targetNode.style.backgroundColor = 'rgba(147, 51, 234, 0.3)'; // Tailwind purple-500 with lower opacity
          setTimeout(() => {
            targetNode.style.backgroundColor = '';
          }, 1500);
        }
      }
    }
  };

  const handleApply = async () => {
    try {
      // Only open in new tab if not using bot or not EasyApply
      if (!useBot || !isEasyApply) {
        window.open(link, '_blank');
      }

      if (source === 'dice') {
        await api.applyJobDice({
          jobID: id,
          applyMethod: method,
          link: link,
          useBot: useBot,
        });
      } else {
        await api.applyJob({
          jobID: id,
          applyMethod: method,
          link: link,
          useBot: useBot,
        });
      }

      toast.success('Successfully applied for the job!', {
        description: `Application submitted for ${title}`,
      });

      // Update local state
      onUpdateStatus(id, 'YES');
    } catch (error) {
      toast.error('Failed to apply for job', {
        description: error instanceof Error ? error.message : 'Please try again later',
      });
      console.error('Error applying for job:', error);
    }
  };

  const handleReject = async () => {
    try {
      if (source === 'dice') {
        await api.rejectJobDice({ jobID: id });
      } else {
        await api.rejectJob({ jobID: id });
      }

      toast.success('Job rejected', {
        description: `You won't see this job in your active listings anymore`,
      });

      // Update local state
      onUpdateStatus(id, 'NEVER');
    } catch (error) {
      toast.error('Failed to reject job', {
        description: error instanceof Error ? error.message : 'Please try again later',
      });
      console.error('Error rejecting job:', error);
    }
  };

  const handleBlacklistCompany = async () => {
    try {
      if (onAddKeyword) {
        // Add company to NoCompany keywords and update UI immediately
        await onAddKeyword(companyName, 'NoCompany');
      }

      // Reject this job
      if (source === 'dice') {
        await api.rejectJobDice({ jobID: id });
      } else {
        await api.rejectJob({ jobID: id });
      }

      toast.success('Company blacklisted', {
        description: `${companyName} has been added to excluded companies`,
      });

      // Update local state
      onUpdateStatus(id, 'NEVER');
    } catch (error) {
      toast.error('Failed to blacklist company', {
        description: error instanceof Error ? error.message : 'Please try again later',
      });
      console.error('Error blacklisting company:', error);
    }
  };

  return (
    <div className="bg-black/40 border border-border/20 rounded-lg p-6 hover:bg-black/50 transition-colors backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">
            {title.split('\n')[0]}
          </h3>
          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            <div className="flex items-center gap-1">
              <BuildingIcon className="h-4 w-4 text-accent/70" />
              <span>{companyName}</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPinIcon className="h-4 w-4 text-accent/70" />
              <span>{location}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 bg-primary/10 text-primary rounded-full text-xs border border-primary/20 flex items-center gap-1">
                <BriefcaseIcon className="h-3 w-3" />
                {jobType}
              </span>
              <span className="px-2 py-1 bg-accent/10 text-accent rounded-full text-xs border border-accent/20">
                {method}
              </span>
              <span className="px-2 py-1 bg-purple-500/10 text-purple-400 rounded-full text-xs border border-purple-500/20 flex items-center gap-1">
                <CodeIcon className="h-3 w-3" />
                <span className="font-bold">{keywordCount}</span> keywords
              </span>
              <span className="px-2 py-1 bg-gray-500/10 text-gray-400 rounded-full text-xs border border-gray-500/20 flex items-center gap-1">
                <ClockIcon className="h-3 w-3" />
                {formattedTime}
              </span>
              {negativeKeywords.length > 0 && (
                <span className="px-2 py-1 bg-red-500/10 text-red-400 rounded-full text-xs border border-red-500/20 flex items-center gap-1">
                  <AlertTriangleIcon className="h-3 w-3" />
                  <span className="font-bold">{negativeKeywords.length}</span> restrictions
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {applied === 'NO' ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1 sm:flex-none"
                onClick={handleReject}
              >
                <XIcon className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button
                variant="default"
                size="sm"
                className="flex-1 sm:flex-none bg-accent hover:bg-accent/90"
                onClick={handleApply}
              >
                <CheckIcon className="h-4 w-4 mr-2" />
                Apply
              </Button>
            </>
          ) : applied === 'YES' ? (
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 sm:flex-none bg-accent/20 hover:bg-accent/20 text-accent-foreground border-accent/30"
              disabled
            >
              <CheckIcon className="h-4 w-4 mr-2" />
              Applied
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 sm:flex-none bg-destructive/20 hover:bg-destructive/20 text-destructive-foreground border-destructive/30"
              disabled
            >
              <XIcon className="h-4 w-4 mr-2" />
              Rejected
            </Button>
          )}
        </div>
      </div>
      
      <div ref={descriptionRef} className="bg-black/60 border border-border/10 rounded-lg p-4 max-h-48 overflow-y-auto scrollbar">
        <p className="text-sm text-foreground/90 whitespace-pre-wrap">
          {highlightKeywords(jobDescription)}
        </p>
      </div>
      
      <div className="mt-4 flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {matchedKeywords.map((keyword, index) => (
            <button
              key={index}
              onClick={() => scrollToKeyword(keyword)}
              className="px-2 py-1 bg-purple-500/10 text-purple-400 rounded-full text-xs border border-purple-500/20 hover:bg-purple-500/20 transition-colors cursor-pointer"
            >
              {keyword}
            </button>
          ))}
          {negativeKeywords.map((keyword, index) => (
            <button
              key={`negative-${index}`}
              onClick={() => scrollToKeyword(keyword)}
              className="px-2 py-1 bg-red-500/10 text-red-400 rounded-full text-xs border border-red-500/20 hover:bg-red-500/20 transition-colors cursor-pointer"
            >
              {keyword}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            asChild
          >
            <a href={link} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon className="h-3 w-3 mr-2" />
              View
            </a>
          </Button>
          {applied === 'NO' && !isBlacklisted && (
            <Button
              variant="destructive"
              size="sm"
              className="h-7"
              onClick={handleBlacklistCompany}
            >
              <BanIcon className="h-3 w-3 mr-2" />
              Blacklist Company
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}