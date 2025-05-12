'use client';

import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { api } from '@/utils/api';
import { Chart, registerables } from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { useChartConfig } from '@/utils/chartConfig';

// Register Chart.js components
Chart.register(...registerables);

export default function InsightsDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [insights, setInsights] = useState({
    issuesByService: [],
    issuesBySeverity: [],
    issuesTrend: [],
    topIssues: [],
    recentPolicies: []
  });

  const { getCommonOptions } = useChartConfig();
  const chartOptions = getCommonOptions();

  useEffect(() => {
    const fetchInsightsData = async () => {
      try {
        setLoading(true);

        // Fetch insights data from API
        const response = await api.get('/policies/insights');

        if (response.success) {
          setInsights(response.data);
        } else {
          throw new Error(response.message || 'Failed to load insights');
        }
      } catch (err) {
        console.error('Error fetching insights:', err);
        setError(err.message || 'An error occurred while fetching insights');
      } finally {
        setLoading(false);
      }
    };

    fetchInsightsData();
  }, []);

  // Prepare chart data
  const serviceChartData = {
    labels: insights.issuesByService.map(item => item.service),
    datasets: [
      {
        label: 'Issues by Service',
        data: insights.issuesByService.map(item => item.count),
        backgroundColor: [
          '#3b82f6', // blue-500
          '#ef4444', // red-500
          '#f97316', // orange-500
          '#a3e635', // lime-500
          '#06b6d4', // cyan-500
        ],
        borderWidth: 1
      }
    ]
  };

  const severityChartData = {
    labels: insights.issuesBySeverity.map(item => item.severity),
    datasets: [
      {
        label: 'Issues by Severity',
        data: insights.issuesBySeverity.map(item => item.count),
        backgroundColor: [
          '#dc2626', // red-600
          '#ea580c', // orange-600
          '#ca8a04', // yellow-600
          '#16a34a', // green-600
        ],
        borderWidth: 1
      }
    ]
  };

  const trendChartData = {
    labels: insights.issuesTrend.map(item => item.date),
    datasets: [
      {
        label: 'Critical',
        data: insights.issuesTrend.map(item => item.critical),
        borderColor: '#dc2626', // red-600
        backgroundColor: 'rgba(220, 38, 38, 0.1)',
        tension: 0.3,
        fill: true,
      },
      {
        label: 'High',
        data: insights.issuesTrend.map(item => item.high),
        borderColor: '#ea580c', // orange-600
        backgroundColor: 'rgba(234, 88, 12, 0.1)',
        tension: 0.3,
        fill: true,
      },
      {
        label: 'Medium',
        data: insights.issuesTrend.map(item => item.medium),
        borderColor: '#ca8a04', // yellow-600
        backgroundColor: 'rgba(202, 138, 4, 0.1)',
        tension: 0.3,
        fill: true,
      },
      {
        label: 'Low',
        data: insights.issuesTrend.map(item => item.low),
        borderColor: '#16a34a', // green-600
        backgroundColor: 'rgba(22, 163, 74, 0.1)',
        tension: 0.3,
        fill: true,
      }
    ]
  };

  const topIssuesChartData = {
    labels: insights.topIssues.map(issue => issue.description.substring(0, 25) + '...'),
    datasets: [
      {
        label: 'Frequency',
        data: insights.topIssues.map(issue => issue.count),
        backgroundColor: '#3b82f6',
        borderWidth: 1
      }
    ]
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold mb-6">Policy Insights</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Issues by Service */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-medium mb-4">Issues by Service</h2>
          <div className="h-64">
            <Doughnut 
              data={serviceChartData} 
              options={{
                ...chartOptions,
                maintainAspectRatio: false,
                plugins: {
                  ...chartOptions.plugins,
                  legend: {
                    ...chartOptions.plugins.legend,
                    position: 'bottom'
                  },
                  tooltip: {
                    ...chartOptions.plugins.tooltip,
                    callbacks: {
                      label: function(context) {
                        const label = context.label || '';
                        const value = context.raw || 0;
                        const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        const percentage = Math.round((value / total) * 100);
                        return `${label}: ${value} (${percentage}%)`;
                      }
                    }
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Issues by Severity */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-medium mb-4">Issues by Severity</h2>
          <div className="h-64">
            <Doughnut 
              data={severityChartData} 
              options={{
                ...chartOptions,
                maintainAspectRatio: false,
                plugins: {
                  ...chartOptions.plugins,
                  legend: {
                    ...chartOptions.plugins.legend,
                    position: 'bottom'
                  },
                  tooltip: {
                    ...chartOptions.plugins.tooltip,
                    callbacks: {
                      label: function(context) {
                        const label = context.label || '';
                        const value = context.raw || 0;
                        const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        const percentage = Math.round((value / total) * 100);
                        return `${label}: ${value} (${percentage}%)`;
                      }
                    }
                  }
                }
              }}
            />
          </div>
        </div>
      </div>

      {/* Issues Trend */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-medium mb-4">Issues Trend</h2>
        <div className="h-80">
          <Line 
            data={trendChartData} 
            options={{
              ...chartOptions,
              maintainAspectRatio: false,
              scales: {
                x: {
                  title: {
                    display: true,
                    text: 'Date'
                  }
                },
                y: {
                  title: {
                    display: true,
                    text: 'Number of Issues'
                  },
                  min: 0,
                }
              },
              interaction: {
                mode: 'index',
                intersect: false,
              }
            }}
          />
        </div>
      </div>

      {/* Top Issues */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-medium mb-4">Top Issues</h2>
        <div className="h-80">
          <Bar 
            data={topIssuesChartData} 
            options={{
              ...chartOptions,
              maintainAspectRatio: false,
              scales: {
                x: {
                  title: {
                    display: true,
                    text: 'Issue Description'
                  }
                },
                y: {
                  title: {
                    display: true,
                    text: 'Frequency'
                  },
                  min: 0,
                }
              },
              plugins: {
                ...chartOptions.plugins,
                tooltip: {
                  ...chartOptions.plugins.tooltip,
                  callbacks: {
                    title: function(tooltipItems) {
                      const index = tooltipItems[0].dataIndex;
                      return insights.topIssues[index].description;
                    }
                  }
                }
              }
            }}
          />
        </div>
      </div>

      {/* Recent Analyzed Policies */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-medium mb-4">Recent Analyzed Policies</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Policy Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Service
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Risk Level
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Issues
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {insights.recentPolicies.map((policy, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {policy.policyName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {policy.service}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      policy.riskLevel === 'Critical' ? 'bg-red-100 text-red-800' :
                      policy.riskLevel === 'High' ? 'bg-orange-100 text-orange-800' :
                      policy.riskLevel === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {policy.riskLevel}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {policy.issues}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(policy.date).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}