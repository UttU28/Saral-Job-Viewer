export const profileUpdatedEventName = "saralJobViewerProfileUpdated";

const cookieName = "saralJobViewer_profile";
const maxAgeSec = 60 * 60 * 24 * 365;

export type StoredProfile = {
  name: string;
  email: string;
  password: string;
};

export function readProfileFromCookie(): StoredProfile | null {
  if (typeof document === "undefined") return null;
  const prefix = `${cookieName}=`;
  const part = document.cookie.split("; ").find((row) => row.startsWith(prefix));
  if (!part) return null;
  const raw = part.slice(prefix.length);
  try {
    const json = decodeURIComponent(raw);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return {
      name: String(parsed.name ?? ""),
      email: String(parsed.email ?? ""),
      password: String(parsed.password ?? ""),
    };
  } catch {
    return null;
  }
}

export function writeProfileToCookie(profile: StoredProfile): void {
  if (typeof document === "undefined") return;
  const payload = encodeURIComponent(
    JSON.stringify({
      name: profile.name,
      email: profile.email,
      password: profile.password,
    }),
  );
  document.cookie = `${cookieName}=${payload}; path=/; max-age=${maxAgeSec}; SameSite=Lax`;
  window.dispatchEvent(new Event(profileUpdatedEventName));
}

export function getDisplayNameFromProfile(profile: StoredProfile | null): string | null {
  const trimmed = (profile?.name ?? "").trim();
  return trimmed ? trimmed : null;
}
