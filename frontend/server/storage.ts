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
    
    // Initialize with mock data
    this.initializeMockData();
  }

  private initializeMockData() {
    // Mock jobs data with AI analysis
    const mockJobs: Job[] = [
      {
        id: "1",
        title: "Senior Software Engineer - Full Stack",
        companyName: "TechCorp Inc",
        location: "San Francisco, CA (Remote)",
        jobType: "Full-time",
        applied: "false",
        timeStamp: String(Math.floor(Date.now() / 1000) - 3600),
        link: "https://linkedin.com/jobs/view/123456789",
        jobDescription: "We're looking for a Senior Software Engineer to join our growing team. You'll work on cutting-edge technologies including React, Node.js, and AWS. Requirements: 5+ years experience, strong JavaScript skills, experience with cloud platforms. Benefits: Competitive salary $150k-$200k, health insurance, 401k matching, flexible work hours.",
        aiProcessed: true,
        aiTags: {
          label: "Full Stack Development",
          suitability_score: 85,
          recommended_resume: "Full Stack Developer Resume",
          scoring_breakdown: {
            category_core_tools: ["React", "Node.js", "JavaScript", "TypeScript", "AWS"],
            matched_core_tools: ["React", "Node.js", "JavaScript", "AWS"],
            core_tool_points: 40,
            category_60_percent_bonus_applied: true,
            experience_points: 30,
            raw_total_before_clamp: 85
          },
          matched_keywords: ["React", "Node.js", "JavaScript", "AWS", "Full Stack", "Senior", "Remote"],
          unmatched_relevant_keywords: ["TypeScript", "Docker", "Kubernetes"],
          experience_detected: {
            years_text: "5+ years",
            parsed_min_years: 5
          },
          salary_detected: {
            salary_text: "$150k-$200k",
            parsed_min_annual_usd: 150000,
            parsed_max_annual_usd: 200000,
            pay_type: "annual",
            currency: "USD"
          },
          seniority_detected: ["Senior"],
          work_auth_clearance_detected: [],
          red_flags: [],
          redflag_companies: [],
          rationale: "Excellent match with strong alignment to full-stack development skills. The role requires 5+ years of experience which aligns well with your background. Competitive salary range and remote work option make this an attractive opportunity.",
          apply_decision: "Apply",
          person_specific_recommendations: ["John", "Sarah"]
        }
      },
      {
        id: "2",
        title: "Python Developer - Junior Level",
        companyName: "DataFlow Solutions",
        location: "New York, NY (Hybrid)",
        jobType: "Full-time",
        applied: "false",
        timeStamp: String(Math.floor(Date.now() / 1000) - 7200),
        link: "https://linkedin.com/jobs/view/123456790",
        jobDescription: "Join our data engineering team as a Python Developer. Work with large datasets, build ETL pipelines, and create data visualization tools. Requirements: 1-2 years Python experience, pandas, SQL, experience with data processing frameworks. Salary: $70k-$90k. Note: Must work on-site 3 days/week, unpaid overtime expected during project deadlines.",
        aiProcessed: true,
        aiTags: {
          label: "Data Engineering",
          suitability_score: 35,
          recommended_resume: "Data Engineering Resume",
          scoring_breakdown: {
            category_core_tools: ["Python", "SQL", "pandas", "Apache Spark", "Airflow"],
            matched_core_tools: ["Python", "SQL", "pandas"],
            core_tool_points: 15,
            category_60_percent_bonus_applied: false,
            experience_points: 10,
            raw_total_before_clamp: 35
          },
          matched_keywords: ["Python", "SQL", "pandas", "ETL", "data"],
          unmatched_relevant_keywords: ["Apache Spark", "Airflow", "Kafka", "NoSQL"],
          experience_detected: {
            years_text: "1-2 years",
            parsed_min_years: 1
          },
          salary_detected: {
            salary_text: "$70k-$90k",
            parsed_min_annual_usd: 70000,
            parsed_max_annual_usd: 90000,
            pay_type: "annual",
            currency: "USD"
          },
          seniority_detected: ["Junior"],
          work_auth_clearance_detected: [],
          red_flags: ["Unpaid overtime expected", "Below market salary for skill requirements", "On-site requirement 3 days/week"],
          redflag_companies: [],
          rationale: "While the role matches some Python and data skills, the experience requirement is junior-level and below your qualifications. The salary is significantly below market rate and several red flags indicate poor work-life balance. The on-site requirement may also limit flexibility.",
          apply_decision: "DO NOT APPLY",
          person_specific_recommendations: []
        }
      },
      {
        id: "3",
        title: "DevOps Engineer",
        companyName: "CloudNative Systems",
        location: "Austin, TX (On-site)",
        jobType: "Full-time",
        applied: "false",
        timeStamp: String(Math.floor(Date.now() / 1000) - 14400),
        link: "https://linkedin.com/jobs/view/123456791",
        jobDescription: "Looking for a DevOps Engineer to manage our cloud infrastructure. You'll work with Kubernetes, Docker, Terraform, and CI/CD pipelines. Experience with AWS/GCP required. Great opportunity to work with modern technologies in a fast-growing startup environment. 3+ years experience required.",
        aiProcessed: false,
        aiTags: ""
      },
      {
        id: "4",
        title: "Frontend Developer - React",
        companyName: "WebInnovate LLC",
        location: "Seattle, WA (Remote)",
        jobType: "Contract",
        applied: "false",
        timeStamp: String(Math.floor(Date.now() / 1000) - 21600),
        link: "https://linkedin.com/jobs/view/123456792",
        jobDescription: "Contract opportunity for an experienced React developer. Build responsive web applications, work with modern JavaScript frameworks, and collaborate with design teams. 6-month contract with possibility of extension. Requirements: React, TypeScript, CSS, testing frameworks. Rate: $80-$100/hour.",
        aiProcessed: true,
        aiTags: {
          label: "Frontend Development",
          suitability_score: 78,
          recommended_resume: "Frontend Developer Resume",
          scoring_breakdown: {
            category_core_tools: ["React", "TypeScript", "CSS", "JavaScript", "Jest"],
            matched_core_tools: ["React", "TypeScript", "CSS", "JavaScript"],
            core_tool_points: 35,
            category_60_percent_bonus_applied: true,
            experience_points: 25,
            raw_total_before_clamp: 78
          },
          matched_keywords: ["React", "TypeScript", "JavaScript", "CSS", "Frontend", "Testing", "Remote"],
          unmatched_relevant_keywords: ["Next.js", "Redux", "Styled Components"],
          experience_detected: {
            years_text: null,
            parsed_min_years: null
          },
          salary_detected: {
            salary_text: "$80-$100/hour",
            parsed_min_annual_usd: 166400,
            parsed_max_annual_usd: 208000,
            pay_type: "hourly",
            currency: "USD"
          },
          seniority_detected: [],
          work_auth_clearance_detected: [],
          red_flags: ["Contract position with no benefits", "Only 6-month duration"],
          redflag_companies: [],
          rationale: "Strong match for frontend development skills with React and TypeScript. The hourly rate is competitive and the remote work arrangement is ideal. However, it's a contract position which means no benefits and limited duration. Consider if you're open to contract work.",
          apply_decision: "Apply",
          person_specific_recommendations: ["Sarah", "Mike"]
        }
      },
      {
        id: "5",
        title: "Data Scientist - Machine Learning",
        companyName: "AI Innovations Corp",
        location: "Boston, MA (Hybrid)",
        jobType: "Full-time",
        applied: "false",
        timeStamp: String(Math.floor(Date.now() / 1000) - 86400),
        link: "https://linkedin.com/jobs/view/123456793",
        jobDescription: "Data Scientist position focusing on machine learning and predictive analytics. Work with large datasets, develop ML models, and present insights to stakeholders. Requirements: Python, R, statistical analysis, machine learning frameworks (TensorFlow, PyTorch). PhD preferred but not required. 4+ years industry experience. Salary: $130k-$170k.",
        aiProcessed: true,
        aiTags: {
          label: "Data Science & ML",
          suitability_score: 62,
          recommended_resume: "Data Science Resume",
          scoring_breakdown: {
            category_core_tools: ["Python", "R", "TensorFlow", "PyTorch", "scikit-learn"],
            matched_core_tools: ["Python", "TensorFlow"],
            core_tool_points: 20,
            category_60_percent_bonus_applied: false,
            experience_points: 25,
            raw_total_before_clamp: 62
          },
          matched_keywords: ["Python", "Machine Learning", "TensorFlow", "Data Science", "Analytics"],
          unmatched_relevant_keywords: ["R", "PyTorch", "scikit-learn", "Statistical Analysis"],
          experience_detected: {
            years_text: "4+ years",
            parsed_min_years: 4
          },
          salary_detected: {
            salary_text: "$130k-$170k",
            parsed_min_annual_usd: 130000,
            parsed_max_annual_usd: 170000,
            pay_type: "annual",
            currency: "USD"
          },
          seniority_detected: ["Senior"],
          work_auth_clearance_detected: [],
          red_flags: ["PhD preferred - may face strong competition"],
          redflag_companies: [],
          rationale: "Moderate match for data science role. You have Python and some ML experience, but the role emphasizes statistical analysis and advanced ML frameworks where your expertise may be limited. The PhD preference could make competition tough. Salary is good but consider if you want to pivot more into data science.",
          apply_decision: "Apply",
          person_specific_recommendations: ["Alekya", "Chandrahas"]
        }
      }
    ];

    mockJobs.forEach(job => this.jobs.set(job.id, job));

    // Mock keywords data
    const mockKeywords: Keyword[] = [
      { id: 1, name: "Software Engineer", type: "SearchList", created_at: "2024-01-15T08:00:00Z" },
      { id: 2, name: "Python Developer", type: "SearchList", created_at: "2024-01-15T08:05:00Z" },
      { id: 3, name: "Frontend Developer", type: "SearchList", created_at: "2024-01-15T08:10:00Z" },
      { id: 4, name: "Data Scientist", type: "SearchList", created_at: "2024-01-15T08:15:00Z" },
      { id: 5, name: "DevOps Engineer", type: "SearchList", created_at: "2024-01-15T08:20:00Z" },
      { id: 10, name: "BadCompany Inc", type: "NoCompany", created_at: "2024-01-15T09:00:00Z" },
      { id: 11, name: "ScamCorp LLC", type: "NoCompany", created_at: "2024-01-15T09:05:00Z" },
      { id: 12, name: "LowPayTech", type: "NoCompany", created_at: "2024-01-15T09:10:00Z" }
    ];

    mockKeywords.forEach(keyword => {
      this.keywords.set(keyword.id, keyword);
      if (keyword.id >= this.keywordIdCounter) {
        this.keywordIdCounter = keyword.id + 1;
      }
    });
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
