const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://10.0.0.17:5000';

interface ApplyRequest {
  jobID: string;
  applyMethod: string;
  link: string;
  useBot: boolean;
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

interface AcceptDenyCount {
  countAccepted: number;
  countRejected: number;
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
  async scrapeLinkedIn() {
    const response = await fetchWithRetry(`${API_BASE_URL}/scrapeLinkedIn`, {
      headers: {
        'Cache-Control': 'no-cache'
      }
    }, 3);
    return handleResponse(response);
  },

  async scrapeDice() {
    const response = await fetchWithRetry(`${API_BASE_URL}/scrapeDice`, {
      headers: {
        'Cache-Control': 'no-cache'
      }
    }, 3);
    return handleResponse(response);
  },
  
    async getJobs() {
      const response = await fetchWithRetry(`${API_BASE_URL}/getData`, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      }, 3);
      return handleResponse(response);
    },
  
    async getJobsByHours(hours: number) {
      const response = await fetchWithRetry(`${API_BASE_URL}/getHoursOfData`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({ hours })
      }, 3);
      return handleResponse(response);
    },
  
    async getAcceptDenyCounts(): Promise<AcceptDenyCount> {
      const response = await fetchWithRetry(`${API_BASE_URL}/getCountForAcceptDeny`, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      }, 3);
      const data = await handleResponse(response);
      return data.data;
    },
  
    async applyJob({ jobID, applyMethod, link, useBot }: ApplyRequest) {
      const response = await fetchWithRetry(`${API_BASE_URL}/applyThis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobID, applyMethod, link, useBot }),
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

    async getJobsDice() {
      const response = await fetchWithRetry(`${API_BASE_URL}/getDiceData`, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      }, 3);
      return handleResponse(response);
    },
  
    async getJobsByHoursDice(hours: number) {
      const response = await fetchWithRetry(`${API_BASE_URL}/getHoursOfDiceData`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({ hours })
      }, 3);
      return handleResponse(response);
    },
  
    async getAcceptDenyCountsDice(): Promise<AcceptDenyCount> {
      const response = await fetchWithRetry(`${API_BASE_URL}/getCountForDiceAcceptDeny`, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      }, 3);
      const data = await handleResponse(response);
      return data.data;
    },
  
    async applyJobDice({ jobID, applyMethod, link, useBot }: ApplyRequest) {
      const response = await fetchWithRetry(`${API_BASE_URL}/applyThisDice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobID, applyMethod, link, useBot }),
      }, 3);
      return handleResponse(response);
    },
  
    async rejectJobDice({ jobID }: RejectRequest) {
      const response = await fetchWithRetry(`${API_BASE_URL}/rejectThisDice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobID }),
      }, 3);
      return handleResponse(response);
    },
  
    async getKeywordsDice(): Promise<KeywordType[]> {
      const response = await fetchWithRetry(`${API_BASE_URL}/getDiceKeywords`, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      }, 3);
      return handleResponse(response);
    },
  
    async addKeywordDice({ name, type }: AddKeywordRequest): Promise<KeywordType> {
      const response = await fetchWithRetry(`${API_BASE_URL}/addDiceKeyword`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, type }),
      }, 3);
      return handleResponse(response);
    },
  
    async removeKeywordDice({ id }: RemoveKeywordRequest) {
      const response = await fetchWithRetry(`${API_BASE_URL}/removeDiceKeyword`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      }, 3);
      return handleResponse(response);
    },

  async getLinkedInQuestions() {
    const response = await fetchWithRetry(`${API_BASE_URL}/getLinkedInQuestions`, {
      headers: {
        'Cache-Control': 'no-cache'
      }
    }, 3);
    return handleResponse(response);
  },

  async updateLinkedInQuestions(questions: any) {
    const response = await fetchWithRetry(`${API_BASE_URL}/updateLinkedInQuestions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ questions }),
    }, 3);
    return handleResponse(response);
  },
};