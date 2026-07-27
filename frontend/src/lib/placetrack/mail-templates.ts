export type MailTemplateCategory = {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
};

export type MailTemplate = {
  id: string;
  categoryId: string;
  name: string;
  style: string;
  description?: string | null;
  subject: string;
  body: string;
  sortOrder: number;
  isDefault?: boolean;
};

export type MailTemplatesConfig = {
  categories: MailTemplateCategory[];
  templates: MailTemplate[];
  defaultTemplateId: string;
};

let sharedMailTemplatesCache: MailTemplatesConfig | null = null;
let sharedMailTemplatesPromise: Promise<MailTemplatesConfig> | null = null;

function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  return base ? `${base}${path}` : path;
}

function normalizeCategory(raw: Record<string, unknown>): MailTemplateCategory {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    description: (raw.description as string | null | undefined) ?? null,
    sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0),
  };
}

function normalizeTemplate(raw: Record<string, unknown>): MailTemplate {
  return {
    id: String(raw.id ?? ""),
    categoryId: String(raw.categoryId ?? raw.category_id ?? ""),
    name: String(raw.name ?? ""),
    style: String(raw.style ?? raw.id ?? ""),
    description: (raw.description as string | null | undefined) ?? null,
    subject: String(raw.subject ?? ""),
    body: String(raw.body ?? ""),
    sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0),
    isDefault: Boolean(raw.isDefault ?? raw.is_default),
  };
}

export function normalizeMailTemplatesConfig(raw: Record<string, unknown>): MailTemplatesConfig {
  const categories = Array.isArray(raw.categories)
    ? (raw.categories as Record<string, unknown>[]).map(normalizeCategory)
    : [];
  const templates = Array.isArray(raw.templates)
    ? (raw.templates as Record<string, unknown>[]).map(normalizeTemplate)
    : [];
  const defaultTemplateId = String(raw.defaultTemplateId ?? raw.default_template_id ?? templates[0]?.id ?? "classic");
  return { categories, templates, defaultTemplateId };
}

export function getCachedMailTemplates(): MailTemplatesConfig | null {
  return sharedMailTemplatesCache;
}

export function setCachedMailTemplates(config: MailTemplatesConfig): void {
  sharedMailTemplatesCache = config;
}

export async function fetchMailTemplates(options?: { force?: boolean }): Promise<MailTemplatesConfig> {
  if (!options?.force && sharedMailTemplatesCache) {
    return sharedMailTemplatesCache;
  }
  if (!options?.force && sharedMailTemplatesPromise) {
    return sharedMailTemplatesPromise;
  }

  sharedMailTemplatesPromise = (async () => {
    const response = await fetch(apiUrl("/api/placetrack/mail-templates"));
    if (!response.ok) {
      throw new Error(`Failed to load mail templates (${response.status})`);
    }
    const config = normalizeMailTemplatesConfig((await response.json()) as Record<string, unknown>);
    sharedMailTemplatesCache = config;
    return config;
  })();

  try {
    return await sharedMailTemplatesPromise;
  } finally {
    sharedMailTemplatesPromise = null;
  }
}

/** Shorten a full name for email greetings (space-separated parts). */
export function formatRecipientSalutationName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "there";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0];
  return parts.slice(0, 2).join(" ");
}

export function applyMailPlaceholders(text: string, recipientName: string): string {
  const name = formatRecipientSalutationName(recipientName);
  return text.replace(/\[Recipient Name\]/g, name);
}

export function getTemplateById(config: MailTemplatesConfig, id: string): MailTemplate | undefined {
  return config.templates.find((template) => template.id === id);
}

export function getDefaultTemplate(config: MailTemplatesConfig): MailTemplate | undefined {
  return getTemplateById(config, config.defaultTemplateId) ?? config.templates[0];
}

export function getCategoryForTemplate(
  config: MailTemplatesConfig,
  template: MailTemplate,
): MailTemplateCategory | undefined {
  return config.categories.find((category) => category.id === template.categoryId);
}

export async function saveMailTemplates(config: MailTemplatesConfig): Promise<MailTemplatesConfig> {
  const response = await fetch(apiUrl("/api/placetrack/mail-templates"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    let message = `Failed to save mail templates (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  const saved = normalizeMailTemplatesConfig((await response.json()) as Record<string, unknown>);
  sharedMailTemplatesCache = saved;
  return saved;
}

export function updateTemplateInConfig(
  config: MailTemplatesConfig,
  templateId: string,
  updates: Pick<MailTemplate, "subject" | "body">,
): MailTemplatesConfig {
  return {
    ...config,
    templates: config.templates.map((template) =>
      template.id === templateId ? { ...template, ...updates } : template,
    ),
  };
}

export function isTemplateDraftDirty(
  template: MailTemplate | undefined,
  subject: string,
  body: string,
): boolean {
  if (!template) return false;
  return template.subject !== subject || template.body !== body;
}
