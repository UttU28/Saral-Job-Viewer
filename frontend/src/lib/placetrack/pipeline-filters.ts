import type { PipelineItem } from "@/lib/placetrack/pipeline-types";
import { isSentVendor } from "@/lib/placetrack/sent-recipients";

export type PipelineFilters = {
  search: string;
  status: string;
  technology: string;
  sortSentFirst: boolean;
};

export const DEFAULT_FILTERS: PipelineFilters = {
  search: "",
  status: "all",
  technology: "AZ",
  sortSentFirst: true,
};

const FILTER_STORAGE_KEY = "placetrack_pipeline_filters";

export function loadSavedFilters(): PipelineFilters {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Partial<PipelineFilters>;
    return {
      search: parsed.search ?? DEFAULT_FILTERS.search,
      status: parsed.status ?? DEFAULT_FILTERS.status,
      technology: parsed.technology ?? DEFAULT_FILTERS.technology,
      sortSentFirst: parsed.sortSentFirst ?? DEFAULT_FILTERS.sortSentFirst,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function saveFilters(filters: PipelineFilters): void {
  localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
}

export function getTechnologyOptions(items: PipelineItem[]): string[] {
  return Array.from(
    new Set(items.map((item) => item.technology_name).filter(Boolean)),
  ).sort();
}

export function getStatusOptions(items: PipelineItem[]): string[] {
  return Array.from(new Set(items.map((item) => item.status.toLowerCase()))).sort();
}

export function filterPipelineItems(
  items: PipelineItem[],
  filters: PipelineFilters,
  sentRecipients?: Set<string>,
): PipelineItem[] {
  const search = filters.search.trim().toLowerCase();

  return items
    .filter((item) => {
      if (filters.status !== "all" && item.status.toLowerCase() !== filters.status) {
        return false;
      }

      if (filters.technology !== "all" && item.technology_name !== filters.technology) {
        return false;
      }

      if (!search) return true;

      const haystack = [
        item.canonical_role,
        item.client_company,
        item.vendor_name,
        item.vendor_company,
        item.vendor_email,
        item.technology_name,
        item.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    })
    .sort((a, b) => {
      if (filters.sortSentFirst && sentRecipients && sentRecipients.size > 0) {
        const aSent = isSentVendor(a.vendor_email, sentRecipients);
        const bSent = isSentVendor(b.vendor_email, sentRecipients);
        if (aSent !== bSent) {
          return aSent ? -1 : 1;
        }
      }

      return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
    });
}
