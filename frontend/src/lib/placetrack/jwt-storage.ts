import { deletePlaceTrackJwt, fetchPlaceTrackJwt, savePlaceTrackJwt } from "@/lib/api";

let cachedJwt: string | null = null;

export function getCachedPlaceTrackJwt(): string | null {
  return cachedJwt;
}

export async function loadPlaceTrackJwtFromDb(): Promise<string | null> {
  const response = await fetchPlaceTrackJwt();
  cachedJwt = response.token?.trim() || null;
  return cachedJwt;
}

export async function persistPlaceTrackJwt(token: string): Promise<void> {
  const trimmed = token.trim();
  await savePlaceTrackJwt(trimmed);
  cachedJwt = trimmed;
}

export async function clearPlaceTrackJwtFromDb(): Promise<void> {
  await deletePlaceTrackJwt();
  cachedJwt = null;
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
