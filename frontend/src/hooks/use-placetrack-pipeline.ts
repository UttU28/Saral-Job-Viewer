import { useCallback, useEffect, useState } from "react";
import {
  fetchPipelineContext,
  isPlaceTrackAuthError,
  loginPlaceTrack,
  PlaceTrackApiError,
} from "@/lib/placetrack/placetrack-api";
import { PLACETRACK_LOGIN } from "@/lib/placetrack/placetrack-credentials";
import {
  clearPlaceTrackJwtFromDb,
  getCachedPlaceTrackJwt,
  loadPlaceTrackJwtFromDb,
  persistPlaceTrackJwt,
} from "@/lib/placetrack/jwt-storage";
import { buildAccountEmailToPsName } from "@/lib/placetrack/ps-lookup";
import { buildVendorDomainLookup } from "@/lib/placetrack/vendor-lookup";

type PipelineState = {
  data: unknown;
  emailToPs: Map<string, string>;
  vendorDomainToCompany: Map<string, string>;
  isLoading: boolean;
  error: string | null;
  needsAuth: boolean;
  token: string | null;
};

let sharedPipelineCache: PipelineState | null = null;

function emptyPipelineState(): PipelineState {
  return {
    data: null,
    emailToPs: new Map(),
    vendorDomainToCompany: new Map(),
    isLoading: true,
    error: null,
    needsAuth: false,
    token: getCachedPlaceTrackJwt(),
  };
}

function initialPipelineState(): PipelineState {
  if (sharedPipelineCache?.data) {
    return { ...sharedPipelineCache, isLoading: false };
  }
  return emptyPipelineState();
}

function cachePipelineState(state: PipelineState): void {
  if (state.data) {
    sharedPipelineCache = state;
  }
}

function clearPipelineCache(): void {
  sharedPipelineCache = null;
}

export function usePlaceTrackPipeline() {
  const [state, setState] = useState<PipelineState>(initialPipelineState);

  const loadPipeline = useCallback(async (token: string) => {
    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      needsAuth: false,
      token,
    }));

    try {
      const { pipeline, users, psUsers, accounts, vendors } = await fetchPipelineContext(token);
      const emailToPs = buildAccountEmailToPsName(users, psUsers, accounts);
      const vendorDomainToCompany = buildVendorDomainLookup(vendors);

      setState({
        data: pipeline,
        emailToPs,
        vendorDomainToCompany,
        isLoading: false,
        error: null,
        needsAuth: false,
        token,
      });
      cachePipelineState({
        data: pipeline,
        emailToPs,
        vendorDomainToCompany,
        isLoading: false,
        error: null,
        needsAuth: false,
        token,
      });
    } catch (error) {
      if (isPlaceTrackAuthError(error)) {
        await clearPlaceTrackJwtFromDb();
        clearPipelineCache();
        setState({
          data: null,
          emailToPs: new Map(),
          vendorDomainToCompany: new Map(),
          isLoading: false,
          error: error instanceof PlaceTrackApiError ? error.message : "Authentication failed",
          needsAuth: true,
          token: null,
        });
        return;
      }

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load pipeline data",
      }));
    }
  }, []);

  const useSavedToken = useCallback(
    async (tokenFromInput: string) => {
      const token = tokenFromInput.trim();
      if (!token) {
        setState((prev) => ({
          ...prev,
          error: "Enter or fetch a JWT first.",
          needsAuth: true,
        }));
        return;
      }
      await persistPlaceTrackJwt(token);
      await loadPipeline(token);
    },
    [loadPipeline],
  );

  const fetchNewToken = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const token = await loginPlaceTrack(PLACETRACK_LOGIN.username, PLACETRACK_LOGIN.password);
      await persistPlaceTrackJwt(token);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: null,
        token,
        needsAuth: true,
      }));
      return token;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof PlaceTrackApiError ? error.message : "Failed to fetch JWT",
        needsAuth: true,
        token: getCachedPlaceTrackJwt(),
      }));
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    await clearPlaceTrackJwtFromDb();
    clearPipelineCache();
    setState({
      data: null,
      emailToPs: new Map(),
      vendorDomainToCompany: new Map(),
      isLoading: false,
      error: null,
      needsAuth: true,
      token: null,
    });
  }, []);

  const refresh = useCallback(async () => {
    const token = getCachedPlaceTrackJwt() ?? (await loadPlaceTrackJwtFromDb());
    if (token) {
      await loadPipeline(token);
      return;
    }

    setState((prev) => ({
      ...prev,
      isLoading: true,
      needsAuth: false,
      error: null,
    }));

    try {
      const fresh = await loginPlaceTrack(PLACETRACK_LOGIN.username, PLACETRACK_LOGIN.password);
      await persistPlaceTrackJwt(fresh);
      await loadPipeline(fresh);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        needsAuth: true,
        error:
          error instanceof PlaceTrackApiError
            ? error.message
            : "No saved JWT. Fetch one from the connect screen.",
        token: null,
      }));
    }
  }, [loadPipeline]);

  useEffect(() => {
    if (sharedPipelineCache?.data) {
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      try {
        const saved = await loadPlaceTrackJwtFromDb();
        if (cancelled) return;
        if (saved) {
          await loadPipeline(saved);
          return;
        }

        setState((prev) => ({
          ...prev,
          isLoading: true,
          error: null,
          needsAuth: false,
        }));

        const token = await loginPlaceTrack(PLACETRACK_LOGIN.username, PLACETRACK_LOGIN.password);
        if (cancelled) return;
        await persistPlaceTrackJwt(token);
        await loadPipeline(token);
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          needsAuth: true,
          error:
            error instanceof PlaceTrackApiError
              ? error.message
              : "Could not connect automatically. Fetch or paste a JWT.",
          token: getCachedPlaceTrackJwt(),
        }));
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadPipeline]);

  return {
    ...state,
    useSavedToken,
    fetchNewToken,
    logout,
    refresh,
  };
}
