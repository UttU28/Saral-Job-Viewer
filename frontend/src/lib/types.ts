import { z } from "zod";

export const insertItemSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  category: z.string().min(1, "Category is required"),
});

export type InsertItem = z.infer<typeof insertItemSchema>;

export type Item = {
  id: number;
  title: string;
  description: string;
  category: string;
};

/** Mongo jobData row (list payload omits jobDescription). */
export type JobRow = {
  jobId: string | null;
  title: string | null;
  jobUrl: string | null;
  location: string | null;
  employmentType: string | null;
  workModel: string | null;
  seniority: string | null;
  experience: string | null;
  originalJobPostUrl: string | null;
  companyName: string | null;
  timestamp: string | null;
  applyStatus: string | null;
  platform: string | null;
  jobDescription?: string;
};

export type JobListResponse = {
  items: JobRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type JobSummary = {
  total: number;
  nullPending: number;
  apply: number;
  doNotApply: number;
  existing: number;
  otherStatus: number;
  pastDataRows: number;
};

