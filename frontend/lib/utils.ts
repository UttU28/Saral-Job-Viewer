import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import React from 'react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const TECH_KEYWORDS = [
  "Cloud Architect",
  "Azure",
  "Cloud Data Architecture",
  "Azure AKS",
  "Azure Synapse",
  "Azure Data Factory",
  "Azure ADLS",
  "Azure SQL",
  "Azure DevOps",
  "AWS Cloud",
  "DevOps Engineer",
  "Linux",
  "Windows",
  "Automation",
  "Cloud Computing",
  "Cloud Security",
  "CI/CD pipelines",
  "Docker",
  "Kubernetes",
  "Terraform",
  "Ansible",
  "Infrastructure as Code",
  "Continuous Monitoring",
  "AI/ML workloads",
  "Networking",
  "Data Governance",
  "Microsoft Azure",
  "AWS Cloud Architect",
  "Hybrid Cloud",
  "Cloud Development",
  "Cybersecurity",
  "Cloud Migration",
  "Technical Architectures",
  "Cloud-native solutions",
  "VMware",
  "Cloud Automation",
  "Infrastructure Optimization",
  "AWS RDS",
  "Active Directory",
  "LDAP",
  "Cloud Performance",
  "Containerization",
  "Scripting",
  "Python",
  "Bash",
  "Ruby",
  "Prometheus",
  "Grafana",
  "Cloud Agnostic",
  "Azure Architect Expert",
  "Cloud Monitoring",
  "Cloud DevSecOps",
  "Git",
  "Bitbucket"
];

export function highlightKeywords(text: string) {
  // Sort keywords by length (longest first) to handle overlapping matches
  const sortedKeywords = [...TECH_KEYWORDS].sort((a, b) => b.length - a.length);
  
  // Create a regex pattern that matches any of the keywords (case-insensitive)
  const pattern = new RegExp(`(${sortedKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  
  // Split the text into segments (matches and non-matches)
  const segments = text.split(pattern);
  
  return segments.map((segment, index) => {
    const isKeyword = sortedKeywords.some(keyword => 
      segment.toLowerCase() === keyword.toLowerCase()
    );
    
    return isKeyword ? 
      React.createElement('span', {
        key: index,
        className: 'bg-blue-500/10 text-blue-300 px-1 rounded'
      }, segment) :
      React.createElement('span', { key: index }, segment);
  });
}