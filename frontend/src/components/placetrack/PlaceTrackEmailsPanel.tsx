import { Check, ExternalLink, Inbox, Loader2, Mail, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { EmailReviewRow } from "@/hooks/use-unread-emails";
import {
  startGmailAuth,
  type ApplyLabelsResult,
  type EmailCategory,
  type GmailStatus,
} from "@/lib/placetrack/mail-api";
import { PLACETRACK_EMAILS_PATH } from "@/lib/placetrack/routing";
import { cn } from "@/lib/utils";

type PlaceTrackEmailsPanelProps = {
  active: boolean;
  gmailStatus: GmailStatus | null;
  rows: EmailReviewRow[];
  fetchedAt: string | null;
  isLoading: boolean;
  isCategorizing: boolean;
  isSubmitting: boolean;
  categorizeProgress: { done: number; total: number } | null;
  error: string | null;
  lastApply: ApplyLabelsResult | null;
  onRefresh: () => void;
  onCategorize: () => Promise<void>;
  onSetCategory: (messageId: string, category: EmailCategory) => void;
  onSubmit: () => Promise<ApplyLabelsResult | null>;
};

function formatEmailDate(value?: string | null, internalDate?: string | null): string {
  let date: Date | null = null;
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  if (!date && internalDate) {
    const ms = Number(internalDate);
    if (!Number.isNaN(ms)) date = new Date(ms);
  }
  if (!date) return "";

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function senderLabel(row: EmailReviewRow): string {
  if (row.fromName?.trim()) return row.fromName.trim();
  if (row.fromEmail?.trim()) return row.fromEmail.trim();
  return "Unknown sender";
}

function gmailMessageUrl(id: string): string {
  return `https://mail.google.com/mail/u/0/#inbox/${id}`;
}

export function PlaceTrackEmailsPanel({
  active,
  gmailStatus,
  rows,
  fetchedAt,
  isLoading,
  isCategorizing,
  isSubmitting,
  categorizeProgress,
  error,
  lastApply,
  onRefresh,
  onCategorize,
  onSetCategory,
  onSubmit,
}: PlaceTrackEmailsPanelProps) {
  const { toast } = useToast();

  if (!active) return null;

  const labeledCount = rows.filter(
    (row) =>
      row.category === "baharMil" ||
      row.category === "oneSided" ||
      row.category === "jobAds" ||
      row.category === "pendingJobs" ||
      row.category === "shopping",
  ).length;
  const classifiedCount = rows.filter((row) => row.classifyStatus === "done").length;

  const handleSubmit = async () => {
    const result = await onSubmit();
    if (!result) return;
    const parts = [
      `Moved ${result.counts.applied} to labels`,
      `BaharMil ${result.counts.baharMil}`,
      `oneSided ${result.counts.oneSided}`,
      `jobAds ${result.counts.jobAds}`,
      `pendingJobs ${result.counts.pendingJobs}`,
      `shopping ${result.counts.shopping}`,
      `left none in Primary`,
    ];
    if (result.counts.errors) parts.push(`errors ${result.counts.errors}`);
    toast({
      title: result.counts.applied > 0 ? "Labels applied in Gmail" : "Nothing moved",
      description: parts.join(" · "),
      variant: result.counts.errors ? "destructive" : "default",
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold tracking-tight sm:text-xl">Emails</h2>
          <p className="text-sm text-muted-foreground">
            Categorize → edit → Submit moves BaharMil / oneSided / jobAds / pendingJobs / shopping out of
            Primary; none stays
            {gmailStatus?.email ? ` · ${gmailStatus.email}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {fetchedAt ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Updated {new Date(fetchedAt).toLocaleTimeString()}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={onRefresh}
            disabled={isLoading || isCategorizing || isSubmitting}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="gap-2"
            onClick={() => void onCategorize()}
            disabled={isLoading || isCategorizing || isSubmitting || !rows.length || !gmailStatus?.connected}
          >
            {isCategorizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isCategorizing && categorizeProgress
              ? `Categorizing ${categorizeProgress.done}/${categorizeProgress.total}`
              : "Categorize (max 8)"}
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => void handleSubmit()}
            disabled={isLoading || isCategorizing || isSubmitting || labeledCount === 0}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Submit ({labeledCount})
          </Button>
        </div>
      </div>

      {gmailStatus?.connected && gmailStatus.canModify === false ? (
        <div className="glass-card mb-4 rounded-xl border border-amber-500/30 p-4 text-center">
          <p className="mb-2 text-sm text-amber-200">
            Gmail is connected for reading, but needs reconnect for label moves (gmail.modify).
          </p>
          <Button size="sm" onClick={() => startGmailAuth(PLACETRACK_EMAILS_PATH)}>
            Reconnect Gmail
          </Button>
        </div>
      ) : null}

      {gmailStatus?.connected && rows.length > 0 ? (
        <div className="mb-4 text-xs text-muted-foreground">
          {rows.length} unread · {classifiedCount} categorized · {labeledCount} ready to label
        </div>
      ) : null}

      {lastApply ? (
        <div className="mb-4 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Last submit: applied {lastApply.counts.applied} · BaharMil {lastApply.counts.baharMil} · oneSided{" "}
          {lastApply.counts.oneSided} · jobAds {lastApply.counts.jobAds} · pendingJobs{" "}
          {lastApply.counts.pendingJobs} · shopping {lastApply.counts.shopping}
          {lastApply.counts.errors ? ` · errors ${lastApply.counts.errors}` : ""}
        </div>
      ) : null}

      {gmailStatus && !gmailStatus.connected ? (
        <div className="glass-card rounded-xl border border-border/60 p-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Mail className="h-5 w-5" />
          </div>
          <h3 className="mb-1 font-display text-base font-semibold">Gmail not connected</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Connect Gmail (with modify access) to load unread mail and apply labels.
          </p>
          <Button size="sm" onClick={() => startGmailAuth(PLACETRACK_EMAILS_PATH)}>
            Connect Gmail
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="glass-card mb-4 rounded-xl border border-destructive/30 p-6 text-center">
          <p className="mb-3 text-sm text-destructive">{error}</p>
          {/insufficient|scope|permission/i.test(error) ? (
            <div className="mb-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Your Gmail token was connected before label access was added. Reconnect Gmail, then Submit again.
              </p>
              <Button size="sm" onClick={() => startGmailAuth(PLACETRACK_EMAILS_PATH)}>
                Reconnect Gmail
              </Button>
            </div>
          ) : null}
          <Button size="sm" variant="secondary" onClick={onRefresh}>
            Try again
          </Button>
        </div>
      ) : null}

      {isLoading && rows.length === 0 && !error && gmailStatus?.connected !== false ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-[88px] w-full rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : null}

      {!isLoading && gmailStatus?.connected && rows.length === 0 && !error ? (
        <div className="glass-card rounded-xl border border-border/60 p-10 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground">
            <Inbox className="h-5 w-5" />
          </div>
          <h3 className="mb-1 font-display text-base font-semibold">Inbox zero</h3>
          <p className="text-sm text-muted-foreground">No unread emails in Primary.</p>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card/40">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:gap-3 sm:px-4">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {senderLabel(row).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{senderLabel(row)}</p>
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {formatEmailDate(row.date, row.internalDate)}
                  </span>
                </div>
                {row.fromName && row.fromEmail ? (
                  <p className="truncate text-xs text-muted-foreground">{row.fromEmail}</p>
                ) : null}
                <p className="mt-0.5 truncate text-sm text-foreground/90">{row.subject}</p>
                {row.snippet ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.snippet}</p>
                ) : null}
                {row.reason ? (
                  <p className="mt-1 truncate text-[11px] text-muted-foreground/90">
                    {row.source ? `${row.source}: ` : ""}
                    {row.reason}
                  </p>
                ) : null}
                {row.classifyError ? (
                  <p className="mt-1 text-[11px] text-destructive">{row.classifyError}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch">
                <select
                  className={cn(
                    "h-8 rounded-md border border-border/70 bg-background px-2 text-xs",
                    row.category === "baharMil" && "border-rose-500/40 text-rose-400",
                    row.category === "oneSided" && "border-amber-500/40 text-amber-400",
                    row.category === "jobAds" && "border-sky-500/40 text-sky-400",
                    row.category === "pendingJobs" && "border-violet-500/40 text-violet-400",
                    row.category === "shopping" && "border-emerald-500/40 text-emerald-400",
                  )}
                  value={row.category}
                  disabled={isCategorizing || isSubmitting || row.classifyStatus === "loading"}
                  onChange={(event) => onSetCategory(row.id, event.target.value as EmailCategory)}
                >
                  <option value="none">none</option>
                  <option value="oneSided">oneSided</option>
                  <option value="baharMil">BaharMil</option>
                  <option value="jobAds">jobAds</option>
                  <option value="pendingJobs">pendingJobs</option>
                  <option value="shopping">shopping</option>
                </select>
                <div className="flex items-center gap-1">
                  {row.classifyStatus === "loading" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : null}
                  <a
                    href={gmailMessageUrl(row.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    title="Open in Gmail"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
