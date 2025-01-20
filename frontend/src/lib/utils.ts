import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(timestamp: string): string {
  try {
    // Convert the timestamp string to a number
    const timestampNum = parseFloat(timestamp);
    // Convert to milliseconds (if in seconds)
    const date = new Date(timestampNum * 1000);
    
    return formatDistanceToNow(date, { addSuffix: true });
  } catch (error) {
    console.error('Error formatting timestamp:', error);
    return timestamp;
  }
}