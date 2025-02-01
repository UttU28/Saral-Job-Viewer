import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface Keyword {
  id: number;
  name: string;
  type: string;
}

export function useDiceKeywords() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKeywords = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getKeywordsDice();
      setKeywords(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch keywords');
      console.error('Error fetching dice keywords:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addKeyword = useCallback(async (name: string, type: string) => {
    try {
      const response = await api.addKeywordDice({ name, type });
      // Add the new keyword to the local state immediately
      setKeywords(prev => [...prev, { 
        id: response.id, 
        name, 
        type 
      }]);
      toast.success('Dice keyword added successfully');
    } catch (error) {
      toast.error('Failed to add dice keyword', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    }
  }, []);

  const removeKeyword = useCallback(async (id: number) => {
    try {
      await api.removeKeywordDice({ id });
      // Remove the keyword from local state immediately
      setKeywords(prev => prev.filter(keyword => keyword.id !== id));
      toast.success('Dice keyword removed successfully');
    } catch (error) {
      toast.error('Failed to remove dice keyword', {
        description: error instanceof Error ? error.message : 'Please try again',
      });
    }
  }, []);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  const noCompanyKeywords = keywords.filter(k => k.type === 'NoCompany');
  const searchListKeywords = keywords.filter(k => k.type === 'SearchList');

  return {
    keywords,
    noCompanyKeywords,
    searchListKeywords,
    isLoading,
    error,
    addKeyword,
    removeKeyword,
  };
} 