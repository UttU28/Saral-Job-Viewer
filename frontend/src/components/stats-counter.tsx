import {
  BriefcaseIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ZapIcon,
  PencilIcon,
} from 'lucide-react';

interface StatsCounterProps {
  totalJobs: number;
  appliedJobs: number;
  rejectedJobs: number;
  pendingJobs: number;
  totalAccepted?: number;
  totalRejected?: number;
  pendingEasyApply: number;
  pendingManual: number;
}

export function StatsCounter({
  totalJobs,
  appliedJobs,
  rejectedJobs,
  pendingJobs,
  totalAccepted = 0,
  totalRejected = 0,
  pendingEasyApply,
  pendingManual,
}: StatsCounterProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {/* Total Jobs */}
      <div className="bg-gradient-to-br from-black/40 to-black/60 border border-border/20 rounded-lg p-4 flex items-center justify-between backdrop-blur-sm">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Total Jobs</p>
          <p className="text-2xl font-bold">{totalJobs}</p>
        </div>
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <BriefcaseIcon className="h-6 w-6 text-primary" />
        </div>
      </div>

      {/* Applied */}
      <div className="bg-gradient-to-br from-black/40 to-black/60 border border-border/20 rounded-lg p-4 flex items-center justify-between backdrop-blur-sm">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Applied</p>
          <p className="text-2xl font-bold text-accent">{appliedJobs + totalAccepted}</p>
        </div>
        <div className="h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
          <CheckCircleIcon className="h-6 w-6 text-accent" />
        </div>
      </div>

      {/* Rejected */}
      <div className="bg-gradient-to-br from-black/40 to-black/60 border border-border/20 rounded-lg p-4 flex items-center justify-between backdrop-blur-sm">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Rejected</p>
          <p className="text-2xl font-bold text-destructive">{rejectedJobs + totalRejected}</p>
        </div>
        <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <XCircleIcon className="h-6 w-6 text-destructive" />
        </div>
      </div>

      {/* Pending */}
      <div className="bg-gradient-to-br from-black/40 to-black/60 border border-border/20 rounded-lg p-4 flex items-center justify-between backdrop-blur-sm">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Pending</p>
          <p className="text-2xl font-bold">{pendingJobs}</p>
        </div>
        <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
          <ClockIcon className="h-6 w-6 text-yellow-500" />
        </div>
      </div>

      {/* Pending EasyApply */}
      <div className="bg-gradient-to-br from-black/40 to-black/60 border border-border/20 rounded-lg p-4 flex items-center justify-between backdrop-blur-sm">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Pending EasyApply</p>
          <p className="text-2xl font-bold text-blue-400">{pendingEasyApply}</p>
        </div>
        <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
          <ZapIcon className="h-6 w-6 text-blue-400" />
        </div>
      </div>

      {/* Pending Manual */}
      <div className="bg-gradient-to-br from-black/40 to-black/60 border border-border/20 rounded-lg p-4 flex items-center justify-between backdrop-blur-sm">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Pending Manual</p>
          <p className="text-2xl font-bold text-orange-400">{pendingManual}</p>
        </div>
        <div className="h-12 w-12 rounded-full bg-orange-500/10 flex items-center justify-center">
          <PencilIcon className="h-6 w-6 text-orange-400" />
        </div>
      </div>
    </div>
  );
}