// src/app/page.js

import Link from 'next/link';
import ThemeToggleClient from '@/components/ThemeToggleClient';

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen py-12 px-4">
      {/* Theme Toggle - Add this near the top of your page */}
      <div className="absolute top-4 right-4">
        <ThemeToggleClient />
      </div>
      
      <div className="max-w-4xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
        <h1 className="text-4xl font-bold text-center text-blue-600 dark:text-blue-400 mb-4">
          Cloud IAM Sentinel
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 text-center">
          Advanced AWS IAM Policy Analysis and Security Management
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-blue-50 dark:bg-gray-700 p-6 rounded-lg border border-blue-200 dark:border-gray-600">
            <h2 className="text-xl font-semibold text-blue-700 dark:text-blue-400 mb-3">Policy Analysis</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Identify potential security issues in your AWS IAM policies with our intelligent 
              analysis engine.
            </p>
          </div>
          
          <div className="bg-blue-50 dark:bg-gray-700 p-6 rounded-lg border border-blue-200 dark:border-gray-600">
            <h2 className="text-xl font-semibold text-blue-700 dark:text-blue-400 mb-3">Security Dashboard</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Get comprehensive insights into your AWS security posture across IAM, S3, and Lambda.
            </p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
          <Link 
            href="/login" 
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-md transition-colors duration-300 text-center"
          >
            Login
          </Link>
          <Link 
            href="/register" 
            className="bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-blue-600 dark:text-blue-400 font-medium py-3 px-6 rounded-md border border-blue-600 dark:border-blue-400 transition-colors duration-300 text-center"
          >
            Register
          </Link>
        </div>
      </div>
    </main>
  );
}
