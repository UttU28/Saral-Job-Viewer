export interface Job {
  id: string;
  link: string;
  title: string;
  companyName: string;
  location: string;
  method: string;
  timeStamp: string;
  jobType: string;
  jobDescription: string;
  applied: string;
  matchScore?: number;
  matches?: boolean;
}

export const sampleJobs: Job[] = [
  {
    "id": "4128645270",
    "link": "https://www.linkedin.com/jobs/view/4128645270",
    "title": "AWS Cloud Architect",
    "companyName": "General Dynamics Information Technology",
    "location": "Bethesda, MD (On-site)",
    "method": "EasyApply",
    "timeStamp": "2 days ago",
    "jobType": "FullTime",
    "jobDescription": "We are GDIT. \n We stay at the forefront of innovation to solve complex technical challenges. Looking for an experienced AWS Cloud Architect to join our team...",
    "applied": "NO"
  },
  {
    "id": "4128653307",
    "link": "https://www.linkedin.com/jobs/view/4128653307",
    "title": "Platform Engineer",
    "companyName": "Premier Group",
    "location": "Dallas, TX (On-site)",
    "method": "Manual",
    "timeStamp": "1 day ago",
    "jobType": "FullTime",
    "jobDescription": "Looking for a Senior Platform Engineer to join our growing engineering team. Experience with infrastructure as code and strong Unix/Linux skills required.",
    "applied": "NO"
  },
  {
    "id": "4128648309",
    "link": "https://www.linkedin.com/jobs/view/4128648309",
    "title": "Senior DevOps Engineer",
    "companyName": "CACI International Inc",
    "location": "State Farm, VA (Remote)",
    "method": "Manual",
    "timeStamp": "3 days ago",
    "jobType": "FullTime",
    "jobDescription": "Join our team as a Senior DevOps Engineer to help automate and improve our deployment processes and infrastructure management.",
    "applied": "YES"
  }
];