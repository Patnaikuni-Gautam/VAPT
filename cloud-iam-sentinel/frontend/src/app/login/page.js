'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import ThemeToggleClient from '@/components/ThemeToggleClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, isAdmin, clearError } = useAuth();
  const { darkMode } = useTheme();

  // Clear errors and check URL params
  useEffect(() => {
    clearError();
    
    const urlError = searchParams.get('error');
    if (urlError === 'session_expired') {
      setError('Your session has expired. Please log in again.');
    } else if (urlError === 'authentication_required') {
      setError('You need to log in to access that page.');
    }
  }, [clearError, searchParams]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const returnTo = searchParams.get('returnTo');
      if (returnTo && returnTo.startsWith('/')) {
        router.push(returnTo);
      } else if (isAdmin) {
        router.push('/admin/dashboard');
      } else {
        router.push('/dashboard');
      }
    }
  }, [isAuthenticated, isAdmin, router, searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!email || !password) {
      setError('Please enter both email and password');
      setIsLoading(false);
      return;
    }

    const result = await login(email, password);
    if (!result.success) {
      setError(result.message || 'Login failed');
    }
    setIsLoading(false);
  };

  return (
    <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-blue-50'} p-4`}>
      <div className="absolute top-4 right-4">
        <ThemeToggleClient />
      </div>
      
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-center text-blue-800 dark:text-blue-400 mb-6">
          Login to Cloud IAM Sentinel
        </h1>
        
        {error && (
          <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field dark:bg-gray-700 dark:text-gray-300"
              placeholder="your@email.com"
              required
              disabled={isLoading}
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field dark:bg-gray-700 dark:text-gray-300"
              placeholder="••••••••"
              required
              disabled={isLoading}
            />
          </div>
          
          <button
            type="submit"
            className="w-full btn-primary py-3 dark:bg-blue-700 dark:text-white disabled:opacity-70"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Don't have an account?{' '}
            <Link href="/register" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-500 font-medium">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}