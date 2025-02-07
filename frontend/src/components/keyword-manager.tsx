import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { XIcon, PlusIcon } from 'lucide-react';

interface Keyword {
  id: number;
  name: string;
  type: string;
}

interface KeywordManagerProps {
  noCompanyKeywords: Keyword[];
  searchListKeywords: Keyword[];
  onAddKeyword: (name: string, type: string) => void;
  onRemoveKeyword: (id: number) => void;
  isLoading: boolean;
}

export function KeywordManager({
  noCompanyKeywords,
  searchListKeywords,
  onAddKeyword,
  onRemoveKeyword,
  isLoading,
}: KeywordManagerProps) {
  const [noCompanyInput, setNoCompanyInput] = useState('');
  const [searchListInput, setSearchListInput] = useState('');

  const handleAddNoCompany = () => {
    if (noCompanyInput.trim()) {
      onAddKeyword(noCompanyInput.trim(), 'NoCompany');
      setNoCompanyInput('');
    }
  };

  const handleAddSearchList = () => {
    if (searchListInput.trim()) {
      onAddKeyword(searchListInput.trim(), 'SearchList');
      setSearchListInput('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-medium mb-2">Search Keywords</h4>
        <div className="flex gap-2 mb-2">
          <Input
            placeholder="Add search keyword..."
            value={searchListInput}
            onChange={(e) => setSearchListInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddSearchList()}
            disabled={isLoading}
          />
          <Button
            size="icon"
            onClick={handleAddSearchList}
            disabled={isLoading || !searchListInput.trim()}
          >
            <PlusIcon className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {searchListKeywords.map((keyword) => (
            <Badge
              key={keyword.id}
              variant="secondary"
              className="gap-1 pr-1"
            >
              {keyword.name}
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 hover:bg-transparent"
                onClick={() => onRemoveKeyword(keyword.id)}
              >
                <XIcon className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="text-sm font-medium mb-2">Excluded Companies</h4>
        <div className="flex gap-2 mb-2">
          <Input
            placeholder="Add company to exclude..."
            value={noCompanyInput}
            onChange={(e) => setNoCompanyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddNoCompany()}
            disabled={isLoading}
          />
          <Button
            size="icon"
            onClick={handleAddNoCompany}
            disabled={isLoading || !noCompanyInput.trim()}
          >
            <PlusIcon className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {noCompanyKeywords.map((keyword) => (
            <Badge
              key={keyword.id}
              variant="secondary"
              className="gap-1 pr-1"
            >
              {keyword.name}
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 hover:bg-transparent"
                onClick={() => onRemoveKeyword(keyword.id)}
              >
                <XIcon className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}