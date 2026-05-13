/**
 * Browser-only scan of job descriptions for years-of-experience style requirements.
 * Covers common recruiter phrasing (ranges, plus-syntax, "yr(s)", apostrophes, reversed order, etc.).
 */

const EXPERIENCE_SCANNERS: RegExp[] = [
  // Minimum / at least / more than … N … years … (experience)
  /\b(?:minimum|min\.|at\s+least|more\s+than|over|greater\s+than|no\s+less\s+than|a\s+minimum\s+of|minimum\s+of)\s+(?:of\s+)?(\d+\s*[-–—]\s*\d+|\d+\s*\+|\d+)\s*\+?\s*(?:years?|yrs?\.?)\s*(?:'|’)?(?:\s+of)?(?:\s+(?:relevant|related|professional|work|hands-on|direct|prior|industry))?[\s,]*(?:experienc[a-z]*|experien\b|experi[a-z]{3,})\b/gi,

  // N–M years … experience (incl. truncated "Experien", "experi…")
  /\b(\d+\s*[-–—]\s*\d+|\d+\s*\+|\d+)\s*\+?\s*(?:years?|yrs?\.?)\s*(?:'|’)(?:\s+of)?\s*(?:experienc[a-z]*|experien\b|experi[a-z]{3,})\b/gi,

  /\b(\d+\s*[-–—]\s*\d+|\d+\s*\+|\d+)\s*\+?\s*(?:years?|yrs?\.?)\s*(?:'|’)?(?:\s+of)?(?:\s+(?:relevant|related|professional|work|hands-on|direct))?[\s,]*(?:experienc[a-z]*|of\s+(?:experien\b|experi[a-z]{3,}))\b/gi,

  // N or more years […] experience
  /\b\d+\s+or\s+more\s+(?:years?|yrs?\.?)(?:\s+of)?(?:\s+(?:relevant|professional|work))?[\s,]*(?:experienc[a-z]*|experien\b|experi[a-z]{3,})\b/gi,

  // 1 yr or more experience (with …)
  /\b\d+\s*yrs?\.?\s+or\s+more\s+(?:experienc[a-z]*|experien\b|experi[a-z]{3,})\b/gi,

  // 3+ years of … (skill, DevOps, etc.)
  /\b\d+\s*\+\s*(?:years?|yrs?\.?)(?:'|’)?\s+of\b/gi,

  // between X and Y years [of … experience]
  /\bbetween\s+\d+\s+and\s+\d+\s+years?(?:\s+of)?(?:\s+(?:relevant|professional|work))?[\s,]*(?:experienc[a-z]*|experien\b|experi[a-z]{3,})?\b/gi,

  // Experience (optional punctuation) … N years
  /\bexperienc[a-z]*\s*[:-]?\s*(?:of|with)?\s*(?:at\s+least\s+|minimum\s+|a\s+minimum\s+of\s+)?(\d+\s*[-–—]\s*\d+|\d+\s*\+|\d+)\s*\+?\s*(?:years?|yrs?\.?)\b/gi,

  // N years in/with a similar / related role
  /\b(?:\d+\s*[-–—]\s*\d+|\d+\s*\+|\d+)\s*\+?\s*(?:years?|yrs?\.?)\s+(?:in|with)(?:\s+a)?\s+(?:similar|comparable|related|corresponding)\s+(?:role|position|field|environment|capacity)\b/gi,

  // Proven / solid … N years
  /\b(?:proven|solid|strong)\s+(?:track\s+record|background)(?:\s+with)?\s*(?:of\s+)?(\d+\s*[-–—]\s*\d+|\d+\s*\+|\d+)\s*\+?\s*(?:years?|yrs?\.?)\b/gi,

  // N+ years working / building / …
  /\b\d+\s*\+\s*(?:years?|yrs?\.?)\s+(?:working|developing|building|designing|shipping|leading|managing)\b/gi,

  // N months of experience
  /\b\d+\s*months?(?:\s+of)?\s+(?:experienc[a-z]*|experien\b|experi[a-z]{3,})\b/gi,

  // N+ years required / preferred
  /\b\d+\s*\+\s*(?:years?|yrs?\.?)\s+(?:required|preferred|desired|mandatory)\b/gi,

  // YoE shorthand (often without the word "years")
  /\b\d+\s*\+\s*(?:years?|yrs?\.?)\s*\(?yoe\)?\b/gi,
  /\b(?:yoe|y\.\s*o\.\s*e\.)\s*[:-]?\s*(?:\d+\s*[-–—]\s*\d+|\d+)\s*\+\b/gi,
  /\b(?:yoe|y\.\s*o\.\s*e\.)\s*[:-]?\s*(?:\d+\s*[-–—]\s*\d+|\d+)\s*(?:years?|yrs?\.?)\b/gi,
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
  for (const re of EXPERIENCE_SCANNERS) {
    const globalRe = toGlobalPattern(re);
    for (const m of Array.from(text.matchAll(globalRe))) {
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

function normalizeSnippet(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Unique matched snippets in document order (first occurrence wins for near-duplicates).
 */
export function findJobDescriptionExperienceTags(body: string | null | undefined): string[] {
  const text = body ?? "";
  if (!text.trim()) return [];

  const byKey = new Map<string, { index: number; display: string }>();
  for (const re of EXPERIENCE_SCANNERS) {
    const g = toGlobalPattern(re);
    for (const m of Array.from(text.matchAll(g))) {
      if (m.index === undefined) continue;
      const display = normalizeSnippet(m[0]);
      if (!display) continue;
      const key = display.toLowerCase();
      const prev = byKey.get(key);
      if (!prev || m.index < prev.index) {
        byKey.set(key, { index: m.index, display });
      }
    }
  }
  return Array.from(byKey.values())
    .sort((a, b) => a.index - b.index || a.display.localeCompare(b.display))
    .map((v) => v.display);
}

/** Largest integer from digit runs in a matched snippet (same heuristic as experience chips). */
export function maxNumericFromExperienceTag(tag: string): number | null {
  const nums = Array.from(tag.matchAll(/\d+/g))
    .map((m) => Number(m[0]))
    .filter((n) => Number.isFinite(n));
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

/** True when any parsed whole number in the tag is greater than five (e.g. 6+ years). */
export function experienceTagImpliesAboveFiveYears(tag: string): boolean {
  const hi = maxNumericFromExperienceTag(tag);
  return hi !== null && hi > 5;
}

/** True if any experience-style tag implies more than five years (aligns with backend pre-check). */
export function jobDescriptionImpliesExperienceAboveFive(body: string | null | undefined): boolean {
  for (const tag of findJobDescriptionExperienceTags(body)) {
    if (experienceTagImpliesAboveFiveYears(tag)) return true;
  }
  return false;
}
