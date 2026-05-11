import raw from "./devopsInterviewQuestions.json";

export type DevopsQuestionLevel = "beginner" | "intermediate" | "advanced";

export type DevopsInterviewQuestion = {
  id: string;
  level: DevopsQuestionLevel;
  question: string;
  answer: string;
  imageUrl?: string;
  imageAlt?: string;
};

type RawPayload = {
  source: string;
  note: string;
  questions: DevopsInterviewQuestion[];
};

const payload = raw as RawPayload;

/** Curated from roadmap.sh DevOps interview guide; see `source` on payload. */
export const DEVOPS_INTERVIEW_QUESTIONS: readonly DevopsInterviewQuestion[] = payload.questions;

export const DEVOPS_INTERVIEW_SOURCE_URL = payload.source;

export const DEVOPS_INTERVIEW_COUNT = DEVOPS_INTERVIEW_QUESTIONS.length;
