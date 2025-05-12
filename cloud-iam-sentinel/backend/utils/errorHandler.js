/**
 * Standard error handler for consistent error responses
 * @param {Error} error - The error object
 * @param {string} operation - Description of the operation that failed
 * @param {boolean} logError - Whether to log the error to console
 * @returns {Object} Standardized error response object
 */
function handleError(error, operation, logError = true) {
  if (logError) {
    console.error(`Error during ${operation}:`, error);
  }
  
  // Format standard error response
  return {
    success: false,
    message: error.message || `Failed to ${operation}`,
    error: process.env.NODE_ENV === 'production' ? null : error.toString(),
    stack: process.env.NODE_ENV === 'production' ? null : error.stack
  };
}

module.exports = { handleError };