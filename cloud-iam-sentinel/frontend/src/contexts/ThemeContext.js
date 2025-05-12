'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  // Use undefined as initial state to detect if it's loaded
  const [darkMode, setDarkMode] = useState(undefined);
  const [themeLoaded, setThemeLoaded] = useState(false);

  // Load theme preference from localStorage on mount
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const savedTheme = localStorage.getItem('theme');
        
        if (savedTheme) {
          setDarkMode(savedTheme === 'dark');
        } else {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          setDarkMode(prefersDark);
          localStorage.setItem('theme', prefersDark ? 'dark' : 'light');
        }
      }
      setThemeLoaded(true);
    } catch (error) {
      console.error('Error loading theme preference:', error);
      setDarkMode(false);
      setThemeLoaded(true);
    }
  }, []);

  // Apply theme to document when it changes
  useEffect(() => {
    // Only apply after first render when darkMode is no longer undefined
    if (darkMode === undefined) return;
    
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode, themeLoaded }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}