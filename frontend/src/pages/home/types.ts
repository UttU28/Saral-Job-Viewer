import type { JobDecision } from "@/lib/api";

/** Per-card Accept/Reject UI driven from Home (loading overlay + result strip). */
export type JobListCardDecisionUi = {
  loading: boolean;
  kind?: JobDecision;
  flash?: {
    variant: "success" | "error";
    message: string;
    detail?: string;
    applyStatus?: string | null;
  };
};

export type JobCardDecisionState =
  | null
  | { jobId: string; loading: true; kind: JobDecision }
  | {
      jobId: string;
      loading: false;
      flash:
        | { variant: "success"; message: string; applyStatus?: string | null }
        | { variant: "error"; message: string; detail: string };
    };
