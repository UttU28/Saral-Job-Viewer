'use client';

import { useEffect, useState } from "react";
import { fetchJobs, applyJob, rejectJob } from "@/lib/api";
import { Job } from "@/types/job";
import { SwipeCard } from "@/components/swipe-card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function SwipePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isUsingSampleData, setIsUsingSampleData] = useState(false);
  const [swipeHistory, setSwipeHistory] = useState<Array<{ jobId: string; direction: 'left' | 'right' }>>([]);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(['EasyApply', 'Manual']));

  useEffect(() => {
    const getJobs = async () => {
      try {
        const data = await fetchJobs();
        setJobs(data);
        setFilteredJobs(data);
        setIsUsingSampleData(data.length === 2);
      } catch (error) {
        console.error('Error fetching jobs:', error);
      } finally {
        setLoading(false);
      }
    };

    getJobs();
  }, []);

  useEffect(() => {
    // Filter jobs based on active filters
    const filtered = jobs.filter(job => activeFilters.has(job.method));
    setFilteredJobs(filtered);
    setCurrentIndex(0); // Reset index when filters change
  }, [jobs, activeFilters]);

  const handleSwipe = async (direction: 'left' | 'right') => {
    if (currentIndex < filteredJobs.length) {
      const job = filteredJobs[currentIndex];
      
      try {
        if (direction === 'right') {
          const result = await applyJob(job.id, job.method, job.link);
          if (result) {
            toast.success('Application submitted successfully');
          }
        } else {
          const result = await rejectJob(job.id);
          if (result) {
            toast.success('Job marked as passed');
          }
        }

        setSwipeHistory(prev => [...prev, { jobId: job.id, direction }]);
        setCurrentIndex(prev => prev + 1);
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

  return (
    <div className="min-h-screen bg-[#0a0a0a] relative">
      <div className="container mx-auto px-4 py-4 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <Link 
            href="/"
            className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
          >
            ← Back to List View
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Saral Swiper
          </h1>
        </div>

        <div className="flex justify-center gap-3 mb-6">
          <Button
            variant="outline"
            className={`border-blue-500/20 transition-colors ${
              activeFilters.has('EasyApply')
                ? 'bg-blue-500/10 text-blue-300'
                : 'bg-transparent text-gray-500 hover:text-blue-300 hover:bg-blue-500/5'
            }`}
            onClick={() => toggleFilter('EasyApply')}
          >
            Easy Apply
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
            Manual Apply
          </Button>
        </div>

        {loading ? (
          <div className="text-gray-400 text-center py-4">Loading jobs...</div>
        ) : activeFilters.size === 0 ? (
          <div className="text-center py-12 px-4 rounded-lg bg-[#111111] border border-purple-900/20">
            <p className="text-2xl font-bold text-gray-400 mb-2">APPLY KAR LODA</p>
            <p className="text-sm text-gray-500">Select at least one application method to view jobs</p>
          </div>
        ) : filteredJobs.length > 0 && currentIndex < filteredJobs.length ? (
          <div className="space-y-6">
            {isUsingSampleData && (
              <div className="text-yellow-400 text-xs bg-yellow-400/10 border border-yellow-400/20 rounded-lg p-3">
                ⚠️ API is unavailable. Showing sample data.
              </div>
            )}
            
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
                <ArrowLeft className="mr-2 h-4 w-4" />
                Pass
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-24 bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20"
                onClick={() => handleSwipe('right')}
              >
                Apply
                <ArrowRight className="ml-2 h-4 w-4" />
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
      </div>
    </div>
  );
}