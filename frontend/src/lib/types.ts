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

export type Platform = "JobRight" | "GlassDoor" | "ZipRecruiter" | "Unknown";
export type PlatformFilter = Platform | "All";

export type Job = {
  jobId: string;
  title: string;
  jobUrl: string;
  location: string;
  employmentType: string;
  workModel: string;
  seniority: string;
  experience: string;
  originalJobPostUrl: string;
  companyName: string;
  jobDescription: string;
  timestamp: string;
  applyStatus: string;
  platform: Platform;
};

export type JobsResponse = {
  total: number;
  limit: number;
  offset: number;
  jobs: Job[];
};

