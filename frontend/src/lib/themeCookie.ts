const cookieName = "saralJobViewer_theme";
const maxAgeSec = 60 * 60 * 24 * 365;

export type ThemeMode = "dark" | "light";

export function readThemeFromCookie(): ThemeMode | null {
  if (typeof document === "undefined") return null;
  const prefix = `${cookieName}=`;
  const part = document.cookie.split("; ").find((row) => row.startsWith(prefix));
  if (!part) return null;
  const raw = part.slice(prefix.length).trim();
  if (raw === "light" || raw === "dark") return raw;
  return null;
}

export function writeThemeToCookie(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.cookie = `${cookieName}=${mode}; path=/; max-age=${maxAgeSec}; SameSite=Lax`;
}
