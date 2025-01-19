'use client';

import { useEffect, useState } from "react";
import { Job } from "@/types/job";
import { SwipeCard } from "@/components/swipe-card";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { toast } from "react-toastify";
import { ConnectionStatusIndicator } from "@/components/connection-status";
import { ConnectionStatus } from "@/lib/api";
import { Progress } from "@/components/ui/progress";
import { fetchJobs, applyJob, rejectJob, getSettings } from "@/lib/api";

interface Keyword {
  id: number;
  name: string;
  type: 'NoCompany' | 'SearchList';
  created_at: string;
}

export default function SwipePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [swipeHistory, setSwipeHistory] = useState<Array<{ jobId: string; direction: 'left' | 'right' }>>([]);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(['EasyApply', 'Manual']));
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [isUsingSampleData, setIsUsingSampleData] = useState(false);
  const [noNoCompanies, setNoNoCompanies] = useState<string[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setConnectionStatus('connecting');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // First fetch the keywords to get the No No companies list
        setConnectionStatus('fetching');
        const { data: keywordsData } = await getSettings();
        const noNoList = keywordsData
          .filter((kw: Keyword) => kw.type === 'NoCompany')
          .map((kw: Keyword) => kw.name.toLowerCase());
        setNoNoCompanies(noNoList);

        // Then fetch the jobs
        const { data: jobsData, isUsingSampleData: usingSample } = await fetchJobs();
        
        // Filter out jobs where applied is not 0 or "NO" and from No No companies
        const unappliedJobs = jobsData.filter(job => {
          const isUnapplied = job.applied === 0 || job.applied === "0" || job.applied === "NO" || !job.applied;
          const isNotNoNoCompany = !noNoList.includes(job.companyName.toLowerCase());
          return isUnapplied && isNotNoNoCompany;
        });
        
        setJobs(unappliedJobs);
        setFilteredJobs(unappliedJobs.filter(job => activeFilters.has(job.method)));
        setIsUsingSampleData(usingSample);
        setConnectionStatus(usingSample ? 'error' : 'connected');
      } catch (error) {
        console.error('Error loading data:', error);
        setConnectionStatus('error');
        setIsUsingSampleData(true);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    // Filter jobs based on active filters and No No companies
    const filtered = jobs.filter(job => {
      const matchesFilter = activeFilters.has(job.method);
      const isNotNoNoCompany = !noNoCompanies.includes(job.companyName.toLowerCase());
      return matchesFilter && isNotNoNoCompany;
    });
    setFilteredJobs(filtered);
    setCurrentIndex(0); // Reset index when filters change
  }, [jobs, activeFilters, noNoCompanies]);

  const handleSwipe = async (direction: 'left' | 'right') => {
    if (currentIndex < filteredJobs.length) {
      const job = filteredJobs[currentIndex];
      
      try {
        let result;
        if (isUsingSampleData) {
          // Simulate success for sample data
          result = { success: true };
        } else {
          result = await (direction === 'right' 
            ? applyJob(job.id, job.method, job.link)
            : rejectJob(job.id));
        }

        if (result?.success) {
          setSwipeHistory(prev => [...prev, { jobId: job.id, direction }]);
          setCurrentIndex(prev => prev + 1);
        } else {
          throw new Error('Failed to process action');
        }
      } catch (error) {
        console.error('Error processing swipe:', error);
        toast.error('Failed to process your action. Please try again.');
      }
    }
  };

  const toggleFilter = (method: string) => {
    setActiveFilters(prev => {
      const newFilters = new Set(prev);
      if (newFilters.has(method)) {
        newFilters.delete(method);
      } else {
        newFilters.add(method);
      }
      return newFilters;
    });
  };

  const currentJob = filteredJobs[currentIndex];
  const progress = filteredJobs.length > 0 ? (currentIndex / filteredJobs.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <main className="container mx-auto px-4 py-4 max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className={`border-blue-500/20 transition-colors ${
                activeFilters.has('EasyApply')
                  ? 'bg-blue-500/10 text-blue-300'
                  : 'bg-transparent text-gray-500 hover:text-blue-300 hover:bg-blue-500/5'
              }`}
              onClick={() => toggleFilter('EasyApply')}
            >
              EG Aply
            </Button>
            <Button
              variant="outline"
              className={`border-purple-500/20 transition-colors ${
                activeFilters.has('Manual')
                  ? 'bg-purple-500/10 text-purple-300'
                  : 'bg-transparent text-gray-500 hover:text-purple-300 hover:bg-purple-500/5'
              }`}
              onClick={() => toggleFilter('Manual')}
            >
              Manual
            </Button>
          </div>
          <ConnectionStatusIndicator 
            status={connectionStatus}
            isUsingSampleData={isUsingSampleData}
          />
        </div>

        {/* Progress bar */}
        <div className="relative mb-6">
          <Progress 
            value={progress} 
            className="h-1 bg-purple-950/20" 
            indicatorClassName="bg-gradient-to-r from-blue-400 to-purple-400"
          />
          {filteredJobs.length > 0 && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-gray-400">
              {currentIndex} / {filteredJobs.length} jobs
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-gray-400 text-center py-4">Loading jobs...</div>
        ) : activeFilters.size === 0 ? (
          <div className="text-center py-12 px-4 rounded-lg bg-[#111111] border border-purple-900/20">
            <p className="text-2xl font-bold text-gray-400 mb-2">Select Application Method</p>
            <p className="text-sm text-gray-500">Select at least one application method to view jobs</p>
          </div>
        ) : filteredJobs.length > 0 && currentIndex < filteredJobs.length ? (
          <div className="space-y-6">
            <div className="relative h-[600px] mx-auto">
              <SwipeCard job={currentJob} onSwipe={handleSwipe} />
            </div>

            <div className="flex justify-center gap-4">
              <Button
                size="lg"
                variant="outline"
                className="w-24 bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                onClick={() => handleSwipe('left')}
              >
                <X className="mr-2 h-4 w-4" />
                Pass
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-24 bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20"
                onClick={() => handleSwipe('right')}
              >
                <Check className="mr-2 h-4 w-4" />
                Apply
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <p className="text-gray-400">No more jobs to review!</p>
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Swipe History:</p>
              {swipeHistory.map((item, index) => (
                <div key={index} className="text-xs text-gray-400">
                  Job {item.jobId}: Swiped {item.direction}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}