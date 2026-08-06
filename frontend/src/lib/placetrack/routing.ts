export const PLACETRACK_PIPELINE_PATH = "/placetrack";
export const PLACETRACK_MAIL_PATH = "/placetrack/mail";
/** Standalone Emails page (not under PlaceTrack). */
export const EMAILS_PATH = "/emails";
/** @deprecated use EMAILS_PATH */
export const PLACETRACK_EMAILS_PATH = EMAILS_PATH;

export type PlaceTrackTab = "pipeline" | "mail";

export function getPlaceTrackTab(location: string): PlaceTrackTab {
  if (location.startsWith("/mail") || location.startsWith("/placetrack/mail")) {
    return "mail";
  }
  return "pipeline";
}

export function isPlaceTrackMailLocation(location: string): boolean {
  return getPlaceTrackTab(location) === "mail";
}

export function isEmailsLocation(location: string): boolean {
  return location === EMAILS_PATH || location.startsWith(`${EMAILS_PATH}?`) || location.startsWith("/placetrack/emails");
}

export function mailBuilderLocation(email: string, name?: string): string {
  const params = new URLSearchParams();
  params.set("to", email.trim());
  const trimmedName = (name ?? "").trim();
  if (trimmedName) params.set("name", trimmedName);
  return `/placetrack/mail?${params.toString()}`;
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
