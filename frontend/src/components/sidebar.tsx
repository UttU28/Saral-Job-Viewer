import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { KeywordManager } from '@/components/keyword-manager';
import { FilterIcon, BriefcaseIcon, ArrowUpDownIcon, ClockIcon, RefreshCwIcon, CodeIcon, AlertTriangleIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface SidebarProps {
  applicationMethod: 'all' | 'easyapply' | 'manual';
  setApplicationMethod: (method: 'all' | 'easyapply' | 'manual') => void;
  noCompanyKeywords: Array<{ id: number; name: string; type: string }>;
  searchListKeywords: Array<{ id: number; name: string; type: string }>;
  addKeyword: (name: string, type: string) => Promise<void>;
  removeKeyword: (id: number) => void;
  keywordsLoading: boolean;
  useBot: boolean;
  setUseBot: (value: boolean) => void;
  companySort: 'none' | 'asc';
  setCompanySort: (sort: 'none' | 'asc') => void;
  keywordSort: 'none' | 'positive' | 'negative';
  setKeywordSort: (sort: 'none' | 'positive' | 'negative') => void;
  onHoursChange: (hours: number) => Promise<void>;
  onClose?: () => void;
}

function SidebarContent({
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
  keywordSort,
  setKeywordSort,
  onHoursChange,
  onClose,
}: SidebarProps) {
  const [hours, setHours] = useState<number>(6);
  const [isScrapingData, setIsScrapingData] = useState(false);

  const handleCompanySort = () => {
    if (companySort === 'none') {
      setCompanySort('asc');
      setKeywordSort('none');
    } else {
      setCompanySort('none');
    }
    onClose?.();
  };

  const handleKeywordSort = (type: 'positive' | 'negative') => {
    if (keywordSort === type) {
      setKeywordSort('none');
    } else {
      setKeywordSort(type);
      setCompanySort('none');
    }
    onClose?.();
  };

  const handleHoursSubmit = async () => {
    await onHoursChange(hours);
    onClose?.();
  };

  const handleLinkedInScraping = async () => {
    try {
      setIsScrapingData(true);
      const response = await api.scrapeLinkedIn();
      if (response.success) {
        toast.success(response.message || 'Data scraping initiated successfully');
      }
    } catch (error) {
      toast.error('Failed to start data scraping', {
        description: error instanceof Error ? error.message : 'Please try again later'
      });
    } finally {
      setIsScrapingData(false);
      onClose?.();
    }
  };

  const handleDiceScraping = async () => {
    try {
      setIsScrapingData(true);
      const response = await api.scrapeDice();
      if (response.success) {
        toast.success(response.message || 'Data scraping initiated successfully');
      }
    } catch (error) {
      toast.error('Failed to start data scraping', {
        description: error instanceof Error ? error.message : 'Please try again later'
      });
    } finally {
      setIsScrapingData(false);
      onClose?.();
    }
  };

  const handleMethodChange = (method: 'all' | 'easyapply' | 'manual') => {
    setApplicationMethod(method);
    onClose?.();
  };

  const handleBotToggle = () => {
    setUseBot(!useBot);
    onClose?.();
  };

  return (
    <div className="h-full overflow-y-auto space-y-4 p-4">
      <div>
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <FilterIcon className="h-4 w-4" /> Filters
        </h3>
        <Separator className="my-2" />

        <Button
          variant="outline"
          className="w-full justify-start mb-4"
          onClick={handleLinkedInScraping}
          disabled={isScrapingData}
        >
          <RefreshCwIcon className={`h-4 w-4 mr-2 ${isScrapingData ? 'animate-spin' : ''}`} />
          Fetch LinkedIn Jobs
        </Button>

        <Button
          variant="outline"
          className="w-full justify-start mb-4"
          onClick={handleDiceScraping}
          disabled={isScrapingData}
        >
          <RefreshCwIcon className={`h-4 w-4 mr-2 ${isScrapingData ? 'animate-spin' : ''}`} />
          Fetch Dice Jobs
        </Button>
        
        <div className="space-y-2 mb-4">
          <label className="text-sm font-medium">Hours of Data</label>
          <div className="flex gap-2">
            <Input
              type="number"
              min="1"
              value={hours}
              onChange={(e) => setHours(parseInt(e.target.value) || 6)}
              className="w-24"
            />
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleHoursSubmit}
            >
              <ClockIcon className="h-4 w-4 mr-2" />
              Update
            </Button>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <label className="text-sm font-medium">Bot Settings</label>
          <Button
            variant={useBot ? "default" : "outline"}
            className="w-full justify-start"
            onClick={handleBotToggle}
          >
            <span className={`mr-2 ${useBot ? 'text-accent' : ''}`}>🤖</span>
            Apply using EasyApply Bot
          </Button>
        </div>

        <div className="space-y-2 mb-4">
          <label className="text-sm font-medium">Application Method</label>
          <div className="grid grid-cols-1 gap-2">
            <Button
              variant={applicationMethod === 'all' ? "default" : "outline"}
              className="justify-start"
              onClick={() => handleMethodChange('all')}
            >
              <BriefcaseIcon className="h-4 w-4 mr-2" />
              All Jobs
            </Button>
            <Button
              variant={applicationMethod === 'easyapply' ? "default" : "outline"}
              className="justify-start"
              onClick={() => handleMethodChange('easyapply')}
            >
              <span className="mr-2">⚡️</span>
              EasyApply
            </Button>
            <Button
              variant={applicationMethod === 'manual' ? "default" : "outline"}
              className="justify-start"
              onClick={() => handleMethodChange('manual')}
            >
              <span className="mr-2">📝</span>
              Manual Apply
            </Button>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <label className="text-sm font-medium">Sort Options</label>
          <div className="grid grid-cols-1 gap-2">
            <Button
              variant={companySort === 'asc' ? "default" : "outline"}
              className="justify-start"
              onClick={handleCompanySort}
            >
              <ArrowUpDownIcon className="h-4 w-4 mr-2" />
              {companySort === 'none' ? 'Sort Companies A-Z' : 'Reset Company Sort'}
            </Button>

            <Button
              variant={keywordSort === 'positive' ? "default" : "outline"}
              className="justify-start"
              onClick={() => handleKeywordSort('positive')}
            >
              <CodeIcon className="h-4 w-4 mr-2" />
              {keywordSort === 'positive' ? 'Reset Skills Sort' : 'Most Skills First'}
            </Button>

            <Button
              variant={keywordSort === 'negative' ? "default" : "outline"}
              className="justify-start"
              onClick={() => handleKeywordSort('negative')}
            >
              <AlertTriangleIcon className="h-4 w-4 mr-2" />
              {keywordSort === 'negative' ? 'Reset Restrictions Sort' : 'Most Restrictions First'}
            </Button>
          </div>
        </div>

        <KeywordManager
          noCompanyKeywords={noCompanyKeywords}
          searchListKeywords={searchListKeywords}
          onAddKeyword={addKeyword}
          onRemoveKeyword={removeKeyword}
          isLoading={keywordsLoading}
        />
      </div>
    </div>
  );
}

// Export Sidebar components
export const Sidebar = {
  Desktop: function DesktopSidebar(props: Omit<SidebarProps, 'onClose'>) {
    return (
      <aside className="w-64 border-r border-border/10 hidden lg:block">
        <SidebarContent {...props} />
      </aside>
    );
  },
  Content: SidebarContent
};