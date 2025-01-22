import { ThemeProvider } from '@/components/theme-provider';
import { Dashboard } from '@/components/dashboard';
import { Sidebar } from '@/components/sidebar';
import { useJobs } from '@/hooks/use-jobs';
import { useKeywords } from '@/hooks/use-keywords';
import { Toaster } from 'sonner';
import { LinkedinIcon } from 'lucide-react';
import { useState } from 'react';

type ApplicationMethod = 'all' | 'easyapply' | 'manual';
type CompanySort = 'none' | 'asc';

function App() {
  const { jobs, isLoading: jobsLoading, error: jobsError, updateJobStatus, acceptDenyCounts } = useJobs();
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
      if (companySort === 'none') return 0;
      const companyA = a.companyName.toLowerCase();
      const companyB = b.companyName.toLowerCase();
      return companyA.localeCompare(companyB);
    });

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b border-border/10 sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center justify-between h-14 px-4">
            <div className="flex items-center gap-2">
              <LinkedinIcon className="h-6 w-6 text-primary" />
              <h1 className="text-lg font-semibold">LinkedIn Saral Apply</h1>
            </div>
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
          />
        </div>
      </div>
      <Toaster />
    </ThemeProvider>
  );
}

export default App;