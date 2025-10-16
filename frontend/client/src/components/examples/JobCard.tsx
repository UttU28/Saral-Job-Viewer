import { JobCard } from "../JobCard";
import type { Job } from "@shared/schema";

const mockJob: Job = {
  id: "1",
  title: "Senior Software Engineer - Full Stack",
  companyName: "TechCorp Inc",
  location: "San Francisco, CA (Remote)",
  jobType: "Full-time",
  applied: "false",
  timeStamp: String(Math.floor(Date.now() / 1000) - 7200),
  link: "https://linkedin.com/jobs/view/123456789",
  jobDescription: "We're looking for a Senior Software Engineer to join our growing team. You'll work on cutting-edge technologies including React, Node.js, and AWS. Requirements: 5+ years experience, strong JavaScript skills, experience with cloud platforms.",
  aiProcessed: true,
  aiTags: "javascript,react,nodejs,aws,senior,fullstack"
};

export default function JobCardExample() {
  return (
    <div className="p-4">
      <JobCard 
        job={mockJob}
        onOpenDetails={(job) => console.log("Open details:", job)}
        onBlacklistCompany={(company) => console.log("Blacklist:", company)}
      />
    </div>
  );
}
