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
  // Create a regex pattern that matches whole words only for each keyword
  const keywordPatterns = TECH_KEYWORDS.map(keyword => ({
    pattern: new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
    keyword
  }));

  // Split text into paragraphs
  const paragraphs = text.split(/\n+/);

  return paragraphs.map((paragraph, pIndex) => {
    let segments: { text: string; isKeyword: boolean }[] = [{ text: paragraph, isKeyword: false }];

    // Apply each keyword pattern
    keywordPatterns.forEach(({ pattern, keyword }) => {
      segments = segments.flatMap(segment => {
        if (segment.isKeyword) return [segment];

        const parts = segment.text.split(pattern);
        if (parts.length === 1) return [segment];

        return parts.reduce((acc: typeof segments, part, i) => {
          if (i !== 0) {
            acc.push({ text: keyword, isKeyword: true });
          }
          if (part) {
            acc.push({ text: part, isKeyword: false });
          }
          return acc;
        }, []);
      });
    });

    // Create paragraph with highlighted segments
    return React.createElement(
      'p',
      {
        key: pIndex,
        className: pIndex > 0 ? 'mt-4' : undefined
      },
      segments.map((segment, i) =>
        segment.isKeyword ?
          React.createElement('span', {
            key: i,
            className: 'bg-blue-500/10 text-blue-300 px-1 rounded'
          }, segment.text) :
          segment.text
      )
    );
  });
}