import type { Job, Keyword, InsertKeyword } from "@shared/schema";

export interface IStorage {
  // Job operations
  getAllJobs(): Promise<Job[]>;
  getJobsByTimeFilter(hours: number): Promise<Job[]>;

  // Keyword operations
  getKeywords(): Promise<Keyword[]>;
  addKeyword(keyword: InsertKeyword): Promise<Keyword>;
  removeKeyword(id: number): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private jobs: Map<string, Job>;
  private keywords: Map<number, Keyword>;
  private keywordIdCounter: number;

  constructor() {
    this.jobs = new Map();
    this.keywords = new Map();
    this.keywordIdCounter = 1;
  }

  async getAllJobs(): Promise<Job[]> {
    return Array.from(this.jobs.values());
  }

  async getJobsByTimeFilter(hours: number): Promise<Job[]> {
    const now = Math.floor(Date.now() / 1000);
    const filterSeconds = hours * 3600;

    return Array.from(this.jobs.values()).filter(job => {
      const diff = now - parseInt(job.timeStamp);
      return diff <= filterSeconds;
    });
  }

  async getKeywords(): Promise<Keyword[]> {
    return Array.from(this.keywords.values());
  }

  async addKeyword(insertKeyword: InsertKeyword): Promise<Keyword> {
    const id = this.keywordIdCounter++;
    const keyword: Keyword = {
      ...insertKeyword,
      id,
      created_at: new Date().toISOString()
    };
    this.keywords.set(id, keyword);
    return keyword;
  }

  async removeKeyword(id: number): Promise<boolean> {
    return this.keywords.delete(id);
  }
}

export const storage = new MemStorage();