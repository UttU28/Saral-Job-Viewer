import { ThemeProvider } from '@/components/theme-provider';
import { Dashboard } from '@/components/dashboard';
import { Sidebar } from '@/components/sidebar';
import { useJobs } from '@/hooks/use-jobs';
import { useKeywords } from '@/hooks/use-keywords';
import { Toaster } from 'sonner';
import { LinkedinIcon, ExternalLinkIcon } from 'lucide-react';
import { useState } from 'react';
import { getMatchedKeywords, getNegativeKeywords } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { LinkedIn } from '@/pages/LinkedIn';

function MainApp() {
  const navigate = useNavigate();
  const { jobs, isLoading: jobsLoading, error: jobsError, updateJobStatus, acceptDenyCounts, fetchJobs } = useJobs();
  const {
    noCompanyKeywords,
    searchListKeywords,
    isLoading: keywordsLoading,
    addKeyword,
    removeKeyword,
  } = useKeywords();
  const [searchQuery, setSearchQuery] = useState('');
  const [useBot, setUseBot] = useState(false);
  const [applicationMethod, setApplicationMethod] = useState<ApplicationMethod>('all');
  const [companySort, setCompanySort] = useState<CompanySort>('none');
  const [keywordSort, setKeywordSort] = useState<KeywordSort>('none');

  // Define isCompanyBlacklisted function first
  const isCompanyBlacklisted = (companyName: string) => {
    return noCompanyKeywords.some(keyword => 
      companyName.toLowerCase().includes(keyword.name.toLowerCase())
    );
  };

  // Calculate stats for non-blacklisted jobs only
  const filteredJobs = jobs.filter(job => !isCompanyBlacklisted(job.companyName));
  const totalJobs = filteredJobs.length;
  const appliedJobs = filteredJobs.filter(job => job.applied === 'YES').length;
  const rejectedJobs = filteredJobs.filter(job => job.applied === 'NEVER').length;
  const pendingJobs = filteredJobs.filter(job => job.applied === 'NO').length;

  // Filter and sort jobs based on all criteria
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
      // First, sort by applied status (NO first, others last)
      if (a.applied === 'NO' && b.applied !== 'NO') return -1;
      if (a.applied !== 'NO' && b.applied === 'NO') return 1;

      // If both are applied/rejected, sort by timestamp
      if (a.applied !== 'NO' && b.applied !== 'NO') {
        const timestampA = parseFloat(a.timeStamp);
        const timestampB = parseFloat(b.timeStamp);
        return timestampB - timestampA;
      }

      // If keyword sort is active and both are active (NO)
      if (keywordSort !== 'none' && a.applied === 'NO' && b.applied === 'NO') {
        if (keywordSort === 'positive') {
          const keywordsA = getMatchedKeywords(a.jobDescription).length;
          const keywordsB = getMatchedKeywords(b.jobDescription).length;
          return keywordsB - keywordsA; // Most keywords first
        } else if (keywordSort === 'negative') {
          const negativeA = getNegativeKeywords(a.jobDescription).length;
          const negativeB = getNegativeKeywords(b.jobDescription).length;
          return negativeB - negativeA; // Most restrictions first
        }
      }

      // If both are active (NO) and company sort is enabled
      if (companySort === 'asc' && a.applied === 'NO' && b.applied === 'NO') {
        return a.companyName.toLowerCase().localeCompare(b.companyName.toLowerCase());
      }

      // Default to timestamp sort for remaining cases
      const timestampA = parseFloat(a.timeStamp);
      const timestampB = parseFloat(b.timeStamp);
      return timestampB - timestampA;
    });

  const handleHoursChange = async (hours: number) => {
    await fetchJobs(hours);
  };

  const handleRetry = () => {
    fetchJobs();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/10 sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2">
            <LinkedinIcon className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-semibold">Saral Job Apply</h1>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => navigate('/linkedin')}
          >
            <LinkedinIcon className="h-4 w-4" />
            LinkedIn Saral Apply
            <ExternalLinkIcon className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex">
        <Sidebar
          applicationMethod={applicationMethod}
          setApplicationMethod={setApplicationMethod}
          noCompanyKeywords={noCompanyKeywords}
          searchListKeywords={searchListKeywords}
          addKeyword={addKeyword}
          removeKeyword={removeKeyword}
          keywordsLoading={keywordsLoading}
          useBot={useBot}
          setUseBot={setUseBot}
          companySort={companySort}
          setCompanySort={setCompanySort}
          onHoursChange={handleHoursChange}
          keywordSort={keywordSort}
          setKeywordSort={setKeywordSort}
        />
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
          onRetry={handleRetry}
          onHoursChange={handleHoursChange}
        />
      </div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainApp />} />
          <Route path="/linkedin" element={<LinkedIn />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  );
}

export default App;