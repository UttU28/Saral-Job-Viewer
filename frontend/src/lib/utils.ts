import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow } from 'date-fns';

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