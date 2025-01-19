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
  applied?: string; // Adding the applied field as optional
}