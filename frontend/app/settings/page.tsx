'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "react-toastify";
import { ConnectionStatusIndicator } from "@/components/connection-status";
import { ConnectionStatus } from "@/lib/api";
import { getSettings, addToSettings, removeFromSettings } from "@/lib/api";

interface Keyword {
  id: number;
  name: string;
  type: 'NoCompany' | 'SearchList';
  created_at: string;
}

export default function SettingsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [newCompany, setNewCompany] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [isUsingSampleData, setIsUsingSampleData] = useState(false);

  useEffect(() => {
    fetchKeywords();
  }, []);

  const fetchKeywords = async () => {
    try {
      setConnectionStatus('connecting');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setConnectionStatus('fetching');
      const { data, isUsingSampleData: usingSample } = await getSettings();
      
      setKeywords(data);
      setConnectionStatus(usingSample ? 'error' : 'connected');
      setIsUsingSampleData(usingSample);
    } catch (error) {
      console.error('Error fetching keywords:', error);
      setConnectionStatus('error');
      setIsUsingSampleData(true);
    }
  };

  const addKeyword = async (name: string, type: 'NoCompany' | 'SearchList') => {
    if (!name.trim()) return;
    
    try {
      const result = await addToSettings(name.trim(), type);
      
      if (result.success) {
        await fetchKeywords(); // Refresh the list
        toast.success(`${type === 'NoCompany' ? 'Company' : 'Keyword'} added successfully`);
        
        // Clear the appropriate input
        if (type === 'NoCompany') {
          setNewCompany('');
        } else {
          setNewKeyword('');
        }
      } else {
        throw new Error('Failed to add keyword');
      }
    } catch (error) {
      console.error('Error adding keyword:', error);
      toast.error(`Failed to add ${type === 'NoCompany' ? 'company' : 'keyword'}`);
    }
  };

  const removeKeyword = async (id: number) => {
    try {
      const result = await removeFromSettings(id);
      
      if (result.success) {
        await fetchKeywords(); // Refresh the list
        toast.success('Item removed successfully');
      } else {
        throw new Error('Failed to remove keyword');
      }
    } catch (error) {
      console.error('Error removing keyword:', error);
      toast.error('Failed to remove item');
    }
  };

  const noNoCompanies = keywords.filter(k => k.type === 'NoCompany');
  const searchKeywords = keywords.filter(k => k.type === 'SearchList');

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <main className="container mx-auto px-4 py-4 max-w-3xl">
        <div className="flex items-center justify-end mb-8">
          <ConnectionStatusIndicator 
            status={connectionStatus}
            isUsingSampleData={isUsingSampleData}
          />
        </div>

        <div className="space-y-6">
          {/* No No Companies Section */}
          <Card className="bg-[#111111] border-purple-900/20">
            <CardHeader>
              <CardTitle className="text-blue-300">No No Companies</CardTitle>
              <CardDescription>Companies to exclude from job listings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Add company name..."
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  className="bg-[#0a0a0a] border-purple-900/20 text-gray-300 placeholder:text-gray-500"
                  onKeyDown={(e) => e.key === 'Enter' && addKeyword(newCompany, 'NoCompany')}
                />
                <Button
                  variant="outline"
                  className="shrink-0 text-purple-300 border-purple-500/20 hover:bg-purple-500/10"
                  onClick={() => addKeyword(newCompany, 'NoCompany')}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {noNoCompanies.map((company) => (
                  <Badge
                    key={company.id}
                    variant="outline"
                    className="bg-red-500/10 text-red-300 border-red-500/20 hover:bg-red-500/20 transition-colors group"
                  >
                    {company.name}
                    <button
                      className="ml-2 hover:text-red-200 focus:outline-none"
                      onClick={() => removeKeyword(company.id)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Ye Dhoond Section */}
          <Card className="bg-[#111111] border-purple-900/20">
            <CardHeader>
              <CardTitle className="text-blue-300">Ye Dhoond</CardTitle>
              <CardDescription>Keywords to search for in job listings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Add keyword..."
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  className="bg-[#0a0a0a] border-purple-900/20 text-gray-300 placeholder:text-gray-500"
                  onKeyDown={(e) => e.key === 'Enter' && addKeyword(newKeyword, 'SearchList')}
                />
                <Button
                  variant="outline"
                  className="shrink-0 text-purple-300 border-purple-500/20 hover:bg-purple-500/10"
                  onClick={() => addKeyword(newKeyword, 'SearchList')}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchKeywords.map((keyword) => (
                  <Badge
                    key={keyword.id}
                    variant="outline"
                    className="bg-blue-500/10 text-blue-300 border-blue-500/20 hover:bg-blue-500/20 transition-colors group"
                  >
                    {keyword.name}
                    <button
                      className="ml-2 hover:text-blue-200 focus:outline-none"
                      onClick={() => removeKeyword(keyword.id)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}