import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearAdminValidationExecutionLogs,
  fetchAdminValidationExecutionLogs,
  type ValidationExecutionRow,
} from "@/lib/api";
import { formatClientError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type ValidationExecutionLogPanelProps = {
  row: ValidationExecutionRow;
  expanded: boolean;
  resetToken?: number;
  showHeader?: boolean;
};

export function ValidationExecutionLogPanel({
  row,
  expanded,
  resetToken = 0,
  showHeader = true,
}: ValidationExecutionLogPanelProps) {
  const [logText, setLogText] = useState("");
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState(row.state);
  const offsetRef = useRef(0);
  const preRef = useRef<HTMLPreElement>(null);
  const stickToBottomRef = useRef(true);

  const fetchLogs = useCallback(async () => {
    if (!expanded) return;
    setLoading(true);
    try {
      const result = await fetchAdminValidationExecutionLogs(row.executionName, {
        offset: offsetRef.current,
      });
      if (result.logs) {
        setLogText((prev) => prev + result.logs);
      }
      offsetRef.current = result.offset;
      setLiveState(result.state);
      setFetchError(null);
    } catch (error) {
      setFetchError(formatClientError(error, "Could not load validation logs."));
    } finally {
      setLoading(false);
    }
  }, [expanded, row.executionName]);

  useEffect(() => {
    offsetRef.current = 0;
    setLogText("");
    setFetchError(null);
    setLiveState(row.state);
    stickToBottomRef.current = true;
  }, [row.executionName, resetToken]);

  useEffect(() => {
    setLiveState(row.state);
  }, [row.state]);

  useEffect(() => {
    if (!expanded) return;
    void fetchLogs();
  }, [expanded, fetchLogs, resetToken]);

  useEffect(() => {
    if (!expanded || liveState !== "RUNNING") return;
    const id = globalThis.setInterval(() => {
      void fetchLogs();
    }, 2000);
    return () => clearInterval(id);
  }, [expanded, fetchLogs, liveState]);

  useEffect(() => {
    if (!stickToBottomRef.current || !preRef.current) return;
    preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [logText]);

  const onClearLogs = async () => {
    setClearing(true);
    try {
      await clearAdminValidationExecutionLogs(row.executionName);
      offsetRef.current = 0;
      setLogText("");
      setFetchError(null);
      toast({ title: "Logs cleared", description: row.executionName });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not clear logs",
        description: formatClientError(error, "Request failed"),
      });
    } finally {
      setClearing(false);
    }
  };

  if (!expanded) return null;

  const modeLabel =
    row.mode === "1" ? "Classify" : row.mode === "2" ? "Apply push" : row.mode === "3" ? "Cleanup" : null;

  return (
    <div className={cn(showHeader ? "mt-2 rounded-lg border border-border/70 bg-muted/25 p-3 space-y-2" : "space-y-2")}>
      {showHeader ? (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/90">Container logs</span>
          {modeLabel ? <span>· {modeLabel}</span> : null}
          {liveState === "RUNNING" ? (
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Live
            </span>
          ) : (
            <span>· {liveState.toLowerCase()}</span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={clearing || (!logText && !row.hasLogs)}
          onClick={() => void onClearLogs()}
        >
          {clearing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" aria-hidden />
          ) : (
            <Eraser className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          )}
          Clear logs
        </Button>
      </div>
      ) : (
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={clearing || (!logText && !row.hasLogs)}
          onClick={() => void onClearLogs()}
        >
          {clearing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" aria-hidden />
          ) : (
            <Eraser className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          )}
          Clear logs
        </Button>
      </div>
      )}
      {fetchError ? <p className="text-xs text-destructive">{fetchError}</p> : null}
      <pre
        ref={preRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className={cn(
          "max-h-72 overflow-auto rounded-md border border-border/60 bg-background/80 p-3",
          "font-mono text-[11px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-words",
        )}
      >
        {logText || (loading ? "Loading logs…" : "No log output yet.")}
      </pre>
    </div>
  );
}
