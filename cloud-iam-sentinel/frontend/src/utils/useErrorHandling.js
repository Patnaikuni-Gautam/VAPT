import { useState } from 'react';

/**
 * Custom hook for standardized error handling in components
 * @returns {Object} Error handling methods and state
 */
export default function useErrorHandling() {
  const [error, setError] = useState(null);

  /**
   * Handle errors consistently
   * @param {Error|Object} err - Error object
   * @param {string} fallbackMessage - Fallback error message
   */
  const handleError = (err, fallbackMessage = 'An unexpected error occurred') => {
    console.error('Error handled by useErrorHandling:', err);
    
    if (typeof err === 'string') {
      setError(err);
    } else if (err && typeof err === 'object') {
      // Handle API error responses
      if ('message' in err) {
        setError(err.message);
      } else if ('error' in err) {
        setError(err.error);
      } else {
        setError(fallbackMessage);
      }
    } else {
      setError(fallbackMessage);
    }
  };

  const clearError = () => setError(null);

  return { error, handleError, clearError };
}