import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { KeywordManager } from '@/components/keyword-manager';
import { FilterIcon, BriefcaseIcon, ArrowUpDownIcon } from 'lucide-react';

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
}: SidebarProps) {
  const handleCompanySort = () => {
    setCompanySort(companySort === 'none' ? 'asc' : 'none');
  };

  return (
    <aside className="w-64 border-r border-border/10 p-4 hidden md:block">
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <FilterIcon className="h-4 w-4" /> Filters
          </h3>
          <Separator className="my-2" />
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