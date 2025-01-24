import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow } from 'date-fns';
import React from 'react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(timestamp: string): string {
  try {
    const timestampNum = parseFloat(timestamp);
    const date = new Date(timestampNum * 1000);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return timestamp;
  }
}

// Technical keywords to highlight
export const technicalKeywords = [
  "Python", "JavaScript", "Java", "TypeScript", "Rust", "Bash", "PowerShell", "R", "Go", "Ruby", "Swift",
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

export function highlightKeywords(text: string): React.ReactNode {
  // Create a map of keywords to their regex patterns
  const keywordPatterns = new Map(
    technicalKeywords.map(keyword => {
      // Special cases for single-letter keywords and specific terms
      return [keyword, `\\b${keyword}\\b`];
    })
  );

  // Combine all patterns into one regex
  const combinedPattern = new RegExp(
    Array.from(keywordPatterns.values()).join('|'),
    'gi'
  );

  // Split the text into segments
  const segments = text.split(combinedPattern);
  const matches = text.match(combinedPattern) || [];

  // Combine segments and matches
  return segments.reduce<React.ReactNode[]>((acc, segment, index) => {
    acc.push(React.createElement('span', { key: `segment-${index}` }, segment));
    if (index < matches.length) {
      acc.push(
        React.createElement('span', {
          key: `match-${index}`,
          className: "bg-accent/20 text-accent-foreground px-1 rounded"
        }, matches[index])
      );
    }
    return acc;
  }, []);
}