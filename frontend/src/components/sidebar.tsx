import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { KeywordManager } from '@/components/keyword-manager';
import { FilterIcon, BriefcaseIcon, ArrowUpDownIcon, ClockIcon, RefreshCwIcon } from 'lucide-react';
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
  onHoursChange: (hours: number) => Promise<void>;
}

export function Sidebar({
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
  onHoursChange,
}: SidebarProps) {
  const [hours, setHours] = useState<number>(6);
  const [isScrapingData, setIsScrapingData] = useState(false);

  const handleCompanySort = () => {
    setCompanySort(companySort === 'none' ? 'asc' : 'none');
  };

  const handleHoursSubmit = async () => {
    await onHoursChange(hours);
  };

  const handleScrapeNewData = async () => {
    try {
      setIsScrapingData(true);
      const response = await api.scrapeNewData();
      if (response.success) {
        toast.success(response.message || 'Data scraping initiated successfully');
      }
    } catch (error) {
      toast.error('Failed to start data scraping', {
        description: error instanceof Error ? error.message : 'Please try again later'
      });
    } finally {
      setIsScrapingData(false);
    }
  };

  return (
    <aside className="w-64 border-r border-border/10 p-4 hidden md:block">
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <FilterIcon className="h-4 w-4" /> Filters
          </h3>
          <Separator className="my-2" />

          <Button
            variant="outline"
            className="w-full justify-start mb-4"
            onClick={handleScrapeNewData}
            disabled={isScrapingData}
          >
            <RefreshCwIcon className={`h-4 w-4 mr-2 ${isScrapingData ? 'animate-spin' : ''}`} />
            Fetch New Jobs
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
            <label className="text-sm font-medium">Application Method</label>
            <div className="grid grid-cols-1 gap-2">
              <Button
                variant={applicationMethod === 'all' ? "default" : "outline"}
                className="justify-start"
                onClick={() => setApplicationMethod('all')}
              >
                <BriefcaseIcon className="h-4 w-4 mr-2" />
                All Jobs
              </Button>
              <Button
                variant={applicationMethod === 'easyapply' ? "default" : "outline"}
                className="justify-start"
                onClick={() => setApplicationMethod('easyapply')}
              >
                <span className="mr-2">⚡️</span>
                EasyApply
              </Button>
              <Button
                variant={applicationMethod === 'manual' ? "default" : "outline"}
                className="justify-start"
                onClick={() => setApplicationMethod('manual')}
              >
                <span className="mr-2">📝</span>
                Manual Apply
              </Button>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            <label className="text-sm font-medium">Sort by Company</label>
            <Button
              variant={companySort === 'asc' ? "default" : "outline"}
              className="w-full justify-start"
              onClick={handleCompanySort}
            >
              <ArrowUpDownIcon className="h-4 w-4 mr-2" />
              {companySort === 'none' ? 'Sort Companies A-Z' : 'Get Default Sort'}
            </Button>
          </div>

          <KeywordManager
            noCompanyKeywords={noCompanyKeywords}
            searchListKeywords={searchListKeywords}
            onAddKeyword={addKeyword}
            onRemoveKeyword={removeKeyword}
            isLoading={keywordsLoading}
          />
          <Separator className="my-4" />
          <div className="space-y-2">
            <label className="text-sm font-medium">Bot Settings</label>
            <Button
              variant={useBot ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => setUseBot(!useBot)}
            >
              <span className={`mr-2 ${useBot ? 'text-accent' : ''}`}>🤖</span>
              Apply using EasyApply Bot
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}