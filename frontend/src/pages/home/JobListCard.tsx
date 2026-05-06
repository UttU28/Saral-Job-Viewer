import { Building2, Loader2, MapPin } from "lucide-react";
import type { JobRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { pastelMetaLineClasses } from "./constants";
import type { JobListCardDecisionUi } from "./types";
import { applyStatusBadgeVariant, formatApplyStatusLabel, jobMetaHighlights } from "./utils";

export function JobListCard({
  job,
  selected,
  onSelect,
  decisionUi,
  onDismissFlash,
}: Readonly<{
  job: JobRow;
  selected: boolean;
  onSelect: () => void;
  decisionUi?: JobListCardDecisionUi;
  onDismissFlash?: () => void;
}>) {
  const cardMetaLines = jobMetaHighlights(job);
  const companyText = (job.companyName ?? "").trim();
  const locationText = (job.location ?? "").trim();

  const badgeApplyStatus =
    (decisionUi?.flash?.variant === "success" || decisionUi?.flash?.variant === "warning") &&
    decisionUi.flash.applyStatus != null &&
    decisionUi.flash.applyStatus !== ""
      ? decisionUi.flash.applyStatus
      : job.applyStatus;

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "relative z-0 w-full text-left rounded-xl border px-3 py-2.5 sm:px-3.5 sm:py-3 transition-all duration-200",
          "hover:border-primary/35 hover:bg-muted/60 dark:hover:bg-white/[0.04]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          selected
            ? "border-primary/50 bg-primary/[0.12] shadow-[0_0_0_1px_rgba(139,92,246,0.25)]"
            : "border-border bg-card/40",
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <Badge
            variant="outline"
            className={cn(
              "text-[11px] px-2 py-0 h-6 font-medium",
              selected ? "border-primary/40 text-primary" : "border-border dark:border-white/15",
            )}
          >
            {job.platform ?? "?"}
          </Badge>
          <Badge
            variant={applyStatusBadgeVariant(badgeApplyStatus)}
            className="text-[11px] px-2 py-0 h-6 font-medium"
          >
            {formatApplyStatusLabel(badgeApplyStatus)}
          </Badge>
        </div>
        <h3 className="text-[15px] sm:text-base font-semibold font-display text-foreground leading-snug line-clamp-2 mb-1.5">
          {job.title ?? "Untitled role"}
        </h3>
        {companyText || locationText ? (
          <div className="flex flex-col gap-1 text-xs min-w-0 leading-snug">
            {companyText ? (
              <span className="inline-flex items-center gap-1.5 text-sky-800/88 dark:text-sky-300 min-w-0">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-sky-600/70 dark:text-sky-400" />
                <span className="truncate">{companyText}</span>
              </span>
            ) : null}
            {locationText ? (
              <span className="inline-flex items-center gap-1.5 text-rose-800/88 dark:text-rose-300 min-w-0">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-rose-600/65 dark:text-rose-400" />
                <span className="truncate">{locationText}</span>
              </span>
            ) : null}
          </div>
        ) : null}
        {cardMetaLines.length > 0 ? (
          <div className="mt-2 pt-1.5 border-t border-border/80 dark:border-border/60 flex flex-wrap items-center gap-y-0 text-[11px] leading-snug rounded-md bg-gradient-to-r from-violet-500/[0.08] via-transparent to-emerald-500/[0.06] dark:from-violet-500/[0.12] dark:to-emerald-500/[0.08] px-2 py-1.5">
            {cardMetaLines.map((line, lineIndex) => (
              <span key={`${line}-${lineIndex}`} className="inline-flex items-center max-w-full">
                {lineIndex > 0 ? (
                  <span
                    className="text-muted-foreground/55 dark:text-zinc-500 mx-1.5 shrink-0 select-none"
                    aria-hidden
                  >
                    ·
                  </span>
                ) : null}
                <span
                  className={cn(
                    "font-medium truncate",
                    pastelMetaLineClasses[lineIndex % pastelMetaLineClasses.length],
                  )}
                >
                  {line}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </button>

      {decisionUi?.loading ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl border border-primary/25 bg-background/92 dark:bg-zinc-950/92 px-3 py-3 text-center shadow-sm pointer-events-auto"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-6 w-6 sm:h-7 sm:w-7 animate-spin text-primary shrink-0" aria-hidden />
          <p className="text-[11px] sm:text-xs font-semibold text-foreground leading-snug px-1">
            {decisionUi.kind === "accept" ? "Submitting via Midhtech…" : "Updating status…"}
          </p>
        </div>
      ) : null}

      {decisionUi?.flash && !decisionUi.loading ? (
        <div
          className={cn(
            "mt-1.5 rounded-lg border px-2.5 py-2 text-left text-[11px] sm:text-xs leading-snug",
            decisionUi.flash.variant === "success"
              ? "border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-900 dark:text-emerald-100/95"
              : decisionUi.flash.variant === "warning"
                ? "border-amber-500/40 bg-amber-500/[0.1] text-amber-950 dark:text-amber-100/90"
                : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          <p className="font-medium">{decisionUi.flash.message}</p>
          {(decisionUi.flash.variant === "error" || decisionUi.flash.variant === "warning") &&
          decisionUi.flash.detail ? (
            <pre className="mt-1.5 whitespace-pre-wrap break-words font-sans text-[10px] sm:text-[11px] opacity-95">
              {decisionUi.flash.detail}
            </pre>
          ) : null}
          {decisionUi.flash.variant === "error" || decisionUi.flash.variant === "warning" ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDismissFlash?.();
              }}
              className="mt-2 text-[10px] sm:text-xs font-semibold underline underline-offset-2 hover:opacity-90"
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
