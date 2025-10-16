import { z } from "zod";

// Job schema based on API specification
export const jobSchema = z.object({
  id: z.string(),
  title: z.string(),
  companyName: z.string(),
  location: z.string(),
  jobType: z.string(),
  applied: z.string(),
  timeStamp: z.string(),
  link: z.string(),
  jobDescription: z.string(),
  aiProcessed: z.boolean().optional(),
  aiTags: z.string().optional(),
});

export type Job = z.infer<typeof jobSchema>;

// Keyword schema based on API specification
export const keywordSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum(["SearchList", "NoCompany"]),
  created_at: z.string().optional(),
});

export type Keyword = z.infer<typeof keywordSchema>;

export const insertKeywordSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["SearchList", "NoCompany"]),
});

export type InsertKeyword = z.infer<typeof insertKeywordSchema>;
