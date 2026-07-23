import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGmailStatus, startGmailAuth, type GmailStatus } from "@/lib/placetrack/mail-api";

type GmailAuthState = {
  status: GmailStatus | null;
  isLoading: boolean;
  needsConnect: boolean;
  check: () => Promise<GmailStatus | null>;
  connect: () => void;
};

function needsGmailConnect(status: GmailStatus | null): boolean {
  if (!status?.configured) return false;
  return Boolean(status.needsReauth || !status.connected);
}

export function usePlaceTrackGmailAuth(enabled: boolean, autoStart = true, returnTo = "/placetrack"): GmailAuthState {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const autoStarted = useRef(false);

  const check = useCallback(async (): Promise<GmailStatus | null> => {
    setIsLoading(true);
    try {
      const next = await fetchGmailStatus();
      setStatus(next);
      return next;
    } catch {
      setStatus({ configured: false, connected: false, email: null, needsReauth: false });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const connect = useCallback(() => {
    startGmailAuth(returnTo);
  }, [returnTo]);

  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      autoStarted.current = false;
      return;
    }

    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const gmailConnected = params.get("gmail") === "connected";
      if (gmailConnected) {
        window.history.replaceState({}, "", window.location.pathname);
      }

      const next = await check();
      if (autoStart && !autoStarted.current && next && needsGmailConnect(next) && !gmailConnected) {
        autoStarted.current = true;
        connect();
      }
    })();
  }, [enabled, check, connect, autoStart]);

  return {
    status,
    isLoading,
    needsConnect: enabled && needsGmailConnect(status),
    check,
    connect,
  };
}
