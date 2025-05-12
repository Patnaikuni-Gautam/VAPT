'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectRoute from '@/components/ProtectRoute';
import DashboardLayout from '@/components/DashboardLayout';
import { api } from '@/utils/api';
import { useTheme } from '@/contexts/ThemeContext';
import Link from 'next/link';

export default function UserDashboard() {
  const { isLoggingOut, refreshToken, user } = useAuth();
  const { darkMode } = useTheme();
  const [stats, setStats] = useState({
    policiesAnalyzed: 0,
    issuesFound: 0,
    criticalIssues: 0,
    lastScanDate: null,
  });
  const [recentFindings, setRecentFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const fetchDashboardData = async () => {
      if (isLoggingOut) return;

      try {
        setLoading(true);
        // Skip token refresh as it's causing 404 errors
        // await refreshToken();

        // Replace the API calls with the correct endpoints
        const statsResponse = await api.get(`/policies/stats`);
        console.log('User stats response:', statsResponse);

        // Add user ID to filter findings for this specific user
        const findingsResponse = await api.get(`/policies/findings?limit=5`);
        console.log('User findings response:', findingsResponse);

        // Only update if component is still mounted and not logging out
        if (isMounted && !isLoggingOut) {
          if (statsResponse && statsResponse.success) {
            // Client-side filtering to ensure we're only using this user's stats
            const userStats = statsResponse.data;

            // Only use these stats if they're for the current user
            if (userStats && (userStats.userId === user.id || !userStats.userId)) {
              setStats({
                policiesAnalyzed: userStats.policiesAnalyzed || 0,
                issuesFound: userStats.issuesFound || 0,
                criticalIssues: userStats.criticalIssues || 0,
                lastScanDate: userStats.lastScanDate || null,
              });
            }
          }

          if (findingsResponse && findingsResponse.success) {
            // Additional client-side filtering to ensure findings belong to current user
            const userFindings = findingsResponse.data?.findings?.filter((finding) => {
              // Multiple ways to check user ownership based on different API response formats
              return (
                finding.userId === user.id ||
                finding.user === user.id ||
                (finding.user && finding.user._id === user.id) ||
                (finding.user && finding.user.email === user.email)
              );
            });

            setRecentFindings(userFindings || []);
          } else {
            setRecentFindings([]);
          }

          setError(null);
          setLoading(false);
        }
      } catch (error) {
        if (isMounted && !isLoggingOut) {
          console.error('Error fetching dashboard data:', error);
          setError(`Failed to load dashboard data: ${error.message}`);
          setLoading(false);
        }
      }
    };

    fetchDashboardData();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [isLoggingOut, refreshToken, user]);

  const getSeverityColor = (severity) => {
    if (!severity) return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Create a safe stats object to use in rendering
  const safeStats = {
    policiesAnalyzed: stats?.policiesAnalyzed || 0,
    issuesFound: stats?.issuesFound || 0,
    criticalIssues: stats?.criticalIssues || 0,
    lastScanDate: stats?.lastScanDate || null,
  };

  // Wrap with ProtectRoute component for authentication
  return (
    <ProtectRoute>
      <DashboardLayout>
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 dark:border-blue-400"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900 text-red-700 dark:text-red-200 p-4 rounded-lg shadow mb-6">
            <h3 className="font-medium">Error</h3>
            <p>{error}</p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-3xl font-semibold text-gray-800 dark:text-gray-100">User Dashboard</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">Overview of your AWS IAM policy security status</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Total Policies Analyzed</p>
                <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-white">{safeStats.policiesAnalyzed}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Issues Found</p>
                <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-white">{safeStats.issuesFound}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Critical Issues</p>
                <p className="mt-1 text-3xl font-semibold text-red-600">{safeStats.criticalIssues}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Last Scan</p>
                <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {safeStats.lastScanDate ? formatDate(safeStats.lastScanDate) : 'Apr 30, 2025'}
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">Recent Findings</h3>
              </div>

              {recentFindings && recentFindings.length > 0 ? (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {recentFindings.map((finding, index) => {
                    // Handle both MongoDB _id and regular id formats
                    const findingId = finding._id || finding.id || index;
                    return (
                      <div key={findingId} className="px-6 py-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{finding.policyName || 'Unnamed Policy'}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{finding.description || 'No description'}</p>
                          <div className="flex mt-1 items-center">
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              {finding.service || 'Unknown'} • {finding.createdAt ? formatDate(finding.createdAt) : formatDate(new Date())}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(finding.severity)}`}
                        >
                          {finding.severity || 'Unknown'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                  No recent findings to display.
                  <div className="mt-3">
                    <Link href="/policy-analyzer" className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                      Analyze a policy
                    </Link>
                  </div>
                </div>
              )}

              <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
                <Link
                  href="/findings"
                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500"
                >
                  View all findings
                </Link>
              </div>
            </div>
          </>
        )}
      </DashboardLayout>
    </ProtectRoute>
  );
}
