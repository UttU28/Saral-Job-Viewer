import { useCallback, useEffect, useState } from "react";
import { fetchSentRecipients, MailApiError } from "@/lib/placetrack/mail-api";
import { buildSentRecipientSet, SENT_EMAILS_SINCE } from "@/lib/placetrack/sent-recipients";

type SentRecipientsState = {
  sentRecipients: Set<string>;
  isLoading: boolean;
  error: string | null;
  messageCount: number | null;
  refresh: (force?: boolean) => Promise<void>;
};

export function usePlaceTrackSentRecipients(enabled: boolean): SentRecipientsState {
  const [sentRecipients, setSentRecipients] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState<number | null>(null);

  const refresh = useCallback(
    async (force = false) => {
      if (!enabled) return;

      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchSentRecipients({
          since: SENT_EMAILS_SINCE,
          refresh: force,
        });
        setSentRecipients(buildSentRecipientSet(result.recipients));
        setMessageCount(result.messageCount ?? result.message_count ?? null);
      } catch (err) {
        if (err instanceof MailApiError && (err.status === 401 || err.status === 403)) {
          setSentRecipients(new Set());
          setMessageCount(null);
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : "Failed to load sent emails");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (enabled) {
      void refresh(false);
    } else {
      setSentRecipients(new Set());
      setMessageCount(null);
      setError(null);
    }
  }, [enabled, refresh]);

  return {
    sentRecipients,
    isLoading,
    error,
    messageCount,
    refresh,
  };
}
