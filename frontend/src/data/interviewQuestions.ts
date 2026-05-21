import cloudComputingRaw from "./cloudComputingInterviewQuestions.json";
import cloudEngineerRaw from "./cloudEngineerInterviewQuestions.json";
import devops2Raw from "./devops2InterviewQuestions.json";
import devops1Raw from "./devopsInterviewQuestions.json";
import terraformRaw from "./terraformInterviewQuestions.json";

export type InterviewQuestionLevel = "beginner" | "intermediate" | "advanced" | "others";

export type InterviewQuestion = {
  id: string;
  level: InterviewQuestionLevel;
  question: string;
  answer: string;
  imageUrl?: string;
  imageAlt?: string;
};

type RawPayload = {
  source: string;
  note: string;
  questions: InterviewQuestion[];
};

export type InterviewCategoryId =
  | "devops-1"
  | "devops-2"
  | "terraform"
  | "cloud-computing"
  | "cloud-engineer";

export type InterviewCategory = {
  id: InterviewCategoryId;
  label: string;
  /** Page heading, e.g. "DevOps flashcards" */
  title: string;
  sourceUrl?: string;
  sourceNote?: string;
  questions: readonly InterviewQuestion[];
};

function loadPayload(raw: RawPayload): InterviewQuestion[] {
  return raw.questions;
}

const devops1Payload = devops1Raw as RawPayload;
const devops2Payload = devops2Raw as RawPayload;
const terraformPayload = terraformRaw as RawPayload;
const cloudComputingPayload = cloudComputingRaw as RawPayload;
const cloudEngineerPayload = cloudEngineerRaw as RawPayload;

/** All interview categories; order is UI tab order. */
export const INTERVIEW_CATEGORIES: readonly InterviewCategory[] = [
  {
    id: "devops-1",
    label: "DevOps 1",
    title: "DevOps flashcards",
    sourceUrl: devops1Payload.source || undefined,
    sourceNote: devops1Payload.note,
    questions: loadPayload(devops1Payload),
  },
  {
    id: "devops-2",
    label: "DevOps 2",
    title: "DevOps flashcards (DataCamp)",
    sourceUrl: devops2Payload.source || undefined,
    sourceNote: devops2Payload.note,
    questions: loadPayload(devops2Payload),
  },
  {
    id: "terraform",
    label: "Terraform",
    title: "Terraform flashcards",
    sourceUrl: terraformPayload.source || undefined,
    sourceNote: terraformPayload.note,
    questions: loadPayload(terraformPayload),
  },
  {
    id: "cloud-computing",
    label: "Cloud Computing",
    title: "Cloud Computing flashcards",
    sourceUrl: cloudComputingPayload.source || undefined,
    sourceNote: cloudComputingPayload.note,
    questions: loadPayload(cloudComputingPayload),
  },
  {
    id: "cloud-engineer",
    label: "Cloud Engineer",
    title: "Cloud Engineer flashcards",
    sourceUrl: cloudEngineerPayload.source || undefined,
    sourceNote: cloudEngineerPayload.note,
    questions: loadPayload(cloudEngineerPayload),
  },
] as const;

export const DEFAULT_INTERVIEW_CATEGORY_ID: InterviewCategoryId = "devops-1";

export function getInterviewCategory(id: InterviewCategoryId): InterviewCategory {
  const cat = INTERVIEW_CATEGORIES.find((c) => c.id === id);
  if (!cat) {
    return INTERVIEW_CATEGORIES[0];
  }
  return cat;
}

/** @deprecated Use INTERVIEW_CATEGORIES and getInterviewCategory — kept for any external imports */
export {
  type InterviewQuestion as DevopsInterviewQuestion,
  type InterviewQuestionLevel as DevopsQuestionLevel,
};
export const DEVOPS_INTERVIEW_QUESTIONS = getInterviewCategory("devops-1").questions;
export const DEVOPS_INTERVIEW_SOURCE_URL = getInterviewCategory("devops-1").sourceUrl ?? "";
export const DEVOPS_INTERVIEW_COUNT = DEVOPS_INTERVIEW_QUESTIONS.length;
