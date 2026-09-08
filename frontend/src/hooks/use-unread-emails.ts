import { useCallback, useEffect, useRef, useState } from "react";
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
  type SubmitProgress,
  type ClassifyProvider,
  type EmailCategory,
  type GmailStatus,
  type UnreadEmail,
  type UnreadInboxResult,
} from "@/lib/placetrack/mail-api";

/** Keep at most this many classify-one requests in flight. */
const CLASSIFY_CONCURRENCY = 8;
const UI_FLUSH_MS = 160;
const PROVIDER_STORAGE_KEY = "sjv-email-classify-provider";
export const UNREAD_PAGE_SIZE = 200;

export type EmailReviewRow = UnreadEmail & {
  category: EmailCategory;
  reason: string | null;
  source: string | null;
  classifyStatus: "idle" | "loading" | "done" | "error";
  classifyError?: string | null;
};

export type CategorizeProgress = {
  done: number;
  total: number;
  page: number;
  phase: "fetching" | "categorizing";
};

export type InboxMixCounts = {
  baharMil: number;
  oneSided: number;
  jobAds: number;
  pendingJobs: number;
  shopping: number;
  finTax: number;
  cicd: number;
  replySpam: number;
  trash: number;
  none: number;
  pending: number;
  classified: number;
  labeled: number;
  loaded: number;
};

export type { SubmitProgress };

type UnreadEmailsState = {
  gmailStatus: GmailStatus | null;
  rows: EmailReviewRow[];
  mixCounts: InboxMixCounts;
  fetchedAt: string | null;
  isLoading: boolean;
  isFetchingPage: boolean;
  isCategorizing: boolean;
  isSubmitting: boolean;
  categorizeProgress: CategorizeProgress | null;
  submitProgress: SubmitProgress | null;
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

function emptyMix(): InboxMixCounts {
  return {
    baharMil: 0,
    oneSided: 0,
    jobAds: 0,
    pendingJobs: 0,
    shopping: 0,
    finTax: 0,
    cicd: 0,
    replySpam: 0,
    trash: 0,
    none: 0,
    pending: 0,
    classified: 0,
    labeled: 0,
    loaded: 0,
  };
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
  const [visibleRows, setVisibleRows] = useState<EmailReviewRow[]>([]);
  const [mixCounts, setMixCounts] = useState<InboxMixCounts>(() => emptyMix());
  const [currentPage, setCurrentPageState] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPage, setIsFetchingPage] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categorizeProgress, setCategorizeProgress] = useState<CategorizeProgress | null>(null);
  const [submitProgress, setSubmitProgress] = useState<SubmitProgress | null>(null);
  const [canSubmitAll, setCanSubmitAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastApply, setLastApply] = useState<ApplyLabelsResult | null>(null);
  const [classifyProvider, setClassifyProviderState] = useState<ClassifyProvider>(
    () => readStoredProvider() ?? "local",
  );
  const [classifyAiStatus, setClassifyAiStatus] = useState<ClassifyAiStatus | null>(null);

  const pageRowsRef = useRef<Record<number, EmailReviewRow[]>>({});
  const pageTokensRef = useRef<Record<number, string | null>>({ 1: null });
  const totalPagesRef = useRef(0);
  const currentPageRef = useRef(1);
  const classifyDoneRef = useRef(0);
  const isCategorizingRef = useRef(false);
  const inflightPagesRef = useRef(new Map<number, Promise<UnreadInboxResult | null>>());
  const mixRef = useRef<InboxMixCounts>(emptyMix());
  const countedPagesRef = useRef(new Set<number>());
  const progressRef = useRef<CategorizeProgress | null>(null);
  const flushTimerRef = useRef<number | null>(null);

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

  const computeCanSubmit = useCallback(() => {
    if (isCategorizingRef.current) return false;
    if (mixRef.current.labeled < 1) return false;
    const last = Math.max(totalPagesRef.current, 1);
    for (let page = 1; page <= last; page += 1) {
      const list = pageRowsRef.current[page];
      if (!list?.length) return false;
      for (const row of list) {
        if (row.classifyStatus !== "done" && row.classifyStatus !== "error") return false;
      }
    }
    return true;
  }, []);

  const flushUi = useCallback(
    (immediate = false) => {
      const paint = () => {
        flushTimerRef.current = null;
        setVisibleRows(pageRowsRef.current[currentPageRef.current] ?? []);
        setMixCounts({ ...mixRef.current });
        setCategorizeProgress(progressRef.current);
        if (!isCategorizingRef.current) {
          setCanSubmitAll(computeCanSubmit());
        }
      };
      if (immediate) {
        if (flushTimerRef.current != null) {
          window.clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        paint();
        return;
      }
      if (flushTimerRef.current != null) return;
      flushTimerRef.current = window.setTimeout(paint, UI_FLUSH_MS);
    },
    [computeCanSubmit],
  );

  const setCurrentPage = useCallback(
    (page: number) => {
      currentPageRef.current = page;
      setCurrentPageState(page);
      flushUi(true);
    },
    [flushUi],
  );

  const noteLoadedPage = useCallback((page: number, rows: EmailReviewRow[]) => {
    if (countedPagesRef.current.has(page) || !rows.length) return;
    countedPagesRef.current.add(page);
    mixRef.current.pending += rows.length;
    mixRef.current.loaded += rows.length;
  }, []);

  const applyCategoryDelta = useCallback((row: EmailReviewRow, direction: 1 | -1) => {
    mixRef.current[row.category] += direction;
    if (labeledCategory(row)) mixRef.current.labeled += direction;
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
      const mapped = inbox.emails.map(toReviewRow);
      pageRowsRef.current = { ...pageRowsRef.current, [page]: mapped };
      noteLoadedPage(page, mapped);
      setFetchedAt(inbox.fetchedAt ?? null);
      const nextToken = inbox.nextPageToken || null;
      const nextTokens = { ...pageTokensRef.current };
      if (page === 1) nextTokens[1] = null;
      if (nextToken) nextTokens[page + 1] = nextToken;
      pageTokensRef.current = nextTokens;
      flushUi(page === currentPageRef.current);
    },
    [flushUi, noteLoadedPage],
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
        pageTokensRef.current = {
          ...pageTokensRef.current,
          ...(nextToken ? { [page + 1]: nextToken } : {}),
        };
      }
      return inbox;
    },
    [applyPageResult],
  );

  const ensurePageLoaded = useCallback(
    async (page: number): Promise<EmailReviewRow[]> => {
      const existing = pageRowsRef.current[page];
      if (existing?.length) return existing;

      let pending = inflightPagesRef.current.get(page);
      if (!pending) {
        pending = fetchPage(page).finally(() => {
          inflightPagesRef.current.delete(page);
        });
        inflightPagesRef.current.set(page, pending);
      }

      const inbox = await pending;
      return pageRowsRef.current[page] ?? inbox?.emails?.map(toReviewRow) ?? [];
    },
    [fetchPage],
  );

  const prefetchPage = useCallback(
    (page: number) => {
      if (page < 2) return;
      if (page > Math.max(totalPagesRef.current, 1)) return;
      if (pageRowsRef.current[page]?.length) return;
      if (inflightPagesRef.current.has(page)) return;
      void ensurePageLoaded(page);
    },
    [ensurePageLoaded],
  );

  const patchRow = useCallback((page: number, messageId: string, patch: Partial<EmailReviewRow>) => {
    const list = pageRowsRef.current[page];
    if (!list?.length) return null;
    const index = list.findIndex((row) => row.id === messageId);
    if (index < 0) return null;
    const prev = list[index];
    const nextRow = { ...prev, ...patch };
    const nextList = list.slice();
    nextList[index] = nextRow;
    pageRowsRef.current[page] = nextList;
    return { prev, next: nextRow };
  }, []);

  const refresh = useCallback(async () => {
    if (isCategorizingRef.current) return;
    setIsLoading(true);
    setError(null);
    setLastApply(null);
    progressRef.current = null;
    setCategorizeProgress(null);
    pageRowsRef.current = {};
    pageTokensRef.current = { 1: null };
    mixRef.current = emptyMix();
    countedPagesRef.current = new Set();
    setMixCounts(emptyMix());
    setVisibleRows([]);
    setCanSubmitAll(false);
    setCurrentPage(1);
    try {
      const status = await fetchGmailStatus();
      setGmailStatus(status);
      if (!status.connected) {
        setTotal(0);
        setTotalPages(0);
        totalPagesRef.current = 0;
        setFetchedAt(null);
        return;
      }

      const summary = await fetchUnreadPrimaryCount({ pageSize: UNREAD_PAGE_SIZE });
      const tokenMap: Record<number, string | null> = { 1: null };
      summary.pageTokens.forEach((token, index) => {
        tokenMap[index + 1] = token;
      });
      pageTokensRef.current = tokenMap;
      setTotal(summary.total);
      setTotalPages(summary.totalPages);
      totalPagesRef.current = summary.totalPages;
      setFetchedAt(summary.fetchedAt ?? null);
      setIsLoading(false);

      if (summary.totalPages < 1 || summary.total < 1) {
        return;
      }

      setIsFetchingPage(true);
      await fetchPage(1);
      setCurrentPage(1);
    } catch (err) {
      const message = err instanceof MailApiError ? err.message : "Could not load unread emails.";
      setError(message);
      pageRowsRef.current = {};
      setVisibleRows([]);
    } finally {
      setIsLoading(false);
      setIsFetchingPage(false);
      flushUi(true);
    }
  }, [fetchPage, flushUi, setCurrentPage]);

  const goToPage = useCallback(
    async (page: number) => {
      if (isCategorizingRef.current) return;
      if (page < 1) return;
      const last = Math.max(totalPagesRef.current, 1);
      if (page > last) return;
      if (pageRowsRef.current[page]?.length) {
        setCurrentPage(page);
        return;
      }
      setCurrentPage(page);
      setIsFetchingPage(true);
      setError(null);
      try {
        await fetchPage(page);
      } catch (err) {
        const message = err instanceof MailApiError ? err.message : "Could not load that page.";
        setError(message);
      } finally {
        setIsFetchingPage(false);
        flushUi(true);
      }
    },
    [fetchPage, flushUi, setCurrentPage],
  );

  const setRowCategory = useCallback(
    (messageId: string, category: EmailCategory) => {
      if (isCategorizingRef.current) return;
      for (const [key, list] of Object.entries(pageRowsRef.current)) {
        const page = Number(key);
        const found = list.find((row) => row.id === messageId);
        if (!found) continue;
        applyCategoryDelta(found, -1);
        const patched = patchRow(page, messageId, {
          category,
          reason: found.reason ? `${found.reason} · edited` : "edited",
          source: "user",
        });
        if (patched) applyCategoryDelta(patched.next, 1);
        flushUi(true);
        return;
      }
    },
    [applyCategoryDelta, flushUi, patchRow],
  );

  const classifyPageRows = useCallback(
    async (page: number, rows: EmailReviewRow[]) => {
      const ids = rows.map((row) => row.id);
      const total = ids.length;
      let nextIndex = 0;

      const classifyOne = async (messageId: string) => {
        patchRow(page, messageId, { classifyStatus: "loading", classifyError: null });
        if (page === currentPageRef.current) flushUi();

        try {
          const result = await classifyOneEmail(
            messageId,
            effectiveProvider !== "regex",
            effectiveProvider,
          );
          const patched = patchRow(page, messageId, {
            category: result.category,
            reason: result.reason ?? null,
            source: result.source ?? null,
            classifyStatus: "done",
            classifyError: null,
          });
          if (patched) {
            const mix = mixRef.current;
            if (patched.prev.classifyStatus === "idle" || patched.prev.classifyStatus === "loading") {
              mix.pending = Math.max(0, mix.pending - 1);
            }
            mix.classified += 1;
            applyCategoryDelta(patched.next, 1);
          }
        } catch (err) {
          const message = err instanceof MailApiError ? err.message : "Classify failed";
          const patched = patchRow(page, messageId, {
            classifyStatus: "error",
            classifyError: message,
          });
          if (patched && (patched.prev.classifyStatus === "idle" || patched.prev.classifyStatus === "loading")) {
            mixRef.current.pending = Math.max(0, mixRef.current.pending - 1);
          }
        } finally {
          classifyDoneRef.current += 1;
          if (progressRef.current) {
            progressRef.current = {
              ...progressRef.current,
              done: classifyDoneRef.current,
              total: Math.max(progressRef.current.total, classifyDoneRef.current),
              page,
              phase: "categorizing",
            };
          }
          flushUi();
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
      flushUi(true);
    },
    [applyCategoryDelta, effectiveProvider, flushUi, patchRow],
  );

  const categorizeAll = useCallback(async () => {
    if (isCategorizingRef.current) return;
    if (totalPagesRef.current < 1 && !pageRowsRef.current[1]?.length) return;
    isCategorizingRef.current = true;
    setIsCategorizing(true);
    setCanSubmitAll(false);
    setError(null);
    classifyDoneRef.current = 0;
    const inboxTotal = Math.max(total, 0);
    progressRef.current = { done: 0, total: inboxTotal, page: 1, phase: "categorizing" };
    flushUi(true);

    try {
      let page = 1;
      while (true) {
        const last = Math.max(totalPagesRef.current, 1);
        if (page > last) break;

        let rows = pageRowsRef.current[page] ?? [];
        if (!rows.length) {
          setCurrentPage(page);
          setIsFetchingPage(true);
          progressRef.current = {
            done: classifyDoneRef.current,
            total: Math.max(progressRef.current?.total ?? inboxTotal, inboxTotal),
            page,
            phase: "fetching",
          };
          flushUi(true);
          try {
            rows = await ensurePageLoaded(page);
            if (rows.length && !pageRowsRef.current[page]?.length) {
              pageRowsRef.current = { ...pageRowsRef.current, [page]: rows };
              noteLoadedPage(page, rows);
            }
            if (!rows.length) break;
          } finally {
            setIsFetchingPage(false);
          }
        } else {
          setCurrentPage(page);
        }

        prefetchPage(page + 1);

        const pending = rows.filter((row) => row.classifyStatus !== "done");
        if (pending.length) {
          progressRef.current = {
            done: classifyDoneRef.current,
            total: Math.max(progressRef.current?.total ?? inboxTotal, inboxTotal),
            page,
            phase: "categorizing",
          };
          flushUi(true);
          await classifyPageRows(page, pending);
        }

        page += 1;
      }
    } catch (err) {
      const message = err instanceof MailApiError ? err.message : "Categorize failed.";
      setError(message);
    } finally {
      isCategorizingRef.current = false;
      setIsCategorizing(false);
      setIsFetchingPage(false);
      flushUi(true);
    }
  }, [classifyPageRows, ensurePageLoaded, flushUi, noteLoadedPage, prefetchPage, setCurrentPage, total]);

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
    setSubmitProgress({ batch: 1, batches: 1, applied: 0, total: items.length });
    setError(null);
    try {
      const result = await applyEmailLabels({
        items,
        archive: true,
        markRead: true,
        onProgress: setSubmitProgress,
      });
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

      for (const [key, list] of Object.entries(pageRowsRef.current)) {
        pageRowsRef.current[Number(key)] = list.filter((row) => {
          if (row.category === "none") return true;
          if (appliedIds.has(row.id)) return false;
          return true;
        });
      }
      flushUi(true);

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
      setSubmitProgress(null);
    }
  }, [flushUi, refresh]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    void refreshAiStatus();
    const timer = window.setInterval(() => {
      void refreshAiStatus();
    }, 30_000);
    return () => {
      window.clearInterval(timer);
      if (flushTimerRef.current != null) window.clearTimeout(flushTimerRef.current);
    };
    // Only when the emails view is opened. Do not re-run when fetch helpers change
    // or categorization would wipe and reload the inbox mid-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (isCategorizingRef.current) return;
    if (!classifyAiStatus) return;
    if (readStoredProvider()) return;
    if (classifyAiStatus.recommended !== classifyProvider) {
      setClassifyProvider(classifyAiStatus.recommended);
    }
  }, [classifyAiStatus, classifyProvider, setClassifyProvider]);

  return {
    gmailStatus,
    rows: visibleRows,
    mixCounts,
    fetchedAt,
    isLoading,
    isFetchingPage,
    isCategorizing,
    isSubmitting,
    categorizeProgress,
    submitProgress,
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
