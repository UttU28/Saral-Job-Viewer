import { sampleJobs } from "@/data/sample-jobs";

export type ConnectionStatus = 'connecting' | 'fetching' | 'connected' | 'error';

const API_BASE_URL = 'https://lucky-adjusted-possum.ngrok-free.app';

// Add caching for getKeywords
let keywordsCache: {
  data: any;
  timestamp: number;
  isUsingSampleData: boolean;
} | null = null;

const CACHE_DURATION = 30000; // 30 seconds

async function handleApiResponse(response: Response) {
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return await response.json();
}

export async function fetchJobs() {
  try {
    const response = await fetch(`${API_BASE_URL}/getData`);
    const data = await handleApiResponse(response);
    return { data, isUsingSampleData: false };
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return { data: sampleJobs, isUsingSampleData: true };
  }
}

export async function applyJob(jobId: string, method: string, link: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/applyThis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobID: jobId,
        applyMethod: method,
        link: link
      }),
    });
    const result = await handleApiResponse(response);
    return { success: true, data: result };
  } catch (error) {
    console.error('Error applying to job:', error);
    // For sample data, simulate successful application
    if (sampleJobs.find(job => job.id === jobId)) {
      return { success: true, data: null };
    }
    return { success: false, error: 'Failed to apply to job' };
  }
}

export async function rejectJob(jobId: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/rejectThis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobID: jobId
      }),
    });
    const result = await handleApiResponse(response);
    return { success: true, data: result };
  } catch (error) {
    console.error('Error rejecting job:', error);
    // For sample data, simulate successful rejection
    if (sampleJobs.find(job => job.id === jobId)) {
      return { success: true, data: null };
    }
    return { success: false, error: 'Failed to reject job' };
  }
}

export async function addToSettings(name: string, type: 'NoCompany' | 'SearchList') {
  try {
    const response = await fetch(`${API_BASE_URL}/addKeyword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        type
      }),
    });
    await handleApiResponse(response);
    // Invalidate cache after adding a keyword
    keywordsCache = null;
    return { success: true };
  } catch (error) {
    console.error('Error adding to settings:', error);
    return { success: false };
  }
}

export async function removeFromSettings(id: number) {
  try {
    const response = await fetch(`${API_BASE_URL}/removeKeyword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id
      }),
    });
    await handleApiResponse(response);
    // Invalidate cache after removing a keyword
    keywordsCache = null;
    return { success: true };
  } catch (error) {
    console.error('Error removing from settings:', error);
    return { success: false };
  }
}

export async function getSettings() {
  // Check if we have valid cached data
  if (keywordsCache && Date.now() - keywordsCache.timestamp < CACHE_DURATION) {
    return {
      data: keywordsCache.data,
      isUsingSampleData: keywordsCache.isUsingSampleData
    };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/getKeywords`);
    const data = await handleApiResponse(response);
    
    // Update cache
    keywordsCache = {
      data,
      timestamp: Date.now(),
      isUsingSampleData: false
    };
    
    return { data, isUsingSampleData: false };
  } catch (error) {
    console.error('Error fetching settings:', error);
    const sampleData = [
      { id: 1, name: 'Dice', type: 'NoCompany', created_at: new Date().toISOString() },
      { id: 2, name: 'Job Bot', type: 'NoCompany', created_at: new Date().toISOString() },
      { id: 3, name: 'Ventura', type: 'NoCompany', created_at: new Date().toISOString() },
      { id: 4, name: 'python', type: 'SearchList', created_at: new Date().toISOString() },
      { id: 5, name: 'flask', type: 'SearchList', created_at: new Date().toISOString() },
      { id: 6, name: 'software development', type: 'SearchList', created_at: new Date().toISOString() },
    ];
    
    // Update cache with sample data
    keywordsCache = {
      data: sampleData,
      timestamp: Date.now(),
      isUsingSampleData: true
    };
    
    return {
      data: sampleData,
      isUsingSampleData: true
    };
  }
}