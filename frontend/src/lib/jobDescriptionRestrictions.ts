/**
 * Local-only scan of job description text for common eligibility / sponsorship / clearance phrases.
 * All matching runs in the browser; nothing is sent to the server.
 */

const SCANNERS: { re: RegExp; label: string }[] = [
  { re: /\bu\.?\s*s\.?\s*citizen\b/i, label: "US citizen" },
  { re: /\bcitizenship\b/i, label: "Citizenship" },
  { re: /\blawful\s+permanent\s+resident\b|\bpermanent\s+resident\b|\bgreen\s+card\b/i, label: "Permanent resident / green card" },
  { re: /\bauthorized\s+to\s+work\b/i, label: "Authorized to work" },
  { re: /\bwork\s+authorization\b/i, label: "Work authorization" },
  { re: /\bemployment\s+authorization\b/i, label: "Employment authorization" },
  { re: /\beligible\s+to\s+work\s+(?:in\s+)?(?:the\s+)?u\.?s\.?\b/i, label: "Eligible to work (US)" },
  { re: /\bi-9\b|\be-?verify\b/i, label: "I-9 / E-Verify" },
  { re: /\btop\s+secret\b|\bt\/s\b|\bts\/sci\b/i, label: "Top secret / TS" },
  { re: /\bsecret\s+clearance\b/i, label: "Secret clearance" },
  { re: /\bpublic\s+trust\b/i, label: "Public trust" },
  { re: /\bclearance\b/i, label: "Clearance" },
  { re: /\bwill\s+not\s+sponsor\b|\bdoes\s+not\s+sponsor\b|\bunable\s+to\s+sponsor\b|\bcannot\s+sponsor\b/i, label: "Not sponsoring" },
  { re: /\bno\s+visa\s+sponsorship\b|\bnot\s+offering\s+sponsorship\b|\bwithout\s+sponsorship\b/i, label: "No visa sponsorship" },
  { re: /\bh-?1b\b|\bh1-b\b/i, label: "H-1B mentioned" },
  { re: /\bvisa\s+sponsorship\b/i, label: "Visa sponsorship" },
  { re: /\bsolely\s+authorized\b|\bonly\s+authorized\b/i, label: "Authorization restriction" },
  { re: /\b(?:must|required\s+to)\s+be\s+eligible\b/i, label: "Eligibility requirement" },
];

function toGlobalPattern(re: RegExp): RegExp {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  return new RegExp(re.source, flags);
}

function mergeIntervals(ranges: { start: number; end: number }[]): { start: number; end: number }[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  let cur = { ...sorted[0] };
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i];
    if (n.start <= cur.end) {
      cur.end = Math.max(cur.end, n.end);
    } else {
      out.push(cur);
      cur = { ...n };
    }
  }
  out.push(cur);
  return out;
}

function collectMatchRanges(text: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  for (const { re } of SCANNERS) {
    const globalRe = toGlobalPattern(re);
    const matches = Array.from(text.matchAll(globalRe));
    for (const m of matches) {
      if (m.index !== undefined) {
        ranges.push({ start: m.index, end: m.index + m[0].length });
      }
    }
  }
  return mergeIntervals(ranges);
}

export type DescriptionHighlightSegment = {
  text: string;
  highlight: boolean;
};

/**
 * Split description into plain / highlighted spans for inline <mark> rendering inside <pre>.
 */
export function buildDescriptionHighlightSegments(body: string | null | undefined): DescriptionHighlightSegment[] {
  const text = body ?? "";
  if (!text) return [{ text: "", highlight: false }];

  const ranges = collectMatchRanges(text);
  if (ranges.length === 0) return [{ text, highlight: false }];

  const out: DescriptionHighlightSegment[] = [];
  let pos = 0;
  for (const r of ranges) {
    if (r.start > pos) {
      out.push({ text: text.slice(pos, r.start), highlight: false });
    }
    out.push({ text: text.slice(r.start, r.end), highlight: true });
    pos = r.end;
  }
  if (pos < text.length) {
    out.push({ text: text.slice(pos), highlight: false });
  }
  return out;
}

/**
 * Returns unique labels for every scanner that matches `body` (case-insensitive).
 */
export function findJobDescriptionRestrictionTags(body: string | null | undefined): string[] {
  const text = body ?? "";
  if (!text.trim()) return [];

  const labels = new Set<string>();
  for (const { re, label } of SCANNERS) {
    const g = toGlobalPattern(re);
    if (Array.from(text.matchAll(g)).length > 0) labels.add(label);
  }
  if (
    labels.has("Clearance") &&
    (labels.has("Secret clearance") ||
      labels.has("Top secret / TS") ||
      labels.has("Public trust"))
  ) {
    labels.delete("Clearance");
  }
  return Array.from(labels).sort((a, b) => a.localeCompare(b));
}
