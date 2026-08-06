import { useCallback, useEffect, useState } from "react";
import {
  deleteNoiseCategoryMail,
  fetchNoiseCategoryCount,
  MailApiError,
  type NoiseCategoryCounts,
  type NoiseDeleteResult,
} from "@/lib/placetrack/mail-api";

type NoiseTrashState = {
  counts: NoiseCategoryCounts | null;
  isLoading: boolean;
  isDeleting: boolean;
  error: string | null;
  lastDelete: NoiseDeleteResult | null;
  refresh: () => Promise<void>;
  deleteAll: () => Promise<NoiseDeleteResult | null>;
};

export function useNoiseCategoryTrash(enabled: boolean): NoiseTrashState {
  const [counts, setCounts] = useState<NoiseCategoryCounts | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDelete, setLastDelete] = useState<NoiseDeleteResult | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      setCounts(await fetchNoiseCategoryCount());
    } catch (err) {
      setError(err instanceof MailApiError ? err.message : "Could not load Promotions/Social count.");
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  const deleteAll = useCallback(async (): Promise<NoiseDeleteResult | null> => {
    setIsDeleting(true);
    setError(null);
    try {
      // Trash via gmail.modify — batchDelete needs full mail.google.com scope and fails with 403.
      const result = await deleteNoiseCategoryMail(false);
      setLastDelete(result);
      setCounts({
        fetchedAt: result.fetchedAt,
        total: 0,
        categories: { promotions: 0, social: 0 },
      });
      // Re-count after delete in case anything remains
      try {
        setCounts(await fetchNoiseCategoryCount());
      } catch {
        // keep zeroed counts
      }
      return result;
    } catch (err) {
      setError(err instanceof MailApiError ? err.message : "Could not delete noise mail.");
      return null;
    } finally {
      setIsDeleting(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  return { counts, isLoading, isDeleting, error, lastDelete, refresh, deleteAll };
}
