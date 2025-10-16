import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertKeywordSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // GET /api/getAllJobs - Returns all jobs from the database
  app.get("/api/getAllJobs", async (req, res) => {
    try {
      const jobs = await storage.getAllJobs();
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // POST /api/getHoursOfData - Returns jobs filtered by time period
  app.post("/api/getHoursOfData", async (req, res) => {
    try {
      const { hours } = req.body;
      
      if (typeof hours !== 'number' || hours <= 0) {
        return res.status(400).json({ error: "Invalid hours parameter" });
      }

      const jobs = await storage.getJobsByTimeFilter(hours);
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching filtered jobs:", error);
      res.status(500).json({ error: "Failed to fetch filtered jobs" });
    }
  });

  // GET /api/getKeywords - Returns all keywords for management
  app.get("/api/getKeywords", async (req, res) => {
    try {
      const keywords = await storage.getKeywords();
      res.json(keywords);
    } catch (error) {
      console.error("Error fetching keywords:", error);
      res.status(500).json({ error: "Failed to fetch keywords" });
    }
  });

  // POST /api/addKeyword - Adds a new keyword
  app.post("/api/addKeyword", async (req, res) => {
    try {
      const validationResult = insertKeywordSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid keyword data",
          status: "error",
          errors: validationResult.error.errors
        });
      }

      const keyword = await storage.addKeyword(validationResult.data);
      res.json({
        message: "Keyword added successfully",
        status: "success",
        id: keyword.id
      });
    } catch (error) {
      console.error("Error adding keyword:", error);
      res.status(500).json({ 
        message: "Failed to add keyword",
        status: "error"
      });
    }
  });

  // POST /api/removeKeyword - Removes a keyword by ID
  app.post("/api/removeKeyword", async (req, res) => {
    try {
      const { id } = req.body;
      
      if (typeof id !== 'number') {
        return res.status(400).json({ 
          message: "Invalid keyword ID",
          status: "error"
        });
      }

      const removed = await storage.removeKeyword(id);
      
      if (removed) {
        res.json({
          message: "Keyword removed successfully",
          status: "success"
        });
      } else {
        res.status(404).json({
          message: "Keyword not found",
          status: "error"
        });
      }
    } catch (error) {
      console.error("Error removing keyword:", error);
      res.status(500).json({ 
        message: "Failed to remove keyword",
        status: "error"
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
