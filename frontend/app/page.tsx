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

interface JobSectionProps {
  title: string;
  jobs: Job[];
  jobsCount: number;
  textColor: string;
  borderColor: string;
  showIfBlacklisted: boolean;
  easyApplyEnabled: boolean;
  handleJobUpdate: (job: Job) => void;
  noNoCompanies: string[];
  onBlacklistUpdate: () => void;
  noMatchMessage: string;
}

const JobSection: React.FC<JobSectionProps> = ({
  title,
  jobs,
  jobsCount,
  textColor,
  borderColor,
  showIfBlacklisted,
  easyApplyEnabled,
  handleJobUpdate,
  noNoCompanies,
  onBlacklistUpdate,
  noMatchMessage,
}) => (
  <div className="space-y-4">
    <h2 className={`text-xl font-semibold ${textColor} border-b ${borderColor} pb-2`}>
      {title}
      <span className="text-sm font-normal text-gray-400 ml-2">({jobsCount} jobs)</span>
    </h2>
    <div className="grid gap-4">
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          showIfBlacklisted={showIfBlacklisted}
          easyApplyEnabled={easyApplyEnabled}
          onJobUpdate={handleJobUpdate}
          noNoCompanies={noNoCompanies}
          onBlacklistUpdate={onBlacklistUpdate}
        />
      ))}
      {jobs.length === 0 && (
        <div className="text-gray-400 text-center py-4 bg-[#111111] rounded-lg p-4">
          {noMatchMessage}
        </div>
      )}
    </div>
  </div>
);

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
      const keywords = searchQuery.toLowerCase().split(',').map(k => k.trim()).filter(k => k.length > 0);
      if (keywords.length > 0) {
        filtered = filtered.filter(job => {
          const searchText = `${job.title} ${job.jobDescription}`.toLowerCase();
          return keywords.every(keyword => {
            if (searchText.includes(keyword)) return true;
            return TECH_KEYWORDS.some(techKeyword => searchText.includes(techKeyword.toLowerCase()));
          });
        });
      }
    }

    setFilteredJobs(filtered);
  }, [jobs, methodFilter, typeFilter, appliedFilter, searchQuery]);

  const stats = useMemo(() => {
    const totalJobs = jobs.length;
    const appliedJobs = jobs.filter(job => job.applied === "YES" || job.applied === "1").length;
    const notAppliedJobs = jobs.filter(job => !job.applied || job.applied === "0" || job.applied === "NO").length;
    const pendingJobs = totalJobs - appliedJobs - notAppliedJobs;

    return { total: totalJobs, applied: appliedJobs, notApplied: notAppliedJobs, pending: pendingJobs };
  }, [jobs]);

  const methods = ["all", ...new Set(jobs.map(job => job.method))];
  const types = ["all", ...new Set(jobs.map(job => job.jobType))];

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <main className="container mx-auto px-4 py-4 max-w-5xl">
        <ConnectionStatusIndicator status={connectionStatus} isUsingSampleData={isUsingSampleData} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <AnimatedStat value={stats.total} label="Total Jobs" icon={Briefcase} iconColor="text-blue-400" />
          <AnimatedStat value={stats.applied} label="Applied" icon={CheckCircle2} iconColor="text-green-400" />
          <AnimatedStat value={stats.notApplied} label="Not Applied" icon={XCircle} iconColor="text-red-400" />
          <AnimatedStat value={stats.pending} label="Pending" icon={Clock} iconColor="text-yellow-400" />
        </div>
        <JobSection
          title="Available Jobs"
          jobs={filteredJobs.filter(job => !job.applied || job.applied === "0" || job.applied === "NO")}
          jobsCount={filteredJobs.length}
          textColor="text-blue-300"
          borderColor="border-blue-900/20"
          noNoCompanies={noNoCompanies}
          showIfBlacklisted={showBlacklisted}
          onBlacklistUpdate={loadKeywords}
          easyApplyEnabled={easyApplyEnabled}
          handleJobUpdate={() => {}}
          noMatchMessage="No matching jobs!"
        />
      </main>
    </div>
  );
}
