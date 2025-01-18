import { sampleJobs } from "@/data/sample-jobs";

export async function fetchJobs() {
  try {
    const response = await fetch('http://10.0.0.65:5000/getData');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching jobs:', error);
    console.log('Falling back to sample data');
    return sampleJobs;
  }
}

export async function applyJob(jobId: string, method: string, link: string) {
  try {
    const response = await fetch('http://10.0.0.65:5000/applyThis', {
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
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error applying to job:', error);
    return null;
  }
}

export async function rejectJob(jobId: string) {
  try {
    const response = await fetch('http://10.0.0.65:5000/rejectThis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobID: jobId
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error rejecting job:', error);
    return null;
  }
}