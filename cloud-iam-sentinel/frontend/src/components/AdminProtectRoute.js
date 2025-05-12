'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminProtectRoute({ children }) {
  const { user, loading, isAuthenticated, isAdmin, isLoggingOut } = useAuth();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    // Wait until auth state is loaded and not in logout process
    if (!loading && !isLoggingOut) {
      if (!isAuthenticated) {
        // Save current path for return after login
        const currentPath = encodeURIComponent(window.location.pathname);
        router.push(`/login?returnTo=${currentPath}&error=authentication_required`);
      } else if (!isAdmin) {
        // User is logged in but not an admin
        router.push('/dashboard?error=insufficient_permissions');
      } else {
        setAuthorized(true);
      }
    }
  }, [loading, isAuthenticated, isAdmin, isLoggingOut, router]);

  // Handle global auth events
  useEffect(() => {
    const handleUnauthorized = () => {
      if (isAuthenticated) {
        router.push('/login?error=session_expired');
      }
    };
    
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [isAuthenticated, router]);

  // Show loading state while checking authentication
  if (loading || !authorized || isLoggingOut) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  // User is authorized admin, render children
  return children;
}