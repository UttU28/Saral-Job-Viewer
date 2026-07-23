export type EmailSegment =
  | { type: "text"; value: string }
  | { type: "link"; href: string; label: string };

const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;

/** URLs, Email:, Phone: */
const CONTACT_PATTERN =
  /([A-Za-z][A-Za-z0-9 /&.-]{0,40}): (https?:\/\/\S+)|(https?:\/\/\S+)|(Phone:\s*((?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}))|(Email:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}))/gi;

function cleanUrl(url: string): string {
  return url.replace(/[.,;:!?)]+$/, "");
}

export function phoneToTelHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  return `tel:+${digits}`;
}

/** Plain-text body for mailto / compose URLs */
export function buildFinalEmailBody(body: string): string {
  return body.replace(MARKDOWN_LINK, "$1: $2").trim();
}

export function parseEmailBodySegments(text: string): EmailSegment[] {
  const normalized = buildFinalEmailBody(text);
  const segments: EmailSegment[] = [];
  let cursor = 0;

  CONTACT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CONTACT_PATTERN.exec(normalized)) !== null) {
    if (match.index > cursor) {
      segments.push({ type: "text", value: normalized.slice(cursor, match.index) });
    }

    if (match[1] && match[2]) {
      const href = cleanUrl(match[2]);
      segments.push({ type: "text", value: `${match[1].trim()}: ` });
      segments.push({ type: "link", href, label: href });
    } else if (match[3]) {
      const href = cleanUrl(match[3]);
      segments.push({ type: "link", href, label: href });
    } else if (match[4] && match[5]) {
      const display = match[5].trim();
      segments.push({ type: "text", value: "Phone: " });
      segments.push({
        type: "link",
        href: phoneToTelHref(display),
        label: display,
      });
    } else if (match[6] && match[7]) {
      const address = match[7].trim();
      segments.push({ type: "text", value: "Email: " });
      segments.push({
        type: "link",
        href: `mailto:${address}`,
        label: address,
      });
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < normalized.length) {
    segments.push({ type: "text", value: normalized.slice(cursor) });
  }

  return segments;
}
