'use client';

import { ScrollArea } from "@/components/ui/scroll-area";
import { JobCard } from "@/components/job-card";
import { fetchJobs, ConnectionStatus, getSettings } from "@/lib/api";
import { Job } from "@/types/job";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, Briefcase, CheckCircle2, XCircle, Clock, EyeOff, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TECH_KEYWORDS } from "@/lib/utils";
import { ConnectionStatusIndicator } from "@/components/connection-status";
import { AnimatedStat } from "@/components/animated-stat";
import { Switch } from "@/components/ui/switch";

interface Keyword {
  id: number;
  name: string;
  type: 'NoCompany' | 'SearchList';
  created_at: string;
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [appliedFilter, setAppliedFilter] = useState<string>("all");
  const [showBlacklisted, setShowBlacklisted] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [isUsingSampleData, setIsUsingSampleData] = useState(false);
  const [easyApplyEnabled, setEasyApplyEnabled] = useState(false);
  const [noNoCompanies, setNoNoCompanies] = useState<string[]>([]);

  const loadKeywords = useCallback(async () => {
    try {
      const { data } = await getSettings();
      const noNoList = data
        .filter((kw: Keyword) => kw.type === 'NoCompany')
        .map((kw: Keyword) => kw.name.toLowerCase());
      setNoNoCompanies(noNoList);
    } catch (error) {
      console.error('Error loading keywords:', error);
    }
  }, []);

  useEffect(() => {
    const getJobs = async () => {
      try {
        setConnectionStatus('connecting');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await loadKeywords();
        
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
  }, [loadKeywords]);

  useEffect(() => {
    let filtered = [...jobs];

    if (methodFilter !== "all") {
      filtered = filtered.filter(job => job.method === methodFilter);
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter(job => job.jobType === typeFilter);
    }

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

  const handleJobUpdate = useCallback((updatedJob: Job) => {
    setJobs(prevJobs => 
      prevJobs.map(job => job.id === updatedJob.id ? updatedJob : job)
    );
  }, []);

  const handleBlacklistUpdate = useCallback(() => {
    loadKeywords();
  }, [loadKeywords]);

  // Calculate statistics using useMemo to avoid unnecessary recalculations
  const stats = useMemo(() => {
    const totalJobs = jobs.length;
    const appliedJobs = jobs.filter(job => 
      job.applied === "YES" || job.applied === "1"
    ).length;
    const notAppliedJobs = jobs.filter(job => 
      !job.applied || job.applied === "0" || job.applied === "NO"
    ).length;
    const pendingJobs = totalJobs - appliedJobs - notAppliedJobs;

    return {
      total: totalJobs,
      applied: appliedJobs,
      notApplied: notAppliedJobs,
      pending: pendingJobs
    };
  }, [jobs]); // Only recalculate when jobs array changes

  const methods = ["all", ...new Set(jobs.map(job => job.method))];
  const types = ["all", ...new Set(jobs.map(job => job.jobType))];

  const availableJobs = filteredJobs.filter(job => 
    !job.applied || job.applied === "0" || job.applied === "NO"
  );
  const processedJobs = filteredJobs.filter(job => 
    job.applied === "YES" || job.applied === "1" || job.applied === "NEVER"
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <main className="container mx-auto px-4 py-4 max-w-5xl">
        <div className="flex flex-col space-y-4">
          <div className="flex justify-end">
            <ConnectionStatusIndicator 
              status={connectionStatus}
              isUsingSampleData={isUsingSampleData}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <AnimatedStat
              value={stats.total}
              label="Total Jobs"
              icon={Briefcase}
              iconColor="text-blue-400"
              valueColor="text-gray-300"
            />
            <AnimatedStat
              value={stats.applied}
              label="Applied"
              icon={CheckCircle2}
              iconColor="text-green-400"
              valueColor="text-green-400"
            />
            <AnimatedStat
              value={stats.notApplied}
              label="Not Applied"
              icon={XCircle}
              iconColor="text-red-400"
              valueColor="text-red-400"
            />
            <AnimatedStat
              value={stats.pending}
              label="Pending"
              icon={Clock}
              iconColor="text-yellow-400"
              valueColor="text-yellow-400"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className={`text-purple-300 border-purple-500/20 hover:bg-purple-500/10 ${showFilters ? 'bg-purple-500/10' : ''}`}
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={showBlacklisted}
                    onCheckedChange={setShowBlacklisted}
                    className="data-[state=checked]:bg-red-500"
                  />
                  <span className="text-sm text-gray-400 flex items-center gap-2">
                    <EyeOff className="h-4 w-4" />
                    Show Blacklisted
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={easyApplyEnabled}
                    onCheckedChange={setEasyApplyEnabled}
                    className="data-[state=checked]:bg-green-500"
                  />
                  <span className="text-sm text-gray-400 flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Easy Apply
                  </span>
                </div>
              </div>
            </div>
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
        
        <div className="mt-6 space-y-8">
          {loading ? (
            <div className="text-gray-400 text-center py-4">Loading jobs...</div>
          ) : filteredJobs.length > 0 ? (
            <>
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-blue-300 border-b border-blue-900/20 pb-2">
                  Dekh le jo pasand aaye wo
                  <span className="text-sm font-normal text-gray-400 ml-2">
                    ({availableJobs.length} jobs)
                  </span>
                </h2>
                <div className="grid gap-4">
                  {availableJobs.map((job) => (
                    <JobCard 
                      key={job.id} 
                      job={job} 
                      showIfBlacklisted={showBlacklisted}
                      easyApplyEnabled={easyApplyEnabled}
                      onJobUpdate={handleJobUpdate}
                      noNoCompanies={noNoCompanies}
                      onBlacklistUpdate={handleBlacklistUpdate}
                    />
                  ))}
                </div>
                {availableJobs.length === 0 && (
                  <div className="text-gray-400 text-center py-4 bg-[#111111] rounded-lg p-4">
                    No available jobs match your filters
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-purple-300 border-b border-purple-900/20 pb-2">
                  Ye ho gaya ab
                  <span className="text-sm font-normal text-gray-400 ml-2">
                    ({processedJobs.length} jobs)
                  </span>
                </h2>
                <div className="grid gap-4">
                  {processedJobs.map((job) => (
                    <JobCard 
                      key={job.id} 
                      job={job} 
                      showIfBlacklisted={showBlacklisted}
                      easyApplyEnabled={easyApplyEnabled}
                      onJobUpdate={handleJobUpdate}
                      noNoCompanies={noNoCompanies}
                      onBlacklistUpdate={handleBlacklistUpdate}
                    />
                  ))}
                </div>
                {processedJobs.length === 0 && (
                  <div className="text-gray-400 text-center py-4 bg-[#111111] rounded-lg p-4">
                    No processed jobs match your filters
                  </div>
                )}
              </div>
            </>
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