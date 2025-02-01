import { Dashboard } from '@/components/dashboard';
import { Sidebar } from '@/components/sidebar';
import { useJobs } from '@/hooks/use-jobs';
import { useKeywords } from '@/hooks/use-keywords';
import { DicesIcon, ExternalLinkIcon } from 'lucide-react';
import { useState } from 'react';
import { getMatchedKeywords, getNegativeKeywords } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useDiceJobs } from '@/hooks/use-dice-jobs';
import { useDiceKeywords } from '@/hooks/use-dice-keywords';

export function DiceJobs() {
  const navigate = useNavigate();
  const { jobs, isLoading: jobsLoading, error: jobsError, updateJobStatus, acceptDenyCounts, fetchJobs } = useDiceJobs();
  const {
    noCompanyKeywords,
    searchListKeywords,
    isLoading: keywordsLoading,
    addKeyword,
    removeKeyword,
  } = useDiceKeywords();
  const [searchQuery, setSearchQuery] = useState('');
  const [useBot, setUseBot] = useState(false);
  const [applicationMethod, setApplicationMethod] = useState<'all' | 'easyapply' | 'manual'>('all');
  const [companySort, setCompanySort] = useState<'none' | 'asc'>('none');
  const [keywordSort, setKeywordSort] = useState<'none' | 'positive' | 'negative'>('none');

  const isCompanyBlacklisted = (companyName: string) => {
    return noCompanyKeywords.some(keyword => 
      companyName.toLowerCase().includes(keyword.name.toLowerCase())
    );
  };

  const filteredJobs = jobs.filter(job => !isCompanyBlacklisted(job.companyName));
  const totalJobs = filteredJobs.length;
  const appliedJobs = filteredJobs.filter(job => job.applied === 'YES').length;
  const rejectedJobs = filteredJobs.filter(job => job.applied === 'NEVER').length;
  const pendingJobs = filteredJobs.filter(job => job.applied === 'NO').length;

  const displayedJobs = filteredJobs
    .filter(job => {
      const matchesSearch = !searchQuery || 
        job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.jobDescription.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesMethod = 
        applicationMethod === 'all' ||
        (applicationMethod === 'easyapply' && job.method.toLowerCase() === 'easyapply') ||
        (applicationMethod === 'manual' && job.method.toLowerCase() === 'manual');

      return matchesSearch && matchesMethod;
    })
    .sort((a, b) => {
      if (a.applied === 'NO' && b.applied !== 'NO') return -1;
      if (a.applied !== 'NO' && b.applied === 'NO') return 1;

      if (a.applied !== 'NO' && b.applied !== 'NO') {
        const timestampA = parseFloat(a.timeStamp);
        const timestampB = parseFloat(b.timeStamp);
        return timestampB - timestampA;
      }

      if (keywordSort !== 'none' && a.applied === 'NO' && b.applied === 'NO') {
        if (keywordSort === 'positive') {
          const keywordsA = getMatchedKeywords(a.jobDescription).length;
          const keywordsB = getMatchedKeywords(b.jobDescription).length;
          return keywordsB - keywordsA;
        } else if (keywordSort === 'negative') {
          const negativeA = getNegativeKeywords(a.jobDescription).length;
          const negativeB = getNegativeKeywords(b.jobDescription).length;
          return negativeB - negativeA;
        }
      }

      if (companySort === 'asc' && a.applied === 'NO' && b.applied === 'NO') {
        return a.companyName.toLowerCase().localeCompare(b.companyName.toLowerCase());
      }

      const timestampA = parseFloat(a.timeStamp);
      const timestampB = parseFloat(b.timeStamp);
      return timestampB - timestampA;
    });

  const handleHoursChange = async (hours: number) => {
    await fetchJobs(hours);
  };

  const sidebarProps = {
    applicationMethod,
    setApplicationMethod,
    noCompanyKeywords,
    searchListKeywords,
    addKeyword,
    removeKeyword,
    keywordsLoading,
    useBot,
    setUseBot,
    companySort,
    setCompanySort,
    onHoursChange: handleHoursChange,
    keywordSort,
    setKeywordSort,
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/10 sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-4">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                >
                  <DicesIcon className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                <Sidebar.Content {...sidebarProps} onClose={() => document.querySelector('button[aria-label="Close"]')?.click()} />
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-2">
              <DicesIcon className="h-6 w-6 text-primary" />
              <h1 className="text-lg font-semibold">Dice Jobs</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => navigate('/config')}
            >
              <DicesIcon className="h-4 w-4" />
              Apply Config
              <ExternalLinkIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => navigate('/')}
            >
              Go to Home
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        <Sidebar.Desktop {...sidebarProps} />
        <Dashboard
          jobs={displayedJobs}
          isLoading={jobsLoading}
          error={jobsError}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          totalJobs={totalJobs}
          appliedJobs={appliedJobs}
          rejectedJobs={rejectedJobs}
          pendingJobs={pendingJobs}
          acceptDenyCounts={acceptDenyCounts}
          updateJobStatus={updateJobStatus}
          addKeyword={addKeyword}
          isCompanyBlacklisted={isCompanyBlacklisted}
          useBot={useBot}
          onHoursChange={handleHoursChange}
        />
      </div>
    </div>
  );
}