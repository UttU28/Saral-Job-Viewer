// API Configuration
// For development (direct backend access)
const DEV_API_BASE_URL = 'http://localhost:3011'

// For production (through nginx with /api prefix)
const PROD_API_BASE_URL = '/api'

// Automatically detect environment
const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

export const API_BASE_URL = isDevelopment ? DEV_API_BASE_URL : PROD_API_BASE_URL

// Helper function to build full API URLs
export const getApiUrl = (endpoint: string): string => {
  return `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
}
