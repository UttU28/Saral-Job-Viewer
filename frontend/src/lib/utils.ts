import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow } from 'date-fns';
import React from 'react';
import { technicalKeywords, negativeKeywords, extractExperienceRequirements } from './keywords';

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

export function countKeywords(text: string): number {
  const matches = text.match(new RegExp(technicalKeywords.map(keyword => `\\b${keyword}\\b`).join('|'), 'gi'));
  return matches ? matches.length : 0;
}

export function getMatchedKeywords(text: string): string[] {
  const matches = text.match(new RegExp(technicalKeywords.map(keyword => `\\b${keyword}\\b`).join('|'), 'gi'));
  return matches ? Array.from(new Set(matches)) : [];
}

export function getNegativeKeywords(text: string): string[] {
  const experienceReqs = extractExperienceRequirements(text);
  const otherNegatives = negativeKeywords.filter(keyword => {
    // Skip experience-related keywords as we handle them separately
    if (keyword.includes('year') || keyword.includes('experience')) {
      return false;
    }
    return new RegExp(`\\b${keyword}\\b`, 'i').test(text);
  });
  
  return Array.from(new Set([...experienceReqs, ...otherNegatives]));
}

export function highlightKeywords(text: string): React.ReactNode {
  // Get experience requirements
  const experienceReqs = extractExperienceRequirements(text);
  
  // Create patterns for technical keywords
  const technicalPatterns = technicalKeywords.map(keyword => {
    if (keyword === 'R') return '\\b[Rr]\\b';
    if (keyword.toLowerCase() === 'api') return '\\b[Aa][Pp][Ii]\\b';
    return `\\b${keyword}\\b`;
  });

  // Create patterns for negative keywords (excluding experience patterns)
  const negativePatterns = negativeKeywords
    .filter(keyword => !keyword.includes('year') && !keyword.includes('experience'))
    .map(keyword => `\\b${keyword}\\b`);
  
  // Add experience requirement patterns
  const allPatterns = [...technicalPatterns, ...negativePatterns, ...experienceReqs.map(exp => exp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))];
  
  // Combine all patterns
  const combinedPattern = new RegExp(allPatterns.join('|'), 'gi');

  // Split the text into segments
  const segments = text.split(combinedPattern);
  const matches = text.match(combinedPattern) || [];

  // Combine segments and matches
  return segments.reduce<React.ReactNode[]>((acc, segment, index) => {
    acc.push(React.createElement('span', { key: `segment-${index}` }, segment));
    if (index < matches.length) {
      const match = matches[index];
      const isExperienceReq = experienceReqs.includes(match);
      const isNegative = isExperienceReq || negativeKeywords.some(keyword => 
        new RegExp(`^${keyword}$`, 'i').test(match)
      );

      acc.push(
        React.createElement('span', {
          key: `match-${index}`,
          className: isNegative
            ? "bg-red-500/20 text-red-400 px-1 rounded"
            : "bg-purple-500/20 text-purple-400 px-1 rounded"
        }, match)
      );
    }
    return acc;
  }, []);
}