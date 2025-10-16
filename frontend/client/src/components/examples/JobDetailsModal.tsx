import { useState } from "react";
import { JobDetailsModal } from "../JobDetailsModal";
import { Button } from "@/components/ui/button";
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
  jobDescription: "We're looking for a Senior Software Engineer to join our growing team. You'll work on cutting-edge technologies including React, Node.js, and AWS.\n\nRequirements:\n• 5+ years experience in full-stack development\n• Strong JavaScript skills\n• Experience with cloud platforms (AWS/GCP/Azure)\n• Knowledge of modern frontend frameworks (React, Vue, or Angular)\n• Experience with Node.js and RESTful APIs\n\nBenefits:\n• Competitive salary ($150k-$200k)\n• Health insurance\n• 401k matching\n• Flexible work hours\n• Remote-first culture",
  aiProcessed: true,
  aiTags: "javascript,react,nodejs,aws,senior,fullstack"
};

export default function JobDetailsModalExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="p-4">
      <Button onClick={() => setOpen(true)}>Open Job Details</Button>
      <JobDetailsModal
        open={open}
        onOpenChange={setOpen}
        job={mockJob}
        onBlacklistCompany={(company) => console.log("Blacklist:", company)}
      />
    </div>
  );
}
