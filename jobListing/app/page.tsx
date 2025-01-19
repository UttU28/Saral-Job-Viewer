'use client';

import { ScrollArea } from "@/components/ui/scroll-area";
import { JobCard } from "@/components/job-card";
import { fetchJobs, ConnectionStatus } from "@/lib/api";
import { Job } from "@/types/job";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, Briefcase, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TECH_KEYWORDS } from "@/lib/utils";
import { ConnectionStatusIndicator } from "@/components/connection-status";
import { AnimatedStat } from "@/components/animated-stat";

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [appliedFilter, setAppliedFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [isUsingSampleData, setIsUsingSampleData] = useState(false);

  useEffect(() => {
    const getJobs = async () => {
      try {
        setConnectionStatus('connecting');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        setConnectionStatus('fetching');
        const { data, isUsingSampleData: usingSample } = await fetchJobs();
        
        setJobs(data);
        setFilteredJobs(data);
        setIsUsingSampleData(usingSample);
        setConnectionStatus(usingSample ? 'error' : 'connected');
      } catch (error) {
        console.error('Error fetching jobs:', error);
        setConnectionStatus('error');
        setIsUsingSampleData(true);
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

    // Apply applied status filter
    if (appliedFilter !== "all") {
      filtered = filtered.filter(job => {
        if (appliedFilter === "applied") {
          return job.applied === "YES" || job.applied === "1";
        } else if (appliedFilter === "not_applied") {
          return !job.applied || job.applied === "0" || job.applied === "NO";
        }
        return true;
      });
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
  }, [jobs, methodFilter, typeFilter, appliedFilter, searchQuery]);

  // Get unique methods and types for filters
  const methods = ["all", ...new Set(jobs.map(job => job.method))];
  const types = ["all", ...new Set(jobs.map(job => job.jobType))];

  // Calculate statistics
  const totalJobs = jobs.length;
  const appliedJobs = jobs.filter(job => job.applied === "YES" || job.applied === "1").length;
  const notAppliedJobs = jobs.filter(job => !job.applied || job.applied === "0" || job.applied === "NO").length;
  const pendingJobs = totalJobs - appliedJobs - notAppliedJobs;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <main className="container mx-auto px-4 py-4 max-w-5xl">
        <div className="flex flex-col space-y-4">
          {/* Connection Status */}
          <div className="flex justify-end">
            <ConnectionStatusIndicator 
              status={connectionStatus}
              isUsingSampleData={isUsingSampleData}
            />
          </div>

          {/* Stats Dashboard */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <AnimatedStat
              value={totalJobs}
              label="Total Jobs"
              icon={Briefcase}
              iconColor="text-blue-400"
              valueColor="text-gray-300"
            />
            <AnimatedStat
              value={appliedJobs}
              label="Applied"
              icon={CheckCircle2}
              iconColor="text-green-400"
              valueColor="text-green-400"
            />
            <AnimatedStat
              value={notAppliedJobs}
              label="Not Applied"
              icon={XCircle}
              iconColor="text-red-400"
              valueColor="text-red-400"
            />
            <AnimatedStat
              value={pendingJobs}
              label="Pending"
              icon={Clock}
              iconColor="text-yellow-400"
              valueColor="text-yellow-400"
            />
          </div>

          {/* Filters Section */}
          <div className="flex items-center justify-end">
            <Button
              variant="outline"
              size="icon"
              className={`text-purple-300 border-purple-500/20 hover:bg-purple-500/10 ${showFilters ? 'bg-purple-500/10' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>

          <div className={`grid gap-4 transition-all duration-300 ease-in-out ${
            showFilters 
              ? 'grid-rows-[1fr] opacity-100' 
              : 'grid-rows-[0fr] opacity-0'
          }`}>
            <div className="overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-2">
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
                <Select value={appliedFilter} onValueChange={setAppliedFilter}>
                  <SelectTrigger className="bg-[#111111] border-purple-900/20 text-gray-300">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111111] border-purple-900/20">
                    <SelectItem 
                      value="all"
                      className="text-gray-300 focus:bg-purple-500/10 focus:text-gray-100"
                    >
                      All Status
                    </SelectItem>
                    <SelectItem 
                      value="applied"
                      className="text-gray-300 focus:bg-purple-500/10 focus:text-gray-100"
                    >
                      Applied
                    </SelectItem>
                    <SelectItem 
                      value="not_applied"
                      className="text-gray-300 focus:bg-purple-500/10 focus:text-gray-100"
                    >
                      Not Applied
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6">
          {loading ? (
            <div className="text-gray-400 text-center py-4">Loading jobs...</div>
          ) : filteredJobs.length > 0 ? (
            <div className="grid gap-4">
              {filteredJobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          ) : (
            <div className="text-gray-400 text-center py-4 bg-[#111111] rounded-lg p-4">
              No jobs match your filters
            </div>
          )}
        </div>
      </main>
    </div>
  );
}