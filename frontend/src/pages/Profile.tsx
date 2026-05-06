import { BarChart3, CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Footer } from "@/components/Footer";
import { useWeeklyReportQuery } from "@/hooks/use-jobs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatWeekRange(startIso: string, endIso: string): string {
  if (!startIso || !endIso) return "—";
  return `${startIso} to ${endIso}`;
}

export default function Profile() {
  const { user } = useAuth();
  const weeklyReportQuery = useWeeklyReportQuery();
  const summary = weeklyReportQuery.data?.summary;
  const rows = weeklyReportQuery.data?.weeks ?? [];
  const firstName = (user?.name ?? "").trim().split(/\s+/)[0] || "there";
  const weekCount = rows.length;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-themed">
        <div className="min-h-full flex flex-col">
        <div className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-5 sm:space-y-6 min-w-0">
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card/50 to-emerald-500/[0.06] p-6 sm:p-7 shadow-sm shadow-primary/5">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 border border-primary/25">
              <Sparkles className="h-6 w-6 text-primary" aria-hidden />
            </div>
            <div className="space-y-2 min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Your profile</p>
              <h2 className="text-xl sm:text-2xl font-bold font-display text-foreground">
                Hey {firstName}, here’s how you’ve been deciding
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                This page is your personal weekly ledger: every accept and reject is tied to ISO weeks (Monday through
                Sunday) so you can compare periods at a glance. Totals below are across{" "}
                <strong className="text-foreground font-medium">all time</strong>
                {weeklyReportQuery.isLoading
                  ? "—loading your history…"
                  : weekCount > 0
                    ? ` (${weekCount} week${weekCount === 1 ? "" : "s"} in the table).`
                    : "—start browsing jobs to build history."}
              </p>
              <p className="text-xs text-muted-foreground">
                Tip: the flame next to your name in the navbar counts <strong className="text-foreground/90">full applies this week only</strong>.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/50 p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground inline-flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-primary" aria-hidden />
                Weekly Decision Report
              </h1>
              <p className="text-sm text-muted-foreground">
                Monday to Sunday counts for accepted and rejected actions. Every action click is timestamped and tracked.
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] p-3">
              <p className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Accepted</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{summary?.acceptedCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.08] p-3">
              <p className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-300">Rejected</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{summary?.rejectedCount ?? 0}</p>
            </div>
            <div className="rounded-xl border border-primary/25 bg-primary/[0.08] p-3">
              <p className="text-xs uppercase tracking-wider text-primary">Total Actions</p>
              <p className="text-2xl font-semibold text-foreground mt-1">{summary?.totalCount ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/45 p-4 sm:p-5">
          {weeklyReportQuery.isLoading ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading weekly report...
            </div>
          ) : weeklyReportQuery.isError ? (
            <div className="rounded-xl border border-destructive/35 bg-destructive/10 p-4 text-destructive text-sm">
              Could not load weekly report.
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-border/70 p-6 text-sm text-muted-foreground">
              No weekly stats yet. Accept or reject a few jobs and this report will populate.
            </div>
          ) : (
            <div className="-mx-1 overflow-x-auto scrollbar-themed rounded-lg border border-border/50">
              <Table className="min-w-[640px] w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead className="text-emerald-700 dark:text-emerald-300">Accepted</TableHead>
                  <TableHead className="text-rose-700 dark:text-rose-300">Rejected</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Latest Update</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.weekKey}>
                    <TableCell className="font-medium">{row.weekKey}</TableCell>
                    <TableCell>{formatWeekRange(row.weekStartIso, row.weekEndIso)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        {row.acceptedCount}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <XCircle className="h-4 w-4 text-rose-500" />
                        {row.rejectedCount}
                      </span>
                    </TableCell>
                    <TableCell>{row.totalCount}</TableCell>
                    <TableCell className="text-muted-foreground text-xs sm:text-sm">
                      {row.updatedAt || row.createdAt || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </div>
        </div>
        <Footer />
        </div>
      </div>
    </div>
  );
}
