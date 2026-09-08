import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyEmailLabels,
  classifyOneEmail,
  fetchClassifyAiStatus,
  fetchGmailStatus,
  fetchUnreadPrimaryCount,
  fetchUnreadPrimaryEmails,
  MailApiError,
  type ApplyLabelsResult,
  type ClassifyAiStatus,
  type ClassifyProvider,
  type EmailCategory,
  type GmailStatus,
  type UnreadEmail,
} from "@/lib/placetrack/mail-api";

/** Keep at most this many classify-one requests in flight. */
const CLASSIFY_CONCURRENCY = 8;
const PROVIDER_STORAGE_KEY = "sjv-email-classify-provider";
export const UNREAD_PAGE_SIZE = 400;

export type EmailReviewRow = UnreadEmail & {
  category: EmailCategory;
  reason: string | null;
  source: string | null;
  classifyStatus: "idle" | "loading" | "done" | "error";
  classifyError?: string | null;
};

export type PageClassifyProgress = {
  page: number;
  status: "idle" | "fetching" | "categorizing" | "done" | "error";
  done: number;
  total: number;
  error?: string | null;
};

type UnreadEmailsState = {
  gmailStatus: GmailStatus | null;
  rows: EmailReviewRow[];
  allRows: EmailReviewRow[];
  fetchedAt: string | null;
  isLoading: boolean;
  isFetchingPage: boolean;
  isCategorizing: boolean;
  isSubmitting: boolean;
  categorizeProgress: { done: number; total: number } | null;
  pageProgress: PageClassifyProgress[];
  currentPage: number;
  totalPages: number;
  total: number;
  pageSize: number;
  canSubmitAll: boolean;
  error: string | null;
  lastApply: ApplyLabelsResult | null;
  classifyProvider: ClassifyProvider;
  classifyAiStatus: ClassifyAiStatus | null;
  effectiveProvider: ClassifyProvider;
  setClassifyProvider: (provider: ClassifyProvider) => void;
  refresh: () => Promise<void>;
  goToPage: (page: number) => Promise<void>;
  categorizeAll: () => Promise<void>;
  setRowCategory: (messageId: string, category: EmailCategory) => void;
  submitLabels: () => Promise<ApplyLabelsResult | null>;
};

function readStoredProvider(): ClassifyProvider | null {
  try {
    const value = localStorage.getItem(PROVIDER_STORAGE_KEY);
    if (value === "openai" || value === "regex" || value === "local") return value;
  } catch {
    // ignore
  }
  return null;
}

function toReviewRow(email: UnreadEmail): EmailReviewRow {
  return {
    ...email,
    category: "none",
    reason: null,
    source: null,
    classifyStatus: "idle",
  };
}

function labeledCategory(row: EmailReviewRow): boolean {
  return (
    row.category === "baharMil" ||
    row.category === "oneSided" ||
    row.category === "jobAds" ||
    row.category === "pendingJobs" ||
    row.category === "shopping" ||
    row.category === "finTax" ||
    row.category === "replySpam" ||
    row.category === "trash" ||
    row.category === "cicd"
  );
}

function flattenPages(pages: Record<number, EmailReviewRow[]>): EmailReviewRow[] {
  return Object.keys(pages)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((page) => pages[page] ?? []);
}

export function useUnreadPrimaryEmails(enabled: boolean): UnreadEmailsState {
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [pageRows, setPageRows] = useState<Record<number, EmailReviewRow[]>>({});
  const [pageTokens, setPageTokens] = useState<Record<number, string | null>>({ 1: null });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPage, setIsFetchingPage] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categorizeProgress, setCategorizeProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [pageProgress, setPageProgress] = useState<PageClassifyProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastApply, setLastApply] = useState<ApplyLabelsResult | null>(null);
  const [classifyProvider, setClassifyProviderState] = useState<ClassifyProvider>(
    () => readStoredProvider() ?? "local",
  );
  const [classifyAiStatus, setClassifyAiStatus] = useState<ClassifyAiStatus | null>(null);

  const pageRowsRef = useRef(pageRows);
  const pageTokensRef = useRef(pageTokens);
  const totalPagesRef = useRef(totalPages);
  const classifyDoneRef = useRef(0);
  pageRowsRef.current = pageRows;
  pageTokensRef.current = pageTokens;
  totalPagesRef.current = totalPages;

  const effectiveProvider: ClassifyProvider = (() => {
    if (classifyProvider === "regex") return "regex";
    if (classifyProvider === "openai") {
      if (classifyAiStatus && !classifyAiStatus.openai.available) return "regex";
      return "openai";
    }
    if (classifyAiStatus && !classifyAiStatus.local.available) return "regex";
    return "local";
  })();

  const setClassifyProvider = useCallback((provider: ClassifyProvider) => {
    setClassifyProviderState(provider);
    try {
      localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
    } catch {
      // ignore
    }
  }, []);

  const refreshAiStatus = useCallback(async () => {
    try {
      setClassifyAiStatus(await fetchClassifyAiStatus());
    } catch {
      setClassifyAiStatus((prev) =>
        prev ?? {
          local: { available: false, enabled: true, label: "Local AI", error: "status unavailable" },
          openai: { available: true, enabled: true, label: "OpenAI" },
          regex: { available: true, enabled: true, label: "Regex" },
          recommended: "openai",
          running: "openai",
        },
      );
    }
  }, []);

  const applyPageResult = useCallback(
    (page: number, inbox: Awaited<ReturnType<typeof fetchUnreadPrimaryEmails>>) => {
      setPageRows((prev) => {
        const next = { ...prev, [page]: inbox.emails.map(toReviewRow) };
        pageRowsRef.current = next;
        return next;
      });
      setFetchedAt(inbox.fetchedAt ?? null);
      if (typeof inbox.total === "number" && inbox.total > 0) {
        setTotal(inbox.total);
      }
      const nextToken = inbox.nextPageToken || null;
      setPageTokens((prev) => {
        const next = { ...prev };
        if (page === 1) next[1] = null;
        if (nextToken) next[page + 1] = nextToken;
        pageTokensRef.current = next;
        return next;
      });
      setTotalPages((prev) => {
        const fromApi = inbox.totalPages ?? 0;
        if (!nextToken) return Math.max(page, fromApi ? Math.min(fromApi, page) : page);
        return Math.max(prev, page + 1, fromApi);
      });
    },
    [],
  );

  const fetchPage = useCallback(
    async (page: number, idsOnly = false) => {
      let token: string | null | undefined = page === 1 ? null : pageTokensRef.current[page];
      if (page > 1 && token === undefined) {
        for (let walk = 1; walk < page; walk += 1) {
          if (pageRowsRef.current[walk]?.length) continue;
          const walkToken = walk === 1 ? null : pageTokensRef.current[walk];
          if (walk > 1 && walkToken === undefined) {
            throw new Error(`Cannot reach page ${page} — missing token for page ${walk}.`);
          }
          const walked = await fetchUnreadPrimaryEmails({
            pageSize: UNREAD_PAGE_SIZE,
            pageToken: walkToken,
            idsOnly: true,
          });
          const walkedNext = walked.nextPageToken || null;
          setPageTokens((prev) => {
            const next = { ...prev };
            if (walkedNext) next[walk + 1] = walkedNext;
            return next;
          });
          pageTokensRef.current = {
            ...pageTokensRef.current,
            ...(walkedNext ? { [walk + 1]: walkedNext } : {}),
          };
          if (!walkedNext) {
            setTotalPages(walk);
            totalPagesRef.current = walk;
            return null;
          }
        }
        token = pageTokensRef.current[page];
        if (page > 1 && !token) {
          throw new Error(`No Gmail page token for page ${page}.`);
        }
      }

      const inbox = await fetchUnreadPrimaryEmails({
        pageSize: UNREAD_PAGE_SIZE,
        pageToken: token,
        idsOnly,
      });
      if (!idsOnly) applyPageResult(page, inbox);
      else {
        const nextToken = inbox.nextPageToken || null;
        setPageTokens((prev) => {
          const next = { ...prev };
          if (nextToken) next[page + 1] = nextToken;
          return next;
        });
        pageTokensRef.current = {
          ...pageTokensRef.current,
          ...(nextToken ? { [page + 1]: nextToken } : {}),
        };
      }
      return inbox;
    },
    [applyPageResult],
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setLastApply(null);
    setCategorizeProgress(null);
    setPageProgress([]);
    setPageRows({});
    setPageTokens({ 1: null });
    pageRowsRef.current = {};
    pageTokensRef.current = { 1: null };
    setCurrentPage(1);
    try {
      const status = await fetchGmailStatus();
      setGmailStatus(status);
      if (!status.connected) {
        setTotal(0);
        setTotalPages(0);
        setFetchedAt(null);
        return;
      }

      const summary = await fetchUnreadPrimaryCount({ pageSize: UNREAD_PAGE_SIZE });
      setTotal(summary.total);
      setTotalPages(summary.totalPages);
      totalPagesRef.current = summary.totalPages;
      setFetchedAt(summary.fetchedAt ?? null);

      if (summary.totalPages < 1 || summary.total < 1) {
        return;
      }

      await fetchPage(1);
      setCurrentPage(1);
    } catch (err) {
      const message = err instanceof MailApiError ? err.message : "Could not load unread emails.";
      setError(message);
      setPageRows({});
    } finally {
      setIsLoading(false);
    }
  }, [fetchPage]);

  const goToPage = useCallback(
    async (page: number) => {
      if (page < 1) return;
      const last = Math.max(totalPagesRef.current, 1);
      if (page > last) return;
      if (pageRowsRef.current[page]?.length) {
        setCurrentPage(page);
        return;
      }
      setIsFetchingPage(true);
      setError(null);
      try {
        await fetchPage(page);
        setCurrentPage(page);
      } catch (err) {
        const message = err instanceof MailApiError ? err.message : "Could not load that page.";
        setError(message);
      } finally {
        setIsFetchingPage(false);
      }
    },
    [fetchPage],
  );

  const setRowCategory = useCallback((messageId: string, category: EmailCategory) => {
    setPageRows((prev) => {
      const next: Record<number, EmailReviewRow[]> = {};
      for (const [key, rows] of Object.entries(prev)) {
        next[Number(key)] = rows.map((row) =>
          row.id === messageId
            ? {
                ...row,
                category,
                reason: row.reason ? `${row.reason} · edited` : "edited",
                source: "user",
              }
            : row,
        );
      }
      return next;
    });
  }, []);

  const classifyPageRows = useCallback(
    async (page: number, rows: EmailReviewRow[]) => {
      const ids = rows.map((row) => row.id);
      const total = ids.length;
      let nextIndex = 0;
      let done = 0;
      setPageProgress((prev) =>
        prev.map((item) =>
          item.page === page ? { ...item, status: "categorizing", done: 0, total } : item,
        ),
      );

      const classifyOne = async (messageId: string) => {
        setPageRows((prev) => ({
          ...prev,
          [page]: (prev[page] ?? []).map((row) =>
            row.id === messageId ? { ...row, classifyStatus: "loading", classifyError: null } : row,
          ),
        }));

        try {
          const result = await classifyOneEmail(
            messageId,
            effectiveProvider !== "regex",
            effectiveProvider,
          );
          setPageRows((prev) => ({
            ...prev,
            [page]: (prev[page] ?? []).map((row) =>
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
          }));
        } catch (err) {
          const message = err instanceof MailApiError ? err.message : "Classify failed";
          setPageRows((prev) => ({
            ...prev,
            [page]: (prev[page] ?? []).map((row) =>
              row.id === messageId
                ? { ...row, classifyStatus: "error", classifyError: message }
                : row,
            ),
          }));
        } finally {
          done += 1;
          classifyDoneRef.current += 1;
          const globalDone = classifyDoneRef.current;
          setPageProgress((prev) =>
            prev.map((item) => (item.page === page ? { ...item, done, total } : item)),
          );
          setCategorizeProgress((prev) =>
            prev ? { ...prev, done: globalDone, total: Math.max(prev.total, globalDone) } : { done: globalDone, total: globalDone },
          );
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

      await Promise.all(
        Array.from({ length: Math.min(CLASSIFY_CONCURRENCY, total) }, () => worker()),
      );
      setPageProgress((prev) =>
        prev.map((item) => (item.page === page ? { ...item, status: "done", done: total, total } : item)),
      );
    },
    [effectiveProvider],
  );

  const categorizeAll = useCallback(async () => {
    if (totalPagesRef.current < 1 && !pageRowsRef.current[1]?.length) return;
    setIsCategorizing(true);
    setError(null);
    setPageProgress([]);
    classifyDoneRef.current = 0;
    setCategorizeProgress({ done: 0, total: Math.max(total, 0) });

    try {
      let page = 1;
      for (;;) {
        setCurrentPage(page);
        setPageProgress((prev) => {
          if (prev.some((item) => item.page === page)) return prev;
          return [
            ...prev,
            { page, status: "fetching", done: 0, total: pageRowsRef.current[page]?.length ?? UNREAD_PAGE_SIZE },
          ];
        });

        if (!pageRowsRef.current[page]?.length) {
          setIsFetchingPage(true);
          const inbox = await fetchPage(page);
          setIsFetchingPage(false);
          if (!inbox || !inbox.emails.length) {
            setTotalPages(Math.max(1, page - 1));
            break;
          }
        }

        const rows = pageRowsRef.current[page] ?? [];
        if (!rows.length) break;
        await classifyPageRows(page, rows);

        const nextToken = pageTokensRef.current[page + 1];
        if (!nextToken) {
          setTotalPages(page);
          totalPagesRef.current = page;
          break;
        }
        page += 1;
        setTotalPages((prev) => Math.max(prev, page));
        totalPagesRef.current = Math.max(totalPagesRef.current, page);
      }
    } catch (err) {
      const message = err instanceof MailApiError ? err.message : "Categorize failed.";
      setError(message);
    } finally {
      setIsFetchingPage(false);
      setIsCategorizing(false);
    }
  }, [classifyPageRows, fetchPage, total]);

  const allRows = useMemo(() => flattenPages(pageRows), [pageRows]);
  const rows = pageRows[currentPage] ?? [];

  const canSubmitAll = useMemo(() => {
    if (isCategorizing || isLoading) return false;
    if (!allRows.length) return false;
    const pagesNeeded = Math.max(totalPages, Object.keys(pageRows).length);
    if (pagesNeeded < 1) return false;
    for (let page = 1; page <= pagesNeeded; page += 1) {
      const pageList = pageRows[page];
      if (!pageList?.length) return false;
      if (pageList.some((row) => row.classifyStatus !== "done" && row.classifyStatus !== "error")) {
        return false;
      }
    }
    return allRows.some(labeledCategory);
  }, [allRows, isCategorizing, isLoading, pageRows, totalPages]);

  const submitLabels = useCallback(async (): Promise<ApplyLabelsResult | null> => {
    const toApply = flattenPages(pageRowsRef.current).filter(labeledCategory);
    const items = toApply.map((row) => ({ messageId: row.id, category: row.category }));

    if (!items.length) {
      setError(
        "Nothing to submit — set at least one email to BaharMil, oneSided, jobAds, pendingJobs, shopping, finTax, replySpam, Trash, or CICD.",
      );
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

      setPageRows((prev) => {
        const next: Record<number, EmailReviewRow[]> = {};
        for (const [key, list] of Object.entries(prev)) {
          next[Number(key)] = list.filter((row) => {
            if (row.category === "none") return true;
            if (appliedIds.has(row.id)) return false;
            return true;
          });
        }
        return next;
      });

      if (result.counts.errors > 0) {
        const firstError = result.results.find((row) => row.action === "error");
        const detail =
          firstError && typeof firstError.error === "string"
            ? firstError.error
            : `${result.counts.errors} failed`;
        setError(`Some labels failed to apply: ${detail}`);
      }

      if (appliedIds.size > 0 || errorIds.size === 0) {
        void refresh();
      }

      return result;
    } catch (err) {
      const message = err instanceof MailApiError ? err.message : "Could not apply labels.";
      setError(message);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    void refreshAiStatus();
    const timer = window.setInterval(() => {
      void refreshAiStatus();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [enabled, refresh, refreshAiStatus]);

  useEffect(() => {
    if (!classifyAiStatus) return;
    if (readStoredProvider()) return;
    if (classifyAiStatus.recommended !== classifyProvider) {
      setClassifyProvider(classifyAiStatus.recommended);
    }
  }, [classifyAiStatus, classifyProvider, setClassifyProvider]);

  return {
    gmailStatus,
    rows,
    allRows,
    fetchedAt,
    isLoading,
    isFetchingPage,
    isCategorizing,
    isSubmitting,
    categorizeProgress,
    pageProgress,
    currentPage,
    totalPages,
    total,
    pageSize: UNREAD_PAGE_SIZE,
    canSubmitAll,
    error,
    lastApply,
    classifyProvider,
    classifyAiStatus,
    effectiveProvider,
    setClassifyProvider,
    refresh,
    goToPage,
    categorizeAll,
    setRowCategory,
    submitLabels,
  };
}
