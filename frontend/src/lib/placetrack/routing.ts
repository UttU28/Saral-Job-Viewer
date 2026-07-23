export const PLACETRACK_PIPELINE_PATH = "/placetrack";
export const PLACETRACK_MAIL_PATH = "/placetrack/mail";

export function isPlaceTrackMailLocation(location: string): boolean {
  return location.startsWith("/mail") || location.startsWith("/placetrack/mail");
}

export function mailBuilderLocation(email: string, name?: string): string {
  const params = new URLSearchParams();
  params.set("to", email.trim());
  const trimmedName = (name ?? "").trim();
  if (trimmedName) params.set("name", trimmedName);
  return `/mail?${params.toString()}`;
}

export function readMailBuilderParams(location: string): {
  to: string | null;
  name: string | null;
  gmailConnected: boolean;
} {
  const query =
    location.includes("?") ? location.slice(location.indexOf("?")) : window.location.search;
  const params = new URLSearchParams(query);
  return {
    to: params.get("to")?.trim() || null,
    name: params.get("name")?.trim() || null,
    gmailConnected: params.get("gmail") === "connected",
  };
}

export function clearMailBuilderQuery(): void {
  window.history.replaceState({}, "", PLACETRACK_MAIL_PATH);
}
