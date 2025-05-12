'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/utils/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();

  // Check authentication status
  const checkAuth = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/auth/me');
      
      if (response.success && response.user) {
        setUser(response.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Check auth on initial load
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Handle global auth events
  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      router.push('/login?error=session_expired');
    };
    
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [router]);

  // Login function
  const login = async (email, password) => {
    try {
      setLoading(true);
      const response = await api.post('/auth/login', { email, password });
      
      if (response.success && response.data?.user) {
        setUser(response.data.user);
        
        // Check if the user has permissions for policy analysis
        if (response.data.user.role === 'admin' || 
            response.data.user.permissions?.includes('analyze_policies')) {
          return { success: true };
        } else {
          return { 
            success: true, 
            warning: 'You do not have permissions to perform policy analysis' 
          };
        }
      }
      
      setError(response.message || 'Login failed');
      return { success: false, message: response.message };
    } catch (error) {
      setError(error.message || 'Login failed');
      return { success: false, message: error.message };
    } finally {
      setLoading(false);
    }
  };

  // Add refreshToken function
  const refreshToken = async () => {
    try {
      const response = await api.post('/auth/refresh');
      if (response.success && response.data?.user) {
        setUser(response.data.user);
        return true;
      }
      return false;
    } catch (error) {
      // If we get a 404, the endpoint doesn't exist yet - don't treat as fatal error
      if (error.status === 404) {
        console.warn('Refresh token endpoint not implemented yet');
        return false;
      }
      console.error('Token refresh failed:', error);
      return false;
    }
  };

  // Logout function
  const logout = async () => {
    try {
      setIsLoggingOut(true);
      setUser(null);
      
      await api.post('/auth/logout');
      
      // Use direct browser navigation for reliable redirect
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
      window.location.href = '/login';
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider 
      value={{ 
        user,
        loading,
        error,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        canAnalyzePolicies: user?.role === 'admin' || user?.permissions?.includes('analyze_policies'),
        isLoggingOut,
        login,
        logout,
        clearError,
        refreshToken
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}