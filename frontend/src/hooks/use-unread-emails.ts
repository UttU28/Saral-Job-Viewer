import { useCallback, useEffect, useState } from "react";
import {
  applyEmailLabels,
  classifyOneEmail,
  fetchGmailStatus,
  fetchUnreadPrimaryEmails,
  MailApiError,
  type ApplyLabelsResult,
  type EmailCategory,
  type GmailStatus,
  type UnreadEmail,
} from "@/lib/placetrack/mail-api";

/** Keep at most this many classify-one requests in flight. */
const CLASSIFY_CONCURRENCY = 8;

export type EmailReviewRow = UnreadEmail & {
  category: EmailCategory;
  reason: string | null;
  source: string | null;
  classifyStatus: "idle" | "loading" | "done" | "error";
  classifyError?: string | null;
};

type UnreadEmailsState = {
  gmailStatus: GmailStatus | null;
  rows: EmailReviewRow[];
  fetchedAt: string | null;
  isLoading: boolean;
  isCategorizing: boolean;
  isSubmitting: boolean;
  categorizeProgress: { done: number; total: number } | null;
  error: string | null;
  lastApply: ApplyLabelsResult | null;
  refresh: () => Promise<void>;
  categorizeAll: () => Promise<void>;
  setRowCategory: (messageId: string, category: EmailCategory) => void;
  submitLabels: () => Promise<ApplyLabelsResult | null>;
};

function toReviewRow(email: UnreadEmail): EmailReviewRow {
  return {
    ...email,
    category: "none",
    reason: null,
    source: null,
    classifyStatus: "idle",
  };
}

export function useUnreadPrimaryEmails(enabled: boolean): UnreadEmailsState {
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [rows, setRows] = useState<EmailReviewRow[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categorizeProgress, setCategorizeProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [lastApply, setLastApply] = useState<ApplyLabelsResult | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setLastApply(null);
    setCategorizeProgress(null);
    try {
      const status = await fetchGmailStatus();
      setGmailStatus(status);
      if (!status.connected) {
        setRows([]);
        setFetchedAt(null);
        return;
      }

      const inbox = await fetchUnreadPrimaryEmails({ maxResults: 1000 });
      setRows(inbox.emails.map(toReviewRow));
      setFetchedAt(inbox.fetchedAt ?? null);
    } catch (err) {
      const message = err instanceof MailApiError ? err.message : "Could not load unread emails.";
      setError(message);
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setRowCategory = useCallback((messageId: string, category: EmailCategory) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === messageId
          ? {
              ...row,
              category,
              reason: row.reason ? `${row.reason} · edited` : "edited",
              source: "user",
            }
          : row,
      ),
    );
  }, []);

  const categorizeAll = useCallback(async () => {
    if (!rows.length) return;
    setIsCategorizing(true);
    setError(null);
    setCategorizeProgress({ done: 0, total: rows.length });

    const ids = rows.map((row) => row.id);
    let nextIndex = 0;
    let done = 0;
    const total = ids.length;

    const classifyOne = async (messageId: string) => {
      setRows((prev) =>
        prev.map((row) =>
          row.id === messageId ? { ...row, classifyStatus: "loading", classifyError: null } : row,
        ),
      );

      try {
        const result = await classifyOneEmail(messageId, true);
        setRows((prev) =>
          prev.map((row) =>
            row.id === messageId
              ? {
                  ...row,
                  category: result.category,
                  reason: result.reason ?? null,
                  source: result.source ?? null,
                  classifyStatus: "done",
                  classifyError: null,
                }
              : row,
          ),
        );
      } catch (err) {
        const message = err instanceof MailApiError ? err.message : "Classify failed";
        setRows((prev) =>
          prev.map((row) =>
            row.id === messageId
              ? { ...row, classifyStatus: "error", classifyError: message }
              : row,
          ),
        );
      } finally {
        done += 1;
        setCategorizeProgress({ done, total });
      }
    };

    const worker = async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= total) return;
        await classifyOne(ids[index]);
      }
    };

    const workers = Array.from({ length: Math.min(CLASSIFY_CONCURRENCY, total) }, () => worker());
    await Promise.all(workers);

    setIsCategorizing(false);
  }, [rows]);

  const submitLabels = useCallback(async (): Promise<ApplyLabelsResult | null> => {
    const toApply = rows.filter(
      (row) => row.category === "baharMil" || row.category === "oneSided" || row.category === "jobAds",
    );
    const items = toApply.map((row) => ({ messageId: row.id, category: row.category }));

    if (!items.length) {
      setError("Nothing to submit — set at least one email to BaharMil, oneSided, or jobAds.");
      return null;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await applyEmailLabels({ items, archive: true, markRead: true });
      setLastApply(result);

      const appliedIds = new Set(
        result.results
          .filter((row) => row.action === "applied")
          .map((row) => String(row.messageId ?? "")),
      );
      const errorIds = new Set(
        result.results
          .filter((row) => row.action === "error")
          .map((row) => String(row.messageId ?? "")),
      );

      // Keep none + failed rows in the list; drop successfully moved ones.
      setRows((prev) =>
        prev.filter((row) => {
          if (row.category === "none") return true;
          if (appliedIds.has(row.id)) return false;
          return true;
        }),
      );

      if (result.counts.errors > 0) {
        const firstError = result.results.find((row) => row.action === "error");
        const detail =
          firstError && typeof firstError.error === "string"
            ? firstError.error
            : `${result.counts.errors} failed`;
        setError(`Some labels failed to apply: ${detail}`);
      }

      // Soft refresh remaining unread (none should stay; applied should be gone from Primary)
      if (appliedIds.size > 0 || errorIds.size === 0) {
        try {
          const inbox = await fetchUnreadPrimaryEmails({ maxResults: 1000 });
          const remainingById = new Map(inbox.emails.map((email) => [email.id, email]));
          setRows((prev) => {
            // Prefer keeping local none/error rows; drop anything Gmail no longer returns as unread primary
            const kept = prev.filter((row) => remainingById.has(row.id) || errorIds.has(row.id));
            return kept.length ? kept : inbox.emails.map(toReviewRow);
          });
          setFetchedAt(inbox.fetchedAt ?? null);
        } catch {
          // local filter already applied
        }
      }

      return result;
    } catch (err) {
      const message = err instanceof MailApiError ? err.message : "Could not apply labels.";
      setError(message);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [rows]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  return {
    gmailStatus,
    rows,
    fetchedAt,
    isLoading,
    isCategorizing,
    isSubmitting,
    categorizeProgress,
    error,
    lastApply,
    refresh,
    categorizeAll,
    setRowCategory,
    submitLabels,
  };
}
