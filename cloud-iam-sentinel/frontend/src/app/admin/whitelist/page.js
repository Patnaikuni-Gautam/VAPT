'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import AdminProtectRoute from '@/components/AdminProtectRoute';
import { api } from '@/utils/api';

export default function WhitelistManager() {
  const [whitelistItems, setWhitelistItems] = useState([]);
  const [stats, setStats] = useState({
    totalRules: 0,
    byService: [],
    bySeverity: []
  });
  const [loading, setLoading] = useState(true);

  // Form state for new whitelist rule
  const [formData, setFormData] = useState({
    pattern: '',
    description: '',
    service: 'IAM',
    severity: 'Critical',
    reason: ''
  });

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const serviceOptions = ['IAM', 'S3', 'Lambda', 'CloudWatch', 'EC2'];
  const severityOptions = ['Critical', 'High', 'Medium', 'Low'];

  // Add this state for false positive reports
  const [falsePosReports, setFalsePosReports] = useState([]);
  const [showReports, setShowReports] = useState(false);

  // Add to your component's state
  const [actionLoading, setActionLoading] = useState({
    approve: false,
    reject: false,
    delete: false
  });

  // Add this to your state declarations
  const [connectionStatus, setConnectionStatus] = useState('unknown');

  // Add this state variable at the top of your component:
  const [activeTab, setActiveTab] = useState('whitelist'); // Default to 'whitelist' tab

  // Add these at the top of your component with your other state variables
  const [reports, setReports] = useState([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 10,
    pages: 0
  });

  // Add this function to check connection
  const checkConnection = async () => {
    try {
      const isConnected = await api.checkConnection();
      setConnectionStatus(isConnected ? 'connected' : 'disconnected');
      return isConnected;
    } catch (error) {
      setConnectionStatus('disconnected');
      return false;
    }
  };

  // Update the fetchWhitelistData function to fetch rules from the new model
  // Update the fetchWhitelistData function to properly handle stats
const fetchWhitelistData = async () => {
  try {
    setLoading(true);

    // Check connection first
    const isConnected = await checkConnection();
    if (!isConnected) {
      throw new Error('Backend service is unavailable. Please make sure the backend server is running.');
    }

    // First fetch the whitelist items
    const response = await api.get('/whitelist');
    console.log('Whitelist response:', response);

    if (!response.success) {
      throw new Error(response.message || 'Failed to fetch whitelist data');
    }

    setWhitelistItems(response.data.whitelistItems || []);
    
    // Then fetch the stats separately
    const statsResponse = await api.get('/whitelist/stats');
    console.log('Whitelist stats response:', statsResponse);
    
    if (statsResponse.success) {
      setStats({
        totalRules: statsResponse.data.totalRules || 0,
        byService: statsResponse.data.byService || [],
        bySeverity: statsResponse.data.bySeverity || []
      });
    } else {
      // If stats endpoint fails, calculate stats from items
      const items = response.data.whitelistItems || [];
      
      // Calculate stats from items
      const totalRules = items.length;
      
      // Calculate service counts
      const serviceMap = {};
      items.forEach(item => {
        if (item.service) {
          serviceMap[item.service] = (serviceMap[item.service] || 0) + 1;
        }
      });
      
      const byService = Object.keys(serviceMap).map(service => ({
        service,
        count: serviceMap[service]
      }));
      
      // Calculate severity counts
      const severityMap = {};
      items.forEach(item => {
        if (item.severity) {
          severityMap[item.severity] = (severityMap[item.severity] || 0) + 1;
        }
      });
      
      const bySeverity = Object.keys(severityMap).map(severity => ({
        severity,
        count: severityMap[severity]
      }));
      
      setStats({
        totalRules,
        byService,
        bySeverity
      });
    }
  } catch (error) {
    console.error('Error fetching whitelist data:', error);
    alert(`Failed to load whitelist data: ${error.message || 'Unknown error'}`);
  } finally {
    setLoading(false);
  }
};

  // Add the fetchReports function
  const fetchReports = async () => {
    try {
      setLoading(true);
      // Add timestamp to prevent caching
      const cacheBuster = new Date().getTime();
      const response = await api.get(`/policies/feedback?t=${cacheBuster}`);
      
      if (response.success) {
        console.log('Fetched false positive reports:', response.data);
        setReports(response.data.feedback || []);
        setPagination(response.data.pagination || {});
      } else {
        throw new Error(response.message || 'Failed to fetch reports');
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
      alert(`Error: ${error.message || 'Failed to fetch reports'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const apiEndpoint = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
    console.log('API endpoint:', apiEndpoint);
    
    // Log the available routes for debugging
    console.log('Expected routes based on backend:');
    console.log('- Fetch reports: GET /policies/feedback');
    console.log('- Approve report: PATCH /policies/false-positive/:id/approve');
    console.log('- Reject report: PATCH /policies/false-positive/:id/reject');
    
    // Initialize data
    const initialize = async () => {
      try {
        // First check connection
        const isConnected = await checkConnection();
        console.log('Connection status:', isConnected ? 'Connected' : 'Disconnected');
        
        if (isConnected) {
          // Load data sequentially to avoid race conditions
          await fetchWhitelistData();
          await fetchReports();
        } else {
          console.error('Cannot connect to server');
          alert('Cannot connect to the server. Please check if the backend server is running.');
        }
      } catch (error) {
        console.error('Initialization error:', error);
      }
    };
    
    initialize();
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchReports();
    
    // Set up auto-refresh every 30 seconds
    const interval = setInterval(() => {
      if (activeTab === 'reports') {
        fetchReports();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [activeTab]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);

    // Form validation
    if (!formData.pattern.trim()) {
      setFormError('Pattern is required');
      setSubmitting(false);
      return;
    }

    if (!formData.description.trim()) {
      setFormError('Description is required');
      setSubmitting(false);
      return;
    }

    if (!formData.reason.trim()) {
      setFormError('Reason is required');
      setSubmitting(false);
      return;
    }

    try {
      const response = await api.post('/whitelist', formData);

      if (response.success) {
        const newItem = response.data.rule;

        // Add new rule to the list
        setWhitelistItems(prev => [newItem, ...prev]);

        // Update stats
        setStats(prev => {
          // Find if service already exists in stats
          const serviceIndex = prev.byService.findIndex(s => s.service === formData.service);
          const severityIndex = prev.bySeverity.findIndex(s => s.severity === formData.severity);

          const updatedByService = [...prev.byService];
          if (serviceIndex >= 0) {
            updatedByService[serviceIndex] = {
              ...updatedByService[serviceIndex],
              count: updatedByService[serviceIndex].count + 1
            };
          } else {
            updatedByService.push({ service: formData.service, count: 1 });
          }

          const updatedBySeverity = [...prev.bySeverity];
          if (severityIndex >= 0) {
            updatedBySeverity[severityIndex] = {
              ...updatedBySeverity[severityIndex],
              count: updatedBySeverity[severityIndex].count + 1
            };
          } else {
            updatedBySeverity.push({ severity: formData.severity, count: 1 });
          }

          return {
            totalRules: prev.totalRules + 1,
            byService: updatedByService,
            bySeverity: updatedBySeverity
          };
        });

        setFormSuccess('Whitelist rule created successfully');
        setFormData({
          pattern: '',
          description: '',
          service: 'IAM',
          severity: 'Critical',
          reason: ''
        });
        setShowForm(false);
      } else {
        throw new Error(response.message || 'Failed to create whitelist rule');
      }
    } catch (error) {
      setFormError(error.message || 'Failed to create whitelist rule');
    } finally {
      setSubmitting(false);
    }
  };

  // Update handleDelete to work with WhitelistRule IDs
  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this whitelist rule?')) {
      return;
    }
  
    try {
      setActionLoading(prev => ({ ...prev, delete: id }));
      
      // Debug the ID
      console.log('Attempting to delete whitelist rule with ID:', id);
      
      // Directly delete from the whitelist endpoint - this now deletes from WhitelistRule
      const response = await api.delete(`/whitelist/${id}`);
      
      console.log('Delete response:', response);
  
      if (response.success) {
        // Update the UI by removing the item
        setWhitelistItems(prev => prev.filter(item => (item._id !== id && item.id !== id)));
        
        // Update stats
        setStats(prev => {
          const itemToUpdate = whitelistItems.find(item => (item._id === id || item.id === id));
          if (!itemToUpdate) return prev;
          
          // Update service count
          const updatedByService = prev.byService.map(s => {
            if (s.service === itemToUpdate.service) {
              return { ...s, count: Math.max(0, s.count - 1) };
            }
            return s;
          }).filter(s => s.count > 0);
          
          // Update severity count
          const updatedBySeverity = prev.bySeverity.map(s => {
            if (s.severity === itemToUpdate.severity) {
              return { ...s, count: Math.max(0, s.count - 1) };
            }
            return s;
          }).filter(s => s.count > 0);
          
          return {
            totalRules: Math.max(0, prev.totalRules - 1),
            byService: updatedByService,
            bySeverity: updatedBySeverity
          };
        });
        
        alert('Whitelist rule deleted successfully');
      } else {
        throw new Error(response.message || 'Failed to delete whitelist rule');
      }
    } catch (error) {
      console.error('Failed to delete whitelist rule:', error);
      alert(`Error: ${error.message || 'Failed to delete whitelist rule'}`);
    } finally {
      setActionLoading(prev => ({ ...prev, delete: false }));
    }
  };

  // Add the approve and reject handlers
  const handleApprove = async (reportId) => {
    if (!confirm('Are you sure you want to approve this false positive report?')) {
      return;
    }

    try {
      setActionLoading(prev => ({ ...prev, approve: reportId }));
      const response = await api.put(`/policies/feedback/${reportId}`, {
        isApproved: true,
        reason: 'Approved via admin panel'
      });

      if (response.success) {
        // Remove the report from the list and refresh data
        setReports(prev => prev.filter(r => r._id !== reportId));
        // Refresh whitelist data since a new rule was created
        fetchWhitelistData();
        alert('False positive report approved successfully');
      } else {
        throw new Error(response.message || 'Failed to approve report');
      }
    } catch (error) {
      console.error('Error approving report:', error);
      alert(`Error: ${error.message || 'Failed to approve report'}`);
    } finally {
      setActionLoading(prev => ({ ...prev, approve: false }));
    }
  };

  const handleReject = async (reportId) => {
    if (!confirm('Are you sure you want to reject this false positive report?')) {
      return;
    }

    try {
      setActionLoading(prev => ({ ...prev, reject: reportId }));
      const response = await api.put(`/policies/feedback/${reportId}`, {
        isApproved: false,
        reason: 'Rejected via admin panel'
      });

      if (response.success) {
        // Remove the report from the list
        setReports(prev => prev.filter(r => r._id !== reportId));
        alert('False positive report rejected successfully');
      } else {
        throw new Error(response.message || 'Failed to reject report');
      }
    } catch (error) {
      console.error('Error rejecting report:', error);
      alert(`Error: ${error.message || 'Failed to reject report'}`);
    } finally {
      setActionLoading(prev => ({ ...prev, reject: false }));
    }
  };

  // Add this near the top of your render function:
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'reports') {
      fetchReports();
    } else if (tab === 'whitelist') {
      fetchWhitelistData();
    }
  };

  return (
    <AdminProtectRoute>
      <DashboardLayout>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Whitelist Manager</h1>
            {connectionStatus === 'disconnected' && (
              <div className="mt-2 flex items-center text-red-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>Connection to server lost.
                  <button
                    onClick={checkConnection}
                    className="ml-2 text-blue-600 underline hover:text-blue-800"
                  >
                    Retry
                  </button>
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className={`px-4 py-2 rounded ${showForm
                ? 'bg-gray-500 hover:bg-gray-600'
                : 'bg-blue-500 hover:bg-blue-600'
              } text-white`}
          >
            {showForm ? 'Cancel' : 'Add Whitelist Rule'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-medium text-gray-700 mb-2">Total Whitelist Rules</h3>
            <p className="text-3xl font-bold">{stats.totalRules}</p>
          </div>

          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-medium text-gray-700 mb-2">Rules by Service</h3>
            <div className="space-x-2">
              {stats.byService.map(item => (
                <span
                  key={item.service}
                  className="inline-block px-2 py-1 text-sm bg-blue-100 text-blue-800 rounded mb-1"
                >
                  {item.service}: {item.count}
                </span>
              ))}
              {stats.byService.length === 0 && <p className="text-gray-500">No data</p>}
            </div>
          </div>

          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-medium text-gray-700 mb-2">Rules by Severity</h3>
            <div className="space-x-2">
              {stats.bySeverity.map(item => (
                <span
                  key={item.severity}
                  className={`inline-block px-2 py-1 text-sm rounded mb-1 ${item.severity === 'Critical' ? 'bg-red-100 text-red-800' :
                      item.severity === 'High' ? 'bg-orange-100 text-orange-800' :
                        item.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                    }`}
                >
                  {item.severity}: {item.count}
                </span>
              ))}
              {stats.bySeverity.length === 0 && <p className="text-gray-500">No data</p>}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex">
              <button
                onClick={() => handleTabChange('whitelist')}
                className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                  activeTab === 'whitelist'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Whitelist Rules
              </button>
              <button
                onClick={() => handleTabChange('reports')}
                className={`py-4 px-6 text-center border-b-2 font-medium text-sm ${
                  activeTab === 'reports'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                False Positive Reports
              </button>
            </nav>
          </div>
        </div>

        {showForm && (
          <div className="bg-white p-6 rounded shadow mb-6">
            <h2 className="text-xl font-semibold mb-4">New Whitelist Rule</h2>

            {formError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {formError}
              </div>
            )}

            {formSuccess && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
                {formSuccess}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="col-span-2">
                  <label className="block text-gray-700 mb-2" htmlFor="pattern">
                    Pattern <span className="text-sm text-gray-500">(Regular expression)</span>
                  </label>
                  <input
                    type="text"
                    id="pattern"
                    name="pattern"
                    value={formData.pattern}
                    onChange={handleInputChange}
                    placeholder='e.g., "Action":\\s*"iam:\\*"'
                    className="w-full px-3 py-2 border rounded"
                    required
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-gray-700 mb-2" htmlFor="description">Description</label>
                  <input
                    type="text"
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="e.g., Policy grants all IAM permissions"
                    className="w-full px-3 py-2 border rounded"
                    required
                  />
                </div>

                <div>
                  <label className="block text-gray-700 mb-2" htmlFor="service">Service</label>
                  <select
                    id="service"
                    name="service"
                    value={formData.service}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border rounded"
                  >
                    {serviceOptions.map(service => (
                      <option key={service} value={service}>{service}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 mb-2" htmlFor="severity">Severity</label>
                  <select
                    id="severity"
                    name="severity"
                    value={formData.severity}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border rounded"
                  >
                    {severityOptions.map(severity => (
                      <option key={severity} value={severity}>{severity}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-gray-700 mb-2" htmlFor="reason">
                    Reason for Whitelisting
                  </label>
                  <textarea
                    id="reason"
                    name="reason"
                    value={formData.reason}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="Explain why this pattern should be whitelisted"
                    required
                  ></textarea>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-4 py-2 rounded ${submitting
                      ? 'bg-blue-300'
                      : 'bg-blue-500 hover:bg-blue-600'
                    } text-white`}
                >
                  {submitting ? 'Creating...' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p>Loading data...</p>
          </div>
        ) : activeTab === 'whitelist' ? (
          <div>
            {/* Existing Whitelist Rules Table */}
            <div className="bg-white rounded shadow overflow-x-auto">
              {whitelistItems.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No whitelist rules found. Create your first rule to get started.
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-100 text-left text-gray-600 font-semibold">
                      <th className="px-6 py-3">Pattern</th>
                      <th className="px-6 py-3">Description</th>
                      <th className="px-6 py-3">Service</th>
                      <th className="px-6 py-3">Severity</th>
                      <th className="px-6 py-3">Created</th>
                      <th className="px-6 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {whitelistItems.map(item => (
                      <tr key={item.id || item._id}>
                        <td className="px-6 py-4 font-mono text-sm">{item.pattern}</td>
                        <td className="px-6 py-4">{item.description}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                            {item.service}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs ${item.severity === 'Critical' ? 'bg-red-100 text-red-800' :
                              item.severity === 'High' ? 'bg-orange-100 text-orange-800' :
                                item.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-blue-100 text-blue-800'
                            }`}>
                            {item.severity}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleDelete(item._id)}
                            disabled={actionLoading.delete === item._id}
                            className="text-red-600 hover:text-red-900"
                          >
                            {actionLoading.delete === item._id ?
                              <span className="flex items-center">
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Deleting...
                              </span> :
                              'Delete'
                            }
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <div>
            {/* False Positive Reports Table */}
            <div className="bg-white rounded shadow overflow-x-auto">
              {reports.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No false positive reports found.
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-100 text-left text-gray-600 font-semibold">
                      <th className="px-6 py-3">Policy Name</th>
                      <th className="px-6 py-3">Service</th>
                      <th className="px-6 py-3">Severity</th>
                      <th className="px-6 py-3">Reason</th>
                      <th className="px-6 py-3">Reported By</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {reports.map(report => (
                      <tr key={report._id || report.id} className="border-b">
                        <td className="px-4 py-3">{report.policyName}</td>
                        <td className="px-4 py-3">{report.service}</td>
                        <td className="px-4 py-3">{report.originalSeverity}</td>
                        <td className="px-4 py-3">
                          <span className="truncate block max-w-xs" title={report.reason}>
                            {report.reason}
                          </span>
                          {/* Show when the report was last updated */}
                          <span className="text-xs text-gray-500">
                            {report.updatedAt ? `Updated: ${new Date(report.updatedAt).toLocaleString()}` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {report.user && report.user.email ? report.user.email : 'Unknown'}
                        </td>
                        <td className="px-4 py-3">
                          {report.isApproved === null ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              In Review
                            </span>
                          ) : report.isApproved === true ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Approved
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Rejected
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleApprove(report._id || report.id)}
                              disabled={actionLoading.approve === report._id}
                              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm flex items-center disabled:opacity-50"
                            >
                              {actionLoading.approve === report._id ? (
                                <span>Processing...</span>
                              ) : (
                                <span>Approve</span>
                              )}
                            </button>
                            <button
                              onClick={() => handleReject(report._id || report.id)}
                              disabled={actionLoading.reject === report._id}
                              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm flex items-center disabled:opacity-50"
                            >
                              {actionLoading.reject === report._id ? (
                                <span>Processing...</span>
                              ) : (
                                <span>Reject</span>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </DashboardLayout>
    </AdminProtectRoute>
  );
}