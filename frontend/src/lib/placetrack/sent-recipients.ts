export const SENT_EMAILS_SINCE = "2026-07-20";

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : null;
}

export function buildSentRecipientSet(recipients: string[]): Set<string> {
  const set = new Set<string>();
  for (const email of recipients) {
    const normalized = normalizeEmail(email);
    if (normalized) set.add(normalized);
  }
  return set;
}

export function isSentVendor(
  vendorEmail: string | null | undefined,
  sentRecipients: Set<string>,
): boolean {
  const normalized = normalizeEmail(vendorEmail);
  return normalized ? sentRecipients.has(normalized) : false;
}
