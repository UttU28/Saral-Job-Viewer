import {
  BriefcaseIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
} from 'lucide-react';

interface StatsCounterProps {
  totalJobs: number;
  appliedJobs: number;
  rejectedJobs: number;
  pendingJobs: number;
}

export function StatsCounter({
  totalJobs,
  appliedJobs,
  rejectedJobs,
  pendingJobs,
}: StatsCounterProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="bg-black/40 border border-border/20 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Total Jobs</p>
          <p className="text-2xl font-bold">{totalJobs}</p>
        </div>
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <BriefcaseIcon className="h-6 w-6 text-primary" />
        </div>
      </div>

      <div className="bg-black/40 border border-border/20 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Applied</p>
          <p className="text-2xl font-bold">{appliedJobs}</p>
        </div>
        <div className="h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
          <CheckCircleIcon className="h-6 w-6 text-accent" />
        </div>
      </div>

      <div className="bg-black/40 border border-border/20 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Rejected</p>
          <p className="text-2xl font-bold">{rejectedJobs}</p>
        </div>
        <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircleIcon className="h-6 w-6 text-destructive" />
        </div>
      </div>

      <div className="bg-black/40 border border-border/20 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Pending</p>
          <p className="text-2xl font-bold">{pendingJobs}</p>
        </div>
        <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
          <ClockIcon className="h-6 w-6 text-yellow-500" />
        </div>
      </div>
    </div>
  );
}