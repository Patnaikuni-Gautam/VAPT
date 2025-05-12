'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { api } from '@/utils/api';
import { useAuth } from '@/contexts/AuthContext';
import RemediationGuide from '@/components/RemediationGuide';
import useErrorHandling from '@/utils/useErrorHandling';

export default function FindingsPage() {
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 15,
    total: 0,
    pages: 1
  });
  const [filter, setFilter] = useState({
    severity: '',
    service: '',
    status: ''
  });
  const [expandedFinding, setExpandedFinding] = useState(null);
  const [recentlyReported, setRecentlyReported] = useState([]);
  const [recentlyChanged, setRecentlyChanged] = useState([]);
  const router = useRouter();
  const { user } = useAuth();
  const { error, handleError, clearError } = useErrorHandling();

  const hasActiveFilters = () => {
    return filter.severity || filter.service || filter.status;
  };

  useEffect(() => {
    fetchFindings();
  }, [pagination.page, filter]);

  /**
   * Fetches findings data from the API with filtering and pagination
   * @async
   * @function fetchFindings
   * @returns {Promise<void>} - Resolves when data is fetched and state is updated
   */
  const fetchFindings = async () => {
    try {
      clearError(); // Clear any previous errors
      setLoading(true);

      // Create clean filter object by removing empty values
      const cleanFilter = Object.fromEntries(
        Object.entries(filter).filter(([_, value]) => value !== '')
      );

      // Build query parameters
      const queryParams = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...cleanFilter
      });

      const url =`/policies/findings?${queryParams.toString()}`;
      const response = await api.get(url, {
        headers: { Authorization: `Bearer ${user?.token}` }
      });

      if (response.success) {
        setFindings(response.data.findings || []);
        setPagination(prev => ({
          ...prev,
          total: response.data.pagination.total || 0,
          pages: response.data.pagination.pages || 1
        }));
        
        if (response.data.recentlyChanged) {
          setRecentlyChanged(response.data.recentlyChanged);
        }
        
        if (response.data.recentlyReported) {
          setRecentlyReported(response.data.recentlyReported);
        }
      } else {
        handleError(response.message || 'Failed to fetch findings');
      }
    } catch (error) {
      handleError(error, 'Failed to fetch findings');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id, status, reason = '') => {
    try {
      if (!id) {
        console.error('Finding ID is undefined');
        alert('Cannot update status: Finding ID is missing');
        return;
      }

      console.log('Updating finding:', id, 'to status:', status);

      const response = await api.put(`/policies/findings/${id}/status`, {
        status,
        reason
      });

      if (response.success) {
        setFindings(findings.map(finding => {
          const findingId = finding.id || finding._id;
          return findingId === id ? { ...finding, status } : finding;
        }));

        // Add to recently changed list and remove after 5 seconds
        setRecentlyChanged(prev => [...prev, id]);
        setTimeout(() => {
          setRecentlyChanged(prev => prev.filter(item => item !== id));
        }, 5000);

        alert(`Status updated to ${status} successfully`);
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      console.error('Failed to update finding status:', error);
      alert('Failed to update finding status: ' + error.message);
    }
  };

  const handleReportFalsePositive = async (finding) => {
    try {
      const reason = prompt('Please provide a reason for reporting this as a false positive:');
      if (!reason) return;

      console.log('Reporting false positive for finding:', finding);

      const findingId = finding._id || finding.id;

      if (!findingId) {
        console.error('Finding has no ID:', finding);
        alert('Cannot report false positive: Finding has no ID');
        return;
      }

      const response = await api.post('/policies/feedback', {
        findingId: findingId,
        policyName: finding.policyName,
        service: finding.service,
        originalSeverity: finding.severity,
        reason
      });

      if (response.success) {
        // Add to recently reported list and remove after 5 seconds
        setRecentlyReported(prev => [...prev, findingId]);
        setTimeout(() => {
          setRecentlyReported(prev => prev.filter(item => item !== findingId));
        }, 5000);

        alert('False positive reported successfully');
        fetchFindings();
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      console.error('Failed to report false positive:', error);
      alert('Failed to report false positive: ' + error.message);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'text-red-600 bg-red-100';
      case 'high':
        return 'text-orange-600 bg-orange-100';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100';
      case 'low':
        return 'text-green-600 bg-green-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'open':
        return 'text-red-600 bg-red-50';
      case 'in review':
        return 'text-blue-600 bg-blue-50';
      case 'whitelisted':
        return 'text-purple-600 bg-purple-50';
      case 'resolved':
        return 'text-green-600 bg-green-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';

    try {
      const date = new Date(dateString);

      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }

      return new Intl.DateTimeFormat('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date);
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Date error';
    }
  };

  const toggleFindingDetails = (findingId) => {
    setExpandedFinding(expandedFinding === findingId ? null : findingId);
  };

  return (
    <DashboardLayout>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          <p className="flex items-center">
            <svg className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
          <button 
            onClick={clearError}
            className="text-sm text-red-600 underline ml-7"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-800">Policy Findings</h1>
        <div className="flex space-x-2">
          <button
            onClick={() => router.push('/policy-analyzer')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Analyze New Policy
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
            <select
              className="w-full border border-gray-300 rounded-md shadow-sm p-2"
              value={filter.severity}
              onChange={(e) => setFilter({ ...filter, severity: e.target.value })}
            >
              <option value="">All</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Service</label>
            <select
              className="w-full border border-gray-300 rounded-md shadow-sm p-2"
              value={filter.service}
              onChange={(e) => {
                setFilter({ ...filter, service: e.target.value });
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
            >
              <option value="">All</option>
              <option value="IAM">IAM</option>
              <option value="S3">S3</option>
              <option value="Lambda">Lambda</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              className="w-full border border-gray-300 rounded-md shadow-sm p-2"
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
            >
              <option value="">All</option>
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="In Review">In Review</option>
              <option value="Resolved">Resolved</option>
              <option value="Whitelisted">Whitelisted</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setFilter({ severity: '', service: '', status: '' });
                setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
                // fetchFindings will be called automatically via useEffect
              }}
              className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {hasActiveFilters() && (
        <div className="mt-2 flex flex-wrap items-center text-sm">
          <span className="text-gray-600 mr-2">Active filters:</span>
          {filter.severity && (
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded mr-2 mb-1">
              Severity: {filter.severity}
            </span>
          )}
          {filter.service && (
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded mr-2 mb-1">
              Service: {filter.service}
            </span>
          )}
          {filter.status && (
            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded mr-2 mb-1">
              Status: {filter.status}
            </span>
          )}
        </div>
      )}

      {/* Findings List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : findings.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No findings to display.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              {findings.map((finding) => {
                const findingId = finding._id || finding.id;
                const isExpanded = expandedFinding === findingId;

                return (
                  <div key={findingId} className="border-b border-gray-200 last:border-0">
                    {/* Clickable header row with highlight */}
                    <div
                      className={`px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors ${recentlyReported.includes(findingId) ? 'bg-yellow-50 dark:bg-yellow-900/20 animate-pulse' :
                          recentlyChanged.includes(findingId) ? 'bg-green-50 dark:bg-green-900/20 animate-pulse' :
                            isExpanded ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      onClick={() => toggleFindingDetails(findingId)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {finding.policyName || 'Unnamed Policy'}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xl">
                            {finding.description || 'No description'}
                          </p>
                          <div className="flex mt-1 items-center space-x-2">
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              {finding.service || 'Unknown'}
                            </span>
                            <span className="text-gray-400">•</span>
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              {formatDate(finding.detectedAt || finding.createdAt)}
                            </span>
                            <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(finding.severity)}`}>
                              {finding.severity || 'Unknown'}
                            </span>
                            <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(finding.status)}`}>
                              {finding.status}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center relative group">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                          <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-xs rounded py-1 px-2 right-0 bottom-full mb-2 pointer-events-none whitespace-nowrap">
                            {isExpanded ? 'Collapse details' : 'Show details'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded detail section with transition */}
                    <div
                      className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
                    >
                      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                          <div className="col-span-2">
                            <h3 className="text-lg font-medium mb-2">Issue Details</h3>
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm mb-4">
                              <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{finding.description}</p>
                              {finding.resourceName && (
                                <div className="mt-3">
                                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Affected Resource:</span>
                                  <p className="text-sm text-gray-800 dark:text-gray-200 font-mono mt-1">{finding.resourceName}</p>
                                </div>
                              )}
                              {finding.location && (
                                <div className="mt-3">
                                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Location:</span>
                                  <p className="text-sm text-gray-800 dark:text-gray-200 font-mono mt-1">{finding.location}</p>
                                </div>
                              )}
                            </div>
                          </div>

                          <div>
                            <h3 className="text-lg font-medium mb-2">Actions</h3>
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                              <div className="flex flex-col space-y-2">
                                <div className="relative group">
                                  <select
                                    className="text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 p-2 w-full"
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        if (e.target.value === 'Whitelisted') {
                                          const reason = prompt('Please provide a reason for whitelisting this finding:');
                                          if (!reason) return;
                                          handleStatusChange(findingId, e.target.value, reason);
                                        } else {
                                          handleStatusChange(findingId, e.target.value);
                                        }
                                        e.target.value = '';
                                      }
                                    }}
                                    defaultValue=""
                                  >
                                    <option value="" disabled>Update Status</option>
                                    <option value="Open">Open</option>
                                    <option value="In Progress">In Progress</option>
                                    <option value="Resolved">Resolved</option>
                                    {user?.role === 'admin' && <option value="Whitelisted">Whitelist</option>}
                                  </select>
                                  <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-xs rounded py-1 px-2 right-0 bottom-full mb-2 pointer-events-none whitespace-nowrap z-10">
                                    Change the status of this finding
                                  </div>
                                </div>

                                <div className="relative group">
                                  <button
                                    onClick={() => handleReportFalsePositive(finding)}
                                    className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 px-2 py-1 border border-blue-600 dark:border-blue-400 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 w-full"
                                    disabled={finding.status === 'Whitelisted'}
                                  >
                                    Report as False Positive
                                  </button>
                                  <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-xs rounded py-1 px-2 right-0 bottom-full mb-2 pointer-events-none whitespace-nowrap z-10">
                                    Report this finding as incorrectly identified to administrators
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <RemediationGuide finding={finding} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6 flex items-center justify-between">
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{(pagination.page - 1) * pagination.limit + 1}</span> to{' '}
                    <span className="font-medium">
                      {Math.min(pagination.page * pagination.limit, pagination.total)}
                    </span>{' '}
                    of <span className="font-medium">{pagination.total}</span> results
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => setPagination({ ...pagination, page: Math.max(1, pagination.page - 1) })}
                      disabled={pagination.page === 1}
                      className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 ${pagination.page === 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Previous
                    </button>

                    {/* Page number buttons */}
                    {Array.from({ length: Math.min(pagination.pages, 5) }, (_, i) => {
                      const pageNum = i + 1;
                      return (
                        <button
                          key={i}
                          onClick={() => setPagination({ ...pagination, page: pageNum })}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${pageNum === pagination.page
                              ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    <button
                      onClick={() => setPagination({ ...pagination, page: Math.min(pagination.pages, pagination.page + 1) })}
                      disabled={pagination.page === pagination.pages}
                      className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 ${pagination.page === pagination.pages ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Next
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}