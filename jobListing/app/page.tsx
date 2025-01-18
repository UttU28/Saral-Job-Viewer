'use client';

import { ScrollArea } from "@/components/ui/scroll-area";
import { JobCard } from "@/components/job-card";
import { fetchJobs } from "@/lib/api";
import { Job } from "@/types/job";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Search, SlidersHorizontal, FlipHorizontal as SwipeHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TECH_KEYWORDS } from "@/lib/utils";

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUsingSampleData, setIsUsingSampleData] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

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
    let filtered = [...jobs];

    // Apply method filter
    if (methodFilter !== "all") {
      filtered = filtered.filter(job => job.method === methodFilter);
    }

    // Apply type filter
    if (typeFilter !== "all") {
      filtered = filtered.filter(job => job.jobType === typeFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const keywords = searchQuery.toLowerCase().split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      if (keywords.length > 0) {
        filtered = filtered.filter(job => {
          const searchText = `${job.title} ${job.jobDescription}`.toLowerCase();
          
          return keywords.every(keyword => {
            if (searchText.includes(keyword)) {
              return true;
            }

            return TECH_KEYWORDS.some(techKeyword => {
              const techKeywordLower = techKeyword.toLowerCase();
              if (techKeywordLower.includes(keyword) || keyword.includes(techKeywordLower)) {
                return searchText.includes(techKeywordLower);
              }
              return false;
            });
          });
        });
      }
    }

    setFilteredJobs(filtered);
  }, [jobs, methodFilter, typeFilter, searchQuery]);

  // Get unique methods and types for filters
  const methods = ["all", ...new Set(jobs.map(job => job.method))];
  const types = ["all", ...new Set(jobs.map(job => job.jobType))];

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <main className="container mx-auto px-4 py-4 max-w-5xl">
        <div className="flex flex-col space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Saral Viewer
            </h1>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className={`text-purple-300 border-purple-500/20 hover:bg-purple-500/10 ${showFilters ? 'bg-purple-500/10' : ''}`}
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
              <Link href="/swipe">
                <Button variant="outline" className="text-purple-300 border-purple-500/20 hover:bg-purple-500/10">
                  <SwipeHorizontal className="mr-2 h-4 w-4" />
                  Saral Swiper
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          <div className={`grid gap-4 transition-all duration-300 ease-in-out ${
            showFilters 
              ? 'grid-rows-[1fr] opacity-100' 
              : 'grid-rows-[0fr] opacity-0'
          }`}>
            <div className="overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Search keywords (comma-separated)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-[#111111] border-purple-900/20 text-gray-300 placeholder:text-gray-500"
                  />
                </div>
                <Select value={methodFilter} onValueChange={setMethodFilter}>
                  <SelectTrigger className="bg-[#111111] border-purple-900/20 text-gray-300">
                    <SelectValue placeholder="Filter by method" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111111] border-purple-900/20">
                    {methods.map((method) => (
                      <SelectItem 
                        key={method} 
                        value={method}
                        className="text-gray-300 focus:bg-purple-500/10 focus:text-gray-100"
                      >
                        {method === "all" ? "All Methods" : method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="bg-[#111111] border-purple-900/20 text-gray-300">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111111] border-purple-900/20">
                    {types.map((type) => (
                      <SelectItem 
                        key={type} 
                        value={type}
                        className="text-gray-300 focus:bg-purple-500/10 focus:text-gray-100"
                      >
                        {type === "all" ? "All Types" : type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
        
        <ScrollArea className="h-[calc(100vh-12rem)] mt-6">
          {loading ? (
            <div className="text-gray-400 text-center py-4">Loading jobs...</div>
          ) : filteredJobs.length > 0 ? (
            <>
              {isUsingSampleData && (
                <div className="text-yellow-400 text-xs mb-4 bg-yellow-400/10 border border-yellow-400/20 rounded-lg p-3">
                  ⚠️ API is unavailable. Showing sample data.
                </div>
              )}
              <div className="grid gap-4">
                {filteredJobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            </>
          ) : (
            <div className="text-gray-400 text-center py-4 bg-[#111111] rounded-lg p-4">
              No jobs match your filters
            </div>
          )}
        </ScrollArea>
      </main>
    </div>
  );
}