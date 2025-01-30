// Technical keywords to highlight
export const technicalKeywords = [
  "Python", "JavaScript", "TypeScript", "Rust", "Bash", "PowerShell", "R", "Go", "Ruby", "Swift",
  "React", "Next.js", "Node.js", "Django", "FastAPI", "Flask", "Express", "Angular", "HTML", "CSS", "Jinja", "YAML",
  "SQL", "PostgreSQL", "Azure SQL", "Redis", "AWS RDS", "MongoDB", "DynamoDB", "Firebase", "Firestore",
  "Azure", "AWS", "CI", "CD", "Kubernetes", "Docker", "Jenkins", "Terraform", "Ansible", "Azure Functions",
  "AWS Lambda", "S3", "EC2", "RBAC", "Azure DevOps", "Azure Blob Storage", "Azure AKS", "Azure App Service",
  "Metamask", "Fireblocks", "REST APIs", "OpenAPI", "Swagger", "GraphQL", "WebRTC", "SOAP", "MQTT", "WebSocket",
  "OAuth", "JSON-RPC", "Kafka", "Nginx", "GitHub", "VSCode", "Cron", "WebSockets",
  "Machine Learning", "NLP", "spaCy", "NLTK", "OpenCV", "WhisperAI",
  "Selenium", "Beautiful Soup", "Requests", "FFMPEG",
  "Azure Communication Services", "SMTP", "Session Management", "Data Pipelines", "Multithreading",
  "Android Studio", "OCR", "Dynamic Content Generation", "Image Processing",
  "Event Scraping", "Keyword Filtering", "Data Enrichment", "Analytics Dashboard",
  "Interactive Visualizations", "RBAC", "Data Cleaning", "Data Preprocessing",
  "Automation", "Threading", "Data Pipelines", "Chrome Extensions", "Google Chrome",
  "Azure API Management", "Secure Transactions", "Gaming APIs", "Unity3D"
];

// Negative keywords to highlight
export const negativeKeywords = [
  // Security and Clearance Requirements
  "Security Clearance", "Clearance Required", "Active Clearance",
  "Polygraph", "Full-Scope Polygraph", "CI Polygraph",
  "Secret Clearance", "Top Secret", "TS/SCI",
  "Public Trust", "Government Clearance",

  // Citizenship and Work Authorization
  "Green Card", "GC", "US Citizen", "Citizenship Required",
  "Must be US Citizen", "Permanent Resident",
  "Must be authorized to work",
  "Sponsorship not available", "No sponsorship",
  "Cannot sponsor", "Will not sponsor",

  // Military and Government
  "Military Experience", "DoD Experience",
  "Security+ Certification", "CISSP Required",
  "Government Experience", "Federal Experience",
  "Defense Industry", "Defense Contractor",

  "Java", "Apache", "Airflow", "CNC", "Machining", 
];

// Function to normalize experience text
function normalizeExperience(text: string): string {
  return text.toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\byrs?\b/g, 'years')
    .replace(/\bminimum\b/g, 'min')
    .replace(/\bof\b/g, '')
    .replace(/\bexperience\b/g, 'exp')
    .trim();
}

// Function to extract experience requirements
export function extractExperienceRequirements(text: string): string[] {
  const matches = new Set<string>();
  const normalizedMatches = new Set<string>();

  // Single regex to match all experience patterns
  const experienceRegex = /\b(?:(?:minimum|min|at least|minimum of)\s+)?\d+(?:\s*\+|\s*-\s*\d+)?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience)?\b(?:\s+(?:in|with)\s+[\w\s]+)?/gi;
  
  const found = text.match(experienceRegex);
  
  if (found) {
    for (const match of found) {
      const normalizedMatch = normalizeExperience(match);
      
      // Skip if we've already seen this normalized form
      if (!normalizedMatches.has(normalizedMatch)) {
        matches.add(match.trim());
        normalizedMatches.add(normalizedMatch);
      }
    }
  }

  // Also match qualitative experience requirements
  const qualitativeRegex = /\b(?:proven|demonstrated|extensive|significant|substantial)\s+(?:experience|track\s+record)\b/gi;
  const qualitativeMatches = text.match(qualitativeRegex) || [];
  
  for (const match of qualitativeMatches) {
    const normalizedMatch = normalizeExperience(match);
    if (!normalizedMatches.has(normalizedMatch)) {
      matches.add(match.trim());
      normalizedMatches.add(normalizedMatch);
    }
  }

  return Array.from(matches);
}