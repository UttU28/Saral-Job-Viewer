import { useState, useEffect, useCallback } from 'react';
import type { Job } from '@/data/sample-jobs';
import { api } from '@/lib/api';
import { toast } from 'sonner';

function sortDiceJobs(jobs: Job[]): Job[] {
  return [...jobs].sort((a, b) => {
    // First, sort by applied status (NO first, others last)
    if (a.applied === 'NO' && b.applied !== 'NO') return -1;
    if (a.applied !== 'NO' && b.applied === 'NO') return 1;

    // If both have the same applied status, sort by timestamp (most recent first)
    const timestampA = parseFloat(a.timeStamp);
    const timestampB = parseFloat(b.timeStamp);
    return timestampB - timestampA;
  });
}

export function useDiceJobs() {
  const [diceJobs, setDiceJobs] = useState<Job[]>([]);
  const [isDiceLoading, setIsDiceLoading] = useState(true);
  const [diceError, setDiceError] = useState<string | null>(null);
  const [diceAcceptDenyCounts, setDiceAcceptDenyCounts] = useState<{
    countAccepted: number;
    countRejected: number;
  }>({
    countAccepted: 0,
    countRejected: 0,
  });

  const fetchDiceJobs = useCallback(async (hours?: number) => {
    try {
      setIsDiceLoading(true);
      setDiceError(null);
      const [jobsData, countsData] = await Promise.all([
        hours 
          ? api.getJobsByHoursDice(hours)
          : api.getJobsDice(),
        api.getAcceptDenyCountsDice(),
      ]);
      const sortedJobs = sortDiceJobs(jobsData);
      setDiceJobs(sortedJobs);
      setDiceAcceptDenyCounts(countsData);
    } catch (err) {
      setDiceError(err instanceof Error ? err.message : 'Failed to fetch dice jobs');
      console.error('Error fetching dice jobs:', err);
    } finally {
      setIsDiceLoading(false);
    }
  }, []);

  const updateDiceJobStatus = useCallback(async (jobId: string, newStatus: 'YES' | 'NEVER') => {
    try {
      const job = diceJobs.find(j => j.id === jobId);
      if (!job) {
        throw new Error('Dice job not found');
      }

      if (newStatus === 'YES') {
        await api.applyJobDice({ 
          jobID: jobId, 
          applyMethod: job.method, 
          link: job.link, 
          useBot: false 
        });
        toast.success('Dice job marked as applied');
      } else {
        await api.rejectJobDice({ jobID: jobId });
        toast.success('Dice job marked as rejected');
      }

      // Update local state
      setDiceJobs(prevJobs => {
        const updatedJobs = prevJobs.map(job => 
          job.id === jobId ? { ...job, applied: newStatus } : job
        );
        return sortDiceJobs(updatedJobs);
      });

      // Refresh the accept/deny counts
      const newCounts = await api.getAcceptDenyCountsDice();
      setDiceAcceptDenyCounts(newCounts);

    } catch (err) {
      console.error('Error updating dice job status:', err);
      toast.error('Failed to update dice job status', {
        description: err instanceof Error ? err.message : 'Please try again',
      });
    }
  }, [diceJobs]);

  useEffect(() => {
    fetchDiceJobs();
  }, [fetchDiceJobs]);

  return { 
    jobs: diceJobs,
    isLoading: isDiceLoading,
    error: diceError,
    updateJobStatus: updateDiceJobStatus,
    acceptDenyCounts: diceAcceptDenyCounts,
    fetchJobs: fetchDiceJobs,
  };
} 