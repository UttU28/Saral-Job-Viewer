import { useCallback, useEffect, useState } from "react";
import {
  fetchMailTemplates,
  getCachedMailTemplates,
  setCachedMailTemplates,
  type MailTemplatesConfig,
} from "@/lib/placetrack/mail-templates";

type MailTemplatesState = {
  config: MailTemplatesConfig | null;
  isLoading: boolean;
  error: string | null;
};

function initialState(): MailTemplatesState {
  const cached = getCachedMailTemplates();
  return {
    config: cached,
    isLoading: !cached,
    error: null,
  };
}

export function useMailTemplates() {
  const [state, setState] = useState<MailTemplatesState>(initialState);

  const load = useCallback(async (force = false) => {
    if (!force && getCachedMailTemplates()) {
      setState({ config: getCachedMailTemplates(), isLoading: false, error: null });
      return getCachedMailTemplates();
    }

    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const config = await fetchMailTemplates({ force });
      setState({ config, isLoading: false, error: null });
      return config;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load mail templates";
      setState({ config: null, isLoading: false, error: message });
      return null;
    }
  }, []);

  useEffect(() => {
    if (!state.config) {
      void load();
    }
  }, [load, state.config]);

  const applyConfig = useCallback((config: MailTemplatesConfig) => {
    setCachedMailTemplates(config);
    setState({ config, isLoading: false, error: null });
  }, []);

  return {
    ...state,
    refresh: () => load(true),
    applyConfig,
  };
}
