export type PipelineThread = {
  thread_id: string;
  subject: string;
  status: string;
  rate: string | null;
  role_discussed: string;
  last_activity_at: string;
  message_count: number;
};

export type PipelineItem = {
  id: string;
  canonical_role: string;
  client_company: string | null;
  status: string;
  rate: string | null;
  vendor_name: string;
  vendor_email: string;
  vendor_company: string;
  account_name: string;
  account_email: string;
  technology_name: string;
  last_activity_at: string;
  thread_count: number;
  threads: PipelineThread[];
};

function parseThreads(raw: unknown): PipelineThread[] {
  if (Array.isArray(raw)) {
    return raw as PipelineThread[];
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as PipelineThread[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isPipelineItem(value: unknown): value is PipelineItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.canonical_role === "string" && "threads" in item;
}

export function normalizePipelineData(data: unknown): PipelineItem[] {
  let items: unknown[] = [];

  if (Array.isArray(data)) {
    items = data;
  } else if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.items)) items = record.items;
    else if (Array.isArray(record.pipeline)) items = record.pipeline;
    else if (Array.isArray(record.data)) items = record.data;
  }

  return items.filter(isPipelineItem).map((item) => ({
    ...item,
    client_company: item.client_company || null,
    rate: item.rate || null,
    threads: parseThreads(item.threads),
  }));
}
