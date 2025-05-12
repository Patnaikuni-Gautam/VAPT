'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from './Navigation';
import { useTheme } from '@/contexts/ThemeContext';
// Fix the import statement by explicitly importing from the path
import { useAuth } from '@/contexts/AuthContext';

export default function DashboardLayout({ children }) {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { darkMode } = useTheme();
  const { user, isAuthenticated, isLoggingOut } = useAuth();

  useEffect(() => {
    //handle loading state
    if (!isLoggingOut) {
      setLoading(false);
    }
  }, [isAuthenticated, isLoggingOut]);

  if (loading || isLoggingOut) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 dark:border-blue-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation user={user} />
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {children}
        </div>
      </div>
    </div>
  );
}