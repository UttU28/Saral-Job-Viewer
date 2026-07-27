function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
}

function toArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    );
  }
  if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>;
    for (const key of ["items", "users", "data", "results", "accounts"]) {
      if (Array.isArray(record[key])) {
        return record[key] as Record<string, unknown>[];
      }
    }
  }
  return [];
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickId(record: Record<string, unknown>): string | null {
  return pickString(record, ["id", "ps_id", "ps_user_id", "user_id"]);
}

function buildPsNameById(psUsers: unknown): Map<string, string> {
  const map = new Map<string, string>();

  for (const ps of toArray(psUsers)) {
    const id = pickId(ps);
    const raw =
      pickString(ps, ["name", "full_name", "username", "display_name"]) ??
      pickString(ps, ["email"]);
    const name = formatPsName(raw);
    if (id && name) map.set(id, name);
  }

  return map;
}

function setEmailMapping(
  map: Map<string, string>,
  email: string | null,
  psName: string | null,
) {
  const normalized = normalizeEmail(email);
  if (normalized && psName) {
    map.set(normalized, psName);
  }
}

/** account email -> PS display name */
export function buildAccountEmailToPsName(
  users: unknown,
  psUsers: unknown,
  accounts?: unknown,
): Map<string, string> {
  const psNameById = buildPsNameById(psUsers);
  const emailToPs = new Map<string, string>();

  const resolvePsName = (psUserId: string | null): string | null => {
    if (!psUserId) return null;
    return psNameById.get(psUserId) ?? null;
  };

  // Accounts: email_address -> ps_user_id (primary path for pipeline account_email)
  for (const account of toArray(accounts)) {
    const email = pickString(account, [
      "email_address",
      "email",
      "account_email",
    ]);
    const psUserId = pickString(account, ["ps_user_id", "ps_id", "user_id"]);
    setEmailMapping(emailToPs, email, resolvePsName(psUserId));
  }

  // Admin users: email -> linked PS
  for (const user of toArray(users)) {
    const email = pickString(user, ["email", "email_address"]);
    const psUserId = pickString(user, ["ps_user_id", "ps_id"]);
    const userId = pickId(user);

    setEmailMapping(emailToPs, email, resolvePsName(psUserId));
    if (userId) {
      setEmailMapping(emailToPs, email, resolvePsName(userId));
    }
  }

  // PS users may also have emails pointing to themselves
  for (const ps of toArray(psUsers)) {
    const email = pickString(ps, ["email", "email_address"]);
    const raw =
      pickString(ps, ["name", "full_name", "username", "display_name"]) ??
      email;
    setEmailMapping(emailToPs, email, formatPsName(raw));
  }

  return emailToPs;
}

/** e.g. "john.doe" → "John Doe", "mary_jane" → "Mary Jane" */
export function formatPsName(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;

  return raw
    .trim()
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function lookupPsName(
  accountEmail: string | null | undefined,
  emailToPs: Map<string, string>,
): string | null {
  const normalized = normalizeEmail(accountEmail);
  if (!normalized) return null;
  const name = emailToPs.get(normalized) ?? null;
  return name ? formatPsName(name) : null;
}
