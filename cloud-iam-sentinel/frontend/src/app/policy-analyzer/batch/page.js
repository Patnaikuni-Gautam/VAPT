'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/DashboardLayout';
import { api } from '@/utils/api';
import { Chart, registerables } from 'chart.js';
import { Pie } from 'react-chartjs-2';

// Register Chart.js components
Chart.register(...registerables);

export default function BatchPolicyAnalyzer() {
  const [policies, setPolicies] = useState([
    { policyName: '', policyText: '', policyType: 'auto-detect', id: Date.now() }
  ]);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [saveAnalysis, setSaveAnalysis] = useState(true);
  const [uploadMethod, setUploadMethod] = useState('file'); // Change default to file upload
  const [file, setFile] = useState(null);
  const [analysisDepth, setAnalysisDepth] = useState('standard');
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const [totalPolicies, setTotalPolicies] = useState(0);
  
  // Environment and context settings
  const [environment, setEnvironment] = useState('production');
  const [complianceRequirements, setComplianceRequirements] = useState([]);
  
  // Available policy types
  const policyTypes = ['auto-detect', 'IAM', 'S3', 'Lambda'];
  
  const router = useRouter();
  
  const addPolicy = () => {
    setPolicies([
      ...policies,
      { policyName: '', policyText: '', policyType: 'auto-detect', id: Date.now() }
    ]);
  };
  
  const removePolicy = (id) => {
    if (policies.length > 1) {
      setPolicies(policies.filter(policy => policy.id !== id));
    }
  };
  
  const handlePolicyChange = (id, field, value) => {
    setPolicies(policies.map(policy => 
      policy.id === id ? { ...policy, [field]: value } : policy
    ));
  };
  
  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setError('');
      
      // Read the file content
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          // Try to parse as JSON
          const content = JSON.parse(event.target.result);
          
          // Handle different formats
          if (Array.isArray(content)) {
            // Array of policies
            const formattedPolicies = content.map((policy, index) => {
              // Support different formats and field names
              let policyText = '';
              let policyName = '';
              let policyType = 'auto-detect';
              
              // Handle policy name variations
              if (policy.name) policyName = policy.name;
              else if (policy.policyName) policyName = policy.policyName;
              else policyName = `Policy ${index + 1}`;
              
              // Handle policy type
              if (policy.type && policyTypes.includes(policy.type)) {
                policyType = policy.type;
              } else if (policy.policyType && policyTypes.includes(policy.policyType)) {
                policyType = policy.policyType;
              } else {
                // Try to detect policy type
                if (policy.document && typeof policy.document === 'string') {
                  if (policy.document.includes('"Action": "s3:') || 
                      policy.document.includes('"Resource": "arn:aws:s3:')) {
                    policyType = 'S3';
                  } else if (policy.document.includes('"Action": "lambda:') || 
                            policy.document.includes('"Resource": "arn:aws:lambda:')) {
                    policyType = 'Lambda';
                  }
                }
              }
              
              // Handle policy document/text variations
              if (policy.document) {
                policyText = typeof policy.document === 'string' 
                  ? policy.document 
                  : JSON.stringify(policy.document, null, 2);
              } else if (policy.policyText) {
                policyText = policy.policyText;
              } else if (policy.Statement) {
                // The object itself might be a policy
                policyText = JSON.stringify(policy, null, 2);
              }
              
              return {
                policyName,
                policyText,
                policyType,
                id: Date.now() + index
              };
            });
            
            setPolicies(formattedPolicies);
          } else if (content.policies && Array.isArray(content.policies)) {
            // Nested policies array
            const formattedPolicies = content.policies.map((policy, index) => ({
              policyName: policy.name || `Policy ${index + 1}`,
              policyText: typeof policy.document === 'string' 
                ? policy.document 
                : JSON.stringify(policy.document || policy, null, 2),
              policyType: (policy.type && policyTypes.includes(policy.type)) ? policy.type : 'auto-detect',
              id: Date.now() + index
            }));
            
            setPolicies(formattedPolicies);
          } else if (content.Statement) {
            // Single policy in root of file
            setPolicies([{
              policyName: uploadedFile.name.replace('.json', ''),
              policyText: event.target.result,
              policyType: detectPolicyTypeFromContent(event.target.result),
              id: Date.now()
            }]);
          } else {
            throw new Error('Unrecognized JSON format');
          }
        } catch (err) {
          setError('Invalid JSON file format. Please check your file and try again.');
        }
      };
      reader.readAsText(uploadedFile);
    }
  };
  
  // Helper function to detect policy type from content
  const detectPolicyTypeFromContent = (content) => {
    if (content.includes('"Action": "s3:') || content.includes('"Resource": "arn:aws:s3:')) {
      return 'S3';
    } else if (content.includes('"Action": "lambda:') || content.includes('"Resource": "arn:aws:lambda:')) {
      return 'Lambda';
    }
    return 'IAM';
  };

  // Toggle compliance requirement selection
  const toggleComplianceRequirement = (id) => {
    setComplianceRequirements(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handlePaste = (e) => {
    setPolicies([{
      ...policies[0],
      policyText: e.target.value
    }]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Special handling for pasted JSON in the paste mode
    if (uploadMethod === 'paste' && policies[0].policyText) {
      try {
        // Try to parse the pasted content
        const pastedContent = JSON.parse(policies[0].policyText);
        
        let policiesToSubmit = [];
        
        // Handle array of policies
        if (Array.isArray(pastedContent)) {
          policiesToSubmit = pastedContent.map((policy, index) => {
            // If the item is directly a policy with Statement
            if (policy.Statement) {
              return {
                policyName: `Policy ${index + 1}`,
                policyText: policy,
                policyType: 'auto-detect'
              };
            }
            
            // If it's a structured object with policyName/policyText
            if (policy.policyText) {
              return {
                policyName: policy.policyName || `Policy ${index + 1}`,
                policyText: typeof policy.policyText === 'object' ? 
                  policy.policyText : JSON.parse(policy.policyText),
                policyType: policy.policyType || 'auto-detect'
              };
            }
            
            return null;
          }).filter(p => p !== null);
        } 
        // Handle single policy
        else if (pastedContent.Statement) {
          policiesToSubmit = [{
            policyName: 'Single Policy',
            policyText: pastedContent,
            policyType: 'auto-detect'
          }];
        }
        
        if (policiesToSubmit.length > 0) {
          // Set progress tracking
          setTotalPolicies(policiesToSubmit.length);
          setAnalyzedCount(0);
          
          setError('');
          setResults(null);
          setAnalyzing(true);
        
          // Submit the parsed policies
          const response = await api.post(`/policies/analyze/batch?save=${saveAnalysis ? 'true' : 'false'}`, {
            policies: policiesToSubmit,
            options: {
              analysisDepth,
              context: {
                environment,
                complianceRequirements
              }
            }
          });
          
          if (response.success && response.data) {
            setResults(response.data);
          } else {
            setError(response.message || 'Batch analysis failed');
          }
        } else {
          setError('No valid policies found in the pasted content');
        }
      } catch (error) {
        console.error('Error processing pasted JSON:', error);
        setError('Error parsing JSON: ' + error.message);
      } finally {
        setAnalyzing(false);
      }
      return;
    }
    
    // Rest of the existing handleSubmit code for other upload methods
    // First validate all policies have JSON content
    const invalidPolicies = policies.filter(p => {
      if (!p.policyText.trim()) return true;
      
      try {
        JSON.parse(p.policyText);
        return false;
      } catch (e) {
        return true;
      }
    });
    
    if (invalidPolicies.length > 0) {
      setError(`${invalidPolicies.length} policies have invalid JSON format. Please check policy syntax.`);
      return;
    }
    
    setError('');
    setResults(null);
    setAnalyzing(true);
    
    try {
      const response = await api.post(`/policies/analyze/batch?save=${saveAnalysis ? 'true' : 'false'}`, {
        policies: policies.map(p => ({
          policyName: p.policyName || 'Unnamed Policy',
          policyText: p.policyText,
          policyType: p.policyType || 'auto-detect'
        })),
        options: {
          analysisDepth,
          context: {
            environment,
            complianceRequirements
          }
        }
      });
      
      if (response.success && response.data) {
        setResults(response.data);
      } else {
        setError(response.message || 'Batch analysis failed: Invalid response format');
      }
    } catch (error) {
      console.error('Batch policy analysis error:', error);
      // Provide more specific error message if the backend error mentions "valid"
      if (error.message && error.message.includes('valid')) {
        setError('Policy validation failed. Please check if your policy JSON is valid.');
      } else {
        setError(error.message || 'Failed to analyze policies');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  // Generate data for pie chart
  const generateChartData = () => {
    if (!results) return null;
    
    return {
      labels: ['Critical', 'High', 'Medium', 'Low', 'Good Practices'],
      datasets: [{
        data: [
          results.summary.stats.critical,
          results.summary.stats.high,
          results.summary.stats.medium,
          results.summary.stats.low,
          results.summary.stats.positive
        ],
        backgroundColor: [
          '#dc2626', // red-600
          '#ea580c', // orange-600
          '#ca8a04', // yellow-600
          '#16a34a', // green-600
          '#2563eb', // blue-600
        ],
        borderWidth: 1
      }]
    };
  };
  
  // Generate CSV export from results
  const generateCsvFromResults = () => {
    if (!results) return '';
    
    // Headers
    let csv = 'Policy Name,Policy Type,Valid,Risk Level,Critical,High,Medium,Low,Good Practices,Detection Methods\n';
    
    // Add a row for each policy
    results.results.forEach(result => {
      const row = [
        `"${result.policyName.replace(/"/g, '""')}"`,
        result.policyType || 'IAM',
        result.valid ? 'Yes' : 'No',
        result.valid ? result.overallRisk : 'N/A',
        result.valid ? result.stats.critical : 0,
        result.valid ? result.stats.high : 0,
        result.valid ? result.stats.medium : 0,
        result.valid ? result.stats.low : 0,
        result.valid ? result.stats.positive : 0,
        result.valid ? (result.detectionMethods || 'pattern').replace(/,/g, ';') : 'N/A'
      ];
      csv += row.join(',') + '\n';
    });
    
    // Add summary row
    csv += '\nSummary,,,,'; 
    csv += `${results.summary.stats.critical},`;
    csv += `${results.summary.stats.high},`;
    csv += `${results.summary.stats.medium},`;
    csv += `${results.summary.stats.low},`;
    csv += `${results.summary.stats.positive}\n`;
    
    return csv;
  };
  
  return (
    <DashboardLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold dark:text-white">Batch Policy Analyzer</h1>
        <div className="flex space-x-2">
          <Link 
            href="/policy-analyzer"
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          >
            Single Policy Analysis
          </Link>
        </div>
      </div>
      
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <div className="mb-6">
          <div className="flex space-x-4 mb-4">
            <button
              type="button"
              onClick={() => setUploadMethod('file')}
              className={`px-4 py-2 rounded ${
                uploadMethod === 'file' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              Upload JSON File
            </button>
            <button
              type="button"
              onClick={() => setUploadMethod('paste')}
              className={`px-4 py-2 rounded ${
                uploadMethod === 'paste' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              Paste JSON
            </button>
            <button
              type="button"
              onClick={() => setUploadMethod('manual')}
              className={`px-4 py-2 rounded ${
                uploadMethod === 'manual' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              Manual Entry
            </button>
          </div>
          
          {uploadMethod === 'file' ? (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-gray-500 mb-4">
                Upload a JSON file containing your policies
              </p>
              <p className="text-xs text-gray-400 mb-3">
                Supported formats: Array of policies, IAM policy set, or single policy JSON
              </p>
              <input 
                type="file" 
                accept=".json"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
              {file && (
                <div className="mt-3 text-sm text-green-600">
                  File loaded: {file.name}
                </div>
              )}
            </div>
          ) : uploadMethod === 'paste' ? (
            <div className="mb-6">
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Paste Policy JSON (array or object)
              </label>
              <textarea
                value={policies[0].policyText}
                onChange={(e) => {
                  setPolicies([{
                    ...policies[0],
                    policyText: e.target.value
                  }]);
                }}
                rows={10}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 dark:bg-gray-700 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline font-mono"
                placeholder='[\n  {\n    "Version": "2012-10-17",\n    "Statement": [...]\n  },\n  {...}\n]'
              />
              <p className="mt-2 text-xs text-gray-400">
                Paste a JSON array of policies, or a single policy JSON. Auto-detection will handle the format.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* Keep the manual entry form, but add instructions */}
              <p className="mb-4 text-sm text-gray-500">
                Use this option if you want to define each policy individually. For batch analysis of multiple policies, 
                the file upload or JSON paste options are recommended.
              </p>
              
              {policies.map((policy, index) => (
                <div key={policy.id} className="mb-6 border rounded-lg p-4 bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
                  <div className="flex justify-between mb-4">
                    <h3 className="font-medium">Policy #{index + 1}</h3>
                    {policies.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePolicy(policy.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-bold mb-2">
                      Policy Name
                    </label>
                    <input
                      type="text"
                      value={policy.policyName}
                      onChange={(e) => handlePolicyChange(policy.id, 'policyName', e.target.value)}
                      className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 dark:bg-gray-700 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline"
                      placeholder={`Policy ${index + 1}`}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-700 text-sm font-bold mb-2">
                      Policy JSON
                    </label>
                    <textarea
                      value={policy.policyText}
                      onChange={(e) => handlePolicyChange(policy.id, 'policyText', e.target.value)}
                      rows={5}
                      className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 dark:text-gray-200 dark:bg-gray-700 dark:border-gray-600 leading-tight focus:outline-none focus:shadow-outline font-mono"
                      placeholder='{\n  "Version": "2012-10-17",\n  "Statement": [...]\n}'
                    />
                  </div>
                </div>
              ))}
              
              <button
                type="button"
                onClick={addPolicy}
                className="mb-6 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                + Add Another Policy
              </button>
            </form>
          )}
          
          {/* Analysis options section - common to all upload methods */}
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="analysisDepth">
                  Analysis Depth
                </label>
                <select
                  id="analysisDepth"
                  value={analysisDepth}
                  onChange={(e) => setAnalysisDepth(e.target.value)}
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                >
                  <option value="basic">Basic - Pattern matching only</option>
                  <option value="standard">Standard - Patterns + Semantic analysis</option>
                  <option value="deep">Deep - Patterns + Semantic + Context analysis</option>
                </select>
              </div>
              
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="environment">
                  Environment Context
                </label>
                <select
                  id="environment"
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                >
                  <option value="development">Development</option>
                  <option value="staging">Staging</option>
                  <option value="production">Production</option>
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center mt-6">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="saveAnalysis"
                  checked={saveAnalysis}
                  onChange={(e) => setSaveAnalysis(e.target.checked)}
                  className="mr-2 h-4 w-4 text-blue-600"
                />
                <label htmlFor="saveAnalysis" className="text-sm text-gray-700">
                  Save analysis results to history
                </label>
              </div>
              
              <button
                type="submit"
                className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center"
                disabled={analyzing}
              >
                {analyzing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  <>
                    Analyze Policies
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
      
      {analyzing && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Analysis Progress</h2>
          <div className="flex justify-between mb-2">
            <span>Analyzing policies...</span>
            <span>{analyzedCount}/{totalPolicies}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full" 
              style={{ width: `${(analyzedCount / totalPolicies) * 100}%` }}
            ></div>
          </div>
        </div>
      )}
      
      {results && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Batch Analysis Results</h2>
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  const dataStr = JSON.stringify(results, null, 2);
                  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                  const exportFileName = `policy-analysis-${new Date().toISOString().slice(0,10)}.json`;
                  
                  const linkElement = document.createElement('a');
                  linkElement.setAttribute('href', dataUri);
                  linkElement.setAttribute('download', exportFileName);
                  linkElement.click();
                }}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
              >
                Export JSON
              </button>
              <button
                onClick={() => {
                  const csvContent = generateCsvFromResults();
                  const dataUri = 'data:text/csv;charset=utf-8,'+ encodeURIComponent(csvContent);
                  const exportFileName = `policy-analysis-${new Date().toISOString().slice(0,10)}.csv`;
                  
                  const linkElement = document.createElement('a');
                  linkElement.setAttribute('href', dataUri);
                  linkElement.setAttribute('download', exportFileName);
                  linkElement.click();
                }}
                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
              >
                Export CSV
              </button>
            </div>
          </div>
          
          <div className="mb-8">
            <div className="flex mb-2">
              <div className={`px-3 py-1 text-white font-semibold rounded-md ${
                results.summary.overallRisk === 'Critical' ? 'bg-red-600' :
                results.summary.overallRisk === 'High' ? 'bg-orange-500' :
                results.summary.overallRisk === 'Medium' ? 'bg-yellow-500' :
                'bg-green-500'
              }`}>
                {results.summary.overallRisk} Overall Risk
              </div>
              {results.summary.riskScore !== undefined && (
                <div className="ml-2 px-3 py-1 bg-gray-200 text-gray-800 font-semibold rounded-md">
                  Score: {results.summary.riskScore}/100
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  <div className="bg-gray-100 p-3 rounded text-center">
                    <div className="text-2xl font-bold">{results.summary.totalPolicies}</div>
                    <div className="text-xs text-gray-500">Total Policies</div>
                  </div>
                  <div className="bg-green-100 p-3 rounded text-center">
                    <div className="text-2xl font-bold text-green-700">{results.summary.validPolicies}</div>
                    <div className="text-xs text-gray-500">Valid Policies</div>
                  </div>
                  <div className="bg-gray-100 p-3 rounded text-center">
                    <div className="text-2xl font-bold">{results.summary.stats.total}</div>
                    <div className="text-xs text-gray-500">Total Issues</div>
                  </div>
                  
                  <div className="bg-red-100 p-3 rounded text-center">
                    <div className="text-2xl font-bold text-red-700">{results.summary.stats.critical}</div>
                    <div className="text-xs text-gray-500">Critical</div>
                  </div>
                  <div className="bg-orange-100 p-3 rounded text-center">
                    <div className="text-2xl font-bold text-orange-700">{results.summary.stats.high}</div>
                    <div className="text-xs text-gray-500">High</div>
                  </div>
                  <div className="bg-yellow-100 p-3 rounded text-center">
                    <div className="text-2xl font-bold text-yellow-700">{results.summary.stats.medium}</div>
                    <div className="text-xs text-gray-500">Medium</div>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-center items-center">
                <div className="w-48 h-48">
                  {generateChartData() && <Pie data={generateChartData()} options={{
                    plugins: {
                      legend: {
                        position: 'right'
                      }
                    }
                  }} />}
                </div>
              </div>
            </div>
          </div>
          
          <h3 className="text-lg font-semibold mb-2">Policies Analysis</h3>
          
          <div className="space-y-6">
            {results.results.map((result, index) => (
              <div 
                key={index} 
                className={`p-4 rounded border ${
                  !result.valid ? 'border-red-200 bg-red-50' :
                  result.overallRisk === 'Critical' ? 'border-red-200 bg-red-50' :
                  result.overallRisk === 'High' ? 'border-orange-200 bg-orange-50' :
                  result.overallRisk === 'Medium' ? 'border-yellow-200 bg-yellow-50' :
                  'border-green-200 bg-green-50'
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium">{result.policyName} ({result.policyType})</h4>
                  {result.valid ? (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium ${
                      result.overallRisk === 'Critical' ? 'bg-red-100 text-red-800' :
                      result.overallRisk === 'High' ? 'bg-orange-100 text-orange-800' :
                      result.overallRisk === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {result.overallRisk} Risk
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium bg-red-100 text-red-800">
                      Invalid
                    </span>
                  )}
                </div>
                
                {!result.valid ? (
                  <div className="text-red-700 text-sm">{result.error}</div>
                ) : (
                  <div>
                    <div className="grid grid-cols-5 gap-2 mb-2">
                      <div className="text-center">
                        <div className="text-xl font-bold text-red-700">{result.stats.critical}</div>
                        <div className="text-xs text-gray-500">Critical</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-orange-700">{result.stats.high}</div>
                        <div className="text-xs text-gray-500">High</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-yellow-700">{result.stats.medium}</div>
                        <div className="text-xs text-gray-500">Medium</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-green-700">{result.stats.low}</div>
                        <div className="text-xs text-gray-500">Low</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-blue-700">{result.stats.positive}</div>
                        <div className="text-xs text-gray-500">Good</div>
                      </div>
                    </div>
                    
                    {/* Display detection methods if available */}
                    {result.detectionMethods && (
                      <div className="mt-2 mb-2 flex flex-wrap gap-2">
                        {result.detectionMethods.includes('pattern') && (
                          <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">
                            Pattern Matching
                          </span>
                        )}
                        {result.detectionMethods.includes('semantic') && (
                          <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                            Semantic Analysis
                          </span>
                        )}
                        {result.detectionMethods.includes('context') && (
                          <span className="px-2 py-1 text-xs bg-teal-100 text-teal-800 rounded-full">
                            Context Analysis
                          </span>
                        )}
                        {result.crossServiceIssues && (
                          <span className="px-2 py-1 text-xs bg-amber-100 text-amber-800 rounded-full">
                            Cross-Service Issues
                          </span>
                        )}
                      </div>
                    )}
                    
                    <div className="mt-2 flex justify-end">
                      <Link 
                        href={`/policy-analyzer?policy=${encodeURIComponent(JSON.stringify({
                          name: result.policyName,
                          text: policies.find(p => 
                            p.policyName === result.policyName || 
                            (!p.policyName && result.policyName === 'Unnamed Policy')
                          )?.policyText || '',
                          type: result.policyType
                        }))}`}
                        className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                      >
                        <span>View Full Analysis</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}