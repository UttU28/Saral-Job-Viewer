'use client';

import { useEffect, useState } from "react";
import { Job } from "@/types/job";
import { JobCard } from "@/components/job-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Database, FlipHorizontal as SwipeHorizontal } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type ConnectionStatus = 'connecting' | 'fetching' | 'connected' | 'error';

export default function MySQLJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        setConnectionStatus('connecting');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const response = await fetch('/api/jobs');
        if (!response.ok) {
          throw new Error('Failed to fetch jobs');
        }
        
        setConnectionStatus('fetching');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const data = await response.json();
        if (data.error) {
          throw new Error(data.error);
        }
        
        setJobs(data);
        setConnectionStatus('connected');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch jobs from database');
        setConnectionStatus('error');
        console.error('Error fetching jobs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, []);

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connecting':
        return 'text-yellow-400 animate-pulse';
      case 'fetching':
        return 'text-blue-400 animate-pulse';
      case 'connected':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connecting':
        return 'Connecting to Database...';
      case 'fetching':
        return 'Fetching Data...';
      case 'connected':
        return 'Connected to Database';
      case 'error':
        return 'Database Connection Error';
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <main className="container mx-auto px-4 py-4 max-w-5xl">
        <div className="flex flex-col space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="outline" size="icon" className="text-gray-400 border-gray-800 hover:bg-gray-800/50">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                MySQL Jobs
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 ${getStatusColor()} transition-colors duration-300`}>
                <Database className={`h-5 w-5 ${connectionStatus === 'connecting' || connectionStatus === 'fetching' ? 'animate-spin' : ''}`} />
                <span className="text-sm font-medium">{getStatusText()}</span>
              </div>
              <Link href="/swipe">
                <Button variant="outline" className="text-purple-300 border-purple-500/20 hover:bg-purple-500/10">
                  <SwipeHorizontal className="mr-2 h-4 w-4" />
                  Swipe View
                </Button>
              </Link>
            </div>
          </div>
          
          <ScrollArea className="h-[calc(100vh-8rem)]">
            {loading ? (
              <div className="text-gray-400 text-center py-4">Loading jobs from database...</div>
            ) : error ? (
              <div className="text-red-400 text-center py-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                {error}
              </div>
            ) : jobs.length > 0 ? (
              <div className="grid gap-4">
                {jobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            ) : (
              <div className="text-gray-400 text-center py-4 bg-[#111111] rounded-lg p-4">
                No jobs found in database
              </div>
            )}
          </ScrollArea>
        </div>
      </main>
    </div>
  );
}