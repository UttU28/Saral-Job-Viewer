const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://lucky-adjusted-possum.ngrok-free.app';

interface ApplyRequest {
  jobID: string;
  applyMethod: string;
  link: string;
}

interface RejectRequest {
  jobID: string;
}

interface AddKeywordRequest {
  name: string;
  type: string;
}

interface RemoveKeywordRequest {
  id: number;
}

type KeywordType = {
  id: number;
  name: string;
  type: string;
};

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

async function handleResponse(response: Response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'An unknown error occurred' }));
    throw new APIError(response.status, error.detail || 'An error occurred');
  }
  return response.json();
}

// Add retry logic for API calls
async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

export const api = {
  async getJobs() {
    const response = await fetchWithRetry(`${API_BASE_URL}/getData`, {
      headers: {
        'Cache-Control': 'no-cache'
      }
    }, 3);
    return handleResponse(response);
  },

  async applyJob({ jobID, applyMethod, link }: ApplyRequest) {
    const response = await fetchWithRetry(`${API_BASE_URL}/applyThis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobID, applyMethod, link }),
    }, 3);
    return handleResponse(response);
  },

  async rejectJob({ jobID }: RejectRequest) {
    const response = await fetchWithRetry(`${API_BASE_URL}/rejectThis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobID }),
    }, 3);
    return handleResponse(response);
  },

  async getKeywords(): Promise<KeywordType[]> {
    const response = await fetchWithRetry(`${API_BASE_URL}/getKeywords`, {
      headers: {
        'Cache-Control': 'no-cache'
      }
    }, 3);
    return handleResponse(response);
  },

  async addKeyword({ name, type }: AddKeywordRequest): Promise<KeywordType> {
    const response = await fetchWithRetry(`${API_BASE_URL}/addKeyword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, type }),
    }, 3);
    return handleResponse(response);
  },

  async removeKeyword({ id }: RemoveKeywordRequest) {
    const response = await fetchWithRetry(`${API_BASE_URL}/removeKeyword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id }),
    }, 3);
    return handleResponse(response);
  },
};