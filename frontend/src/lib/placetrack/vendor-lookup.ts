import type { PipelineItem } from "@/lib/placetrack/pipeline-types";

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const parts = email.trim().toLowerCase().split("@");
  return parts.length === 2 ? normalizeDomain(parts[1]) : null;
}

function asRecordList(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null,
    );
  }
  if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>;
    for (const key of ["items", "vendors", "data"]) {
      if (Array.isArray(record[key])) {
        return asRecordList(record[key]);
      }
    }
  }
  return [];
}

/** vendor email domain -> vendor company name */
export function buildVendorDomainLookup(vendors: unknown): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const vendor of asRecordList(vendors)) {
    const name = pickString(vendor, ["name", "vendor_company", "company"]);
    const domain = normalizeDomain(pickString(vendor, ["email_domain", "domain"]));
    if (name && domain) {
      lookup.set(domain, name);
    }
  }

  return lookup;
}

export function resolveVendorCompany(
  item: PipelineItem,
  domainToVendor: Map<string, string>,
): string | null {
  const fromPipeline = item.vendor_company?.trim();
  if (fromPipeline) return fromPipeline;

  const domain = emailDomain(item.vendor_email);
  if (domain && domainToVendor.has(domain)) {
    return domainToVendor.get(domain) ?? null;
  }

  return null;
}
