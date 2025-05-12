/**
 * API utility for making requests to the backend
 * Handles authentication with HTTP-only cookies
 */

// Define the base URL for API requests
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Process API error responses consistently
 * @param {Error|Object} error - Error object from catch block or API response
 * @param {string} fallbackMessage - Fallback error message
 * @returns {Object} Standardized error object
 */
function processApiError(error, fallbackMessage = 'An error occurred') {
  console.error('API error:', error);
  
  // If it's already a structured error response from our API
  if (error && typeof error === 'object' && 'success' in error && !error.success) {
    return error;
  }
  
  // If it's a network error
  if (error instanceof TypeError && error.message.includes('NetworkError')) {
    return {
      success: false,
      message: 'Network error: Please check your connection to the server',
      error: 'network_error'
    };
  }
  
  // If it's any other error
  return {
    success: false,
    message: error?.message || fallbackMessage,
    error: 'unknown_error'
  };
}

/**
 * Check API connectivity
 * @returns {Promise<boolean>} Whether the API is reachable
 */
async function checkApiConnection() {
  try {
    const response = await fetch(`${API_URL}/health`, { 
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      // Set a reasonable timeout
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch (error) {
    console.error('API connectivity check failed:', error);
    return false;
  }
}

/**
 * Handles API requests with improved error handling
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint to call
 * @param {Object} data - Request payload
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Response data
 */
async function apiRequest(method, endpoint, data = null, options = {}) {
  try {
    // Make sure we have the correct base URL
    const baseURL = API_URL || 'http://localhost:5000/api';
    const url = `${baseURL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    
    console.log(`API Request: ${method} ${url}`);
    console.log('Request data:', data);
    
    const fetchOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      credentials: 'include', // Always include cookies
      // Increase timeout for slower connections
      signal: options.signal || AbortSignal.timeout(30000) // 30-second timeout
    };
    
    if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = JSON.stringify(data);
    }
    
    const response = await fetch(url, fetchOptions);
    
    // Log basic response info
    console.log(`API Response: ${response.status} ${response.statusText}`);
    
    // Handle auth errors globally
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return { success: false, status: 401, message: 'Authentication required' };
    }
    
    // Handle non-JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn(`Received non-JSON response: ${contentType}`);
      return { 
        success: false, 
        status: response.status, 
        message: `Invalid response format: ${contentType || 'unknown'}` 
      };
    }
    
    const result = await response.json();
    return { ...result, success: response.ok, status: response.status };
  } catch (error) {
    // Better error logging with more details
    console.error(`API request failed ${method} ${endpoint}:`, error);
    
    // Provide more specific error messages
    if (error.name === 'AbortError') {
      return {
        success: false,
        status: 0,
        message: 'Request timed out. The server might be taking too long to respond.',
        error: 'timeout_error'
      };
    } else if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      return {
        success: false,
        status: 0,
        message: 'Network error: Could not connect to the server. Please check if the backend is running.',
        error: 'connection_error'
      };
    }
    
    return {
      success: false,
      status: 0,
      message: `Network error: ${error.message || 'Unknown error occurred'}`,
      error: error.name || 'unknown_error'
    };
  }
}

// Export the API methods plus the connectivity check
const api = {
  get: (endpoint, options = {}) => apiRequest('GET', endpoint, null, options),
  post: (endpoint, data, options = {}) => apiRequest('POST', endpoint, data, options),
  put: (endpoint, data, options = {}) => apiRequest('PUT', endpoint, data, options),
  patch: (endpoint, data, options = {}) => apiRequest('PATCH', endpoint, data, options),
  delete: (endpoint, options = {}) => apiRequest('DELETE', endpoint, null, options),
  checkConnection: checkApiConnection
};

export { api };