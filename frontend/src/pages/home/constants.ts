export const ALL_VALUE = "__all__";
export const PAGE_SIZE = 18;
export const DEFAULT_APPLY_FILTER = "APPLY";

export const APPLY_OPTIONS = [
  { value: ALL_VALUE, label: "All statuses" },
  { value: "pending", label: "Pending (no status)" },
  { value: DEFAULT_APPLY_FILTER, label: "APPLY" },
  { value: "DO_NOT_APPLY", label: "DO NOT APPLY" },
  { value: "EXISTING", label: "EXISTING" },
  { value: "APPLIED", label: "APPLIED" },
  { value: "REDO", label: "REDO" },
  { value: "REJECTED", label: "REJECTED" },
] as const;

/** Meta accents: on dark, use mid pastels (300/200) so blues never read as “ink on black”. */
export const pastelMetaLineClasses = [
  "text-indigo-800/90 dark:text-indigo-300",
  "text-sky-800/88 dark:text-sky-300",
  "text-emerald-800/88 dark:text-emerald-300",
  "text-amber-900/85 dark:text-amber-200",
] as const;
