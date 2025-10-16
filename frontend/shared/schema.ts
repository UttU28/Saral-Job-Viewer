import { z } from "zod";

// AI Analysis schema
export const aiAnalysisSchema = z.object({
  label: z.string(),
  suitability_score: z.number(),
  recommended_resume: z.string(),
  scoring_breakdown: z.object({
    category_core_tools: z.array(z.string()),
    matched_core_tools: z.array(z.string()),
    core_tool_points: z.number(),
    category_60_percent_bonus_applied: z.boolean(),
    experience_points: z.number(),
    raw_total_before_clamp: z.number(),
  }),
  matched_keywords: z.array(z.string()),
  unmatched_relevant_keywords: z.array(z.string()),
  experience_detected: z.object({
    years_text: z.string().nullable(),
    parsed_min_years: z.number().nullable(),
  }),
  salary_detected: z.object({
    salary_text: z.string().nullable(),
    parsed_min_annual_usd: z.number().nullable(),
    parsed_max_annual_usd: z.number().nullable(),
    pay_type: z.string(),
    currency: z.string(),
  }),
  seniority_detected: z.array(z.string()),
  work_auth_clearance_detected: z.union([z.array(z.string()), z.string()]),
  red_flags: z.array(z.union([z.string(), z.object({ flag: z.string() })])),
  redflag_companies: z.array(z.string()),
  rationale: z.string(),
  apply_decision: z.string(),
  person_specific_recommendations: z.array(z.string()),
});

export type AIAnalysis = z.infer<typeof aiAnalysisSchema>;

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
  aiTags: z.union([z.string(), aiAnalysisSchema]).optional(),
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
