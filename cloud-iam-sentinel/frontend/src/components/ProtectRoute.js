'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function ProtectRoute({ children }) {
  const { loading, isAuthenticated, isLoggingOut } = useAuth();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // Only check auth when not in loading or logging out state
    if (!loading && !isLoggingOut) {
      if (!isAuthenticated) {
        const currentPath = encodeURIComponent(window.location.pathname);
        router.push(`/login?returnTo=${currentPath}`);
      } else {
        setAuthorized(true);
      }
    }
  }, [loading, isAuthenticated, isLoggingOut, router]);

  if (loading || !authorized || isLoggingOut) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return children;
}