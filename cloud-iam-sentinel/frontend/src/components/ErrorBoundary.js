'use client';

import { useState, useEffect } from 'react';

export default function ErrorBoundary({ children }) {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Add event listener for uncaught errors
    const handleError = (event) => {
      event.preventDefault();
      setHasError(true);
      setError(event.error || new Error('Unknown error occurred'));
      console.error('Caught by ErrorBoundary:', event.error);
    };

    window.addEventListener('error', handleError);

    // Add event listener for unhandled promise rejections
    const handlePromiseRejection = (event) => {
      event.preventDefault();
      setHasError(true);
      setError(event.reason || new Error('Promise rejection'));
      console.error('Unhandled promise rejection caught by ErrorBoundary:', event.reason);
    };

    window.addEventListener('unhandledrejection', handlePromiseRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handlePromiseRejection);
    };
  }, []);

  const resetError = () => {
    setHasError(false);
    setError(null);
  };

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md">
          <div className="text-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white mt-4">Something went wrong</h2>
          </div>
          
          <div className="bg-red-50 dark:bg-red-900 p-4 rounded-md mb-6">
            <p className="text-sm text-red-800 dark:text-red-300">
              {error?.message || 'An unexpected error occurred'}
            </p>
          </div>
          
          <div className="flex flex-col space-y-3">
            <button 
              onClick={resetError}
              className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium py-2 px-4 rounded"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}