'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { api } from '@/utils/api';
import Link from 'next/link';
import RemediationGuide from '@/components/RemediationGuide';

export default function PolicyAnalyzer() {
  const [policyText, setPolicyText] = useState('');
  const [policyName, setPolicyName] = useState('');
  const [policyType, setPolicyType] = useState('auto-detect');
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [saveAnalysis, setSaveAnalysis] = useState(true);
  const [analysisDepth, setAnalysisDepth] = useState('standard');
  
  // Context options for more accurate analysis
  const [environment, setEnvironment] = useState('production');
  const [isTrustPolicy, setIsTrustPolicy] = useState(false);
  const [complianceRequirements, setComplianceRequirements] = useState([]);
  
  const policyTypes = ['auto-detect', 'IAM', 'S3', 'Lambda'];
  const complianceOptions = [
    { id: 'pci', label: 'PCI DSS' },
    { id: 'hipaa', label: 'HIPAA' },
    { id: 'gdpr', label: 'GDPR' },
    { id: 'nist', label: 'NIST 800-53' }
  ];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const policyParam = params.get('policy');
    
    if (policyParam) {
      try {
        const policyData = JSON.parse(decodeURIComponent(policyParam));
        if (policyData.name) setPolicyName(policyData.name);
        if (policyData.text) setPolicyText(policyData.text);
        if (policyData.type && policyTypes.includes(policyData.type)) {
          setPolicyType(policyData.type);
        }
      } catch (err) {
        console.error('Failed to parse policy parameter', err);
      }
    }
  }, []);

  // Update the analyzePolicy function to send the policyObj directly
  const analyzePolicy = async (formData) => {
    try {
      setAnalyzing(true);
      
      // Ensure the policy is wrapped in a try-catch when parsing the JSON
      let policyObj;
      try {
        policyObj = JSON.parse(formData.policyText);
      } catch (e) {
        setError('Invalid JSON format. Please check your policy syntax.');
        setAnalyzing(false);
        return;
      }
      
      const response = await api.post(`/policies/analyze?save=${formData.saveAnalysis ? 'true' : 'false'}`, {
        // Send the parsed JSON object directly instead of re-stringifying it
        policyText: policyObj,
        policyName: formData.policyName || 'Unnamed Policy',
        policyType: formData.policyType || 'auto-detect',
        options: {
          analysisDepth: formData.analysisDepth || 'standard',
          context: {
            environment: formData.environment || 'production',
            isTrustPolicy: formData.isTrustPolicy || false,
            complianceRequirements: formData.complianceRequirements || []
          }
        }
      });
      
      // Validate response data structure before setting it to state
      if (response.success && response.data) {
        // Handle case where backend doesn't provide expected structure
        if (!response.data.hasOwnProperty('valid')) {
          console.warn('Backend response is missing "valid" property, adding default value');
        }
        
        // Create a fully validated response with all required properties
        const validatedResponse = {
          valid: true, // Default value
          overallRisk: 'Unknown',
          riskScore: 0,
          stats: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
          issues: [],
          // Override with actual values from response if they exist
          ...response.data
        };
        
        setResults(validatedResponse);
      } else {
        // Handle the case where success is true but data is missing
        setError(response.message || 'Analysis failed: Invalid response format');
      }
    } catch (error) {
      console.error('Policy analysis error:', error);
      
      // Provide more specific error message if the backend error mentions "valid"
      if (error.message && error.message.includes('valid')) {
        setError('Policy validation failed. Please check if your policy JSON is valid and has the correct structure for an AWS policy.');
      } else {
        setError(error.message || 'Failed to analyze policy');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  // Add this function to validate JSON before submitting
  const isValidJson = (json) => {
    try {
      JSON.parse(json);
      return true;
    } catch (e) {
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!policyText.trim()) {
      setError('Please enter policy text');
      return;
    }

    // Validate JSON before submitting
    if (!isValidJson(policyText)) {
      setError('Invalid JSON format. Please check your policy syntax.');
      return;
    }

    setError('');
    setResults(null);
    setAnalyzing(true);

    const formData = {
      policyText,
      policyName,
      policyType,
      saveAnalysis,
      analysisDepth,
      environment,
      isTrustPolicy,
      complianceRequirements
    };

    await analyzePolicy(formData);
  };

  const handleReportFalsePositive = async (finding) => {
    try {
      await api.post('/policies/feedback', {
        finding: finding.id,
        description: finding.description,
        severity: finding.severity,
        reason: 'User reported as false positive',
        policyType,
        detectionMethod: finding.detectionMethod
      });
      
      setResults(prevResults => ({
        ...prevResults,
        issues: prevResults.issues.map(issue => 
          issue.id === finding.id 
            ? { ...issue, reported: true } 
            : issue
        )
      }));
      
      alert('False positive reported successfully');
    } catch (err) {
      console.error('Failed to report false positive:', err);
      alert('Failed to report false positive: ' + (err.message || 'Unknown error'));
    }
  };

  // Toggle compliance requirement selection
  const toggleComplianceRequirement = (id) => {
    setComplianceRequirements(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Policy Analyzer</h1>
        <Link 
          href="/policy-analyzer/batch"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Batch Policy Analysis
        </Link>
      </div>
      
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="policyName">
                Policy Name
              </label>
              <input
                type="text"
                id="policyName"
                value={policyName}
                onChange={(e) => setPolicyName(e.target.value)}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                placeholder="My IAM Policy"
              />
            </div>
            
            <div>
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="policyType">
                Policy Type
              </label>
              <select
                id="policyType"
                value={policyType}
                onChange={(e) => setPolicyType(e.target.value)}
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              >
                {policyTypes.map((type) => (
                  <option key={type} value={type}>{type === 'auto-detect' ? 'Auto-detect' : type}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="policyText">
              Policy JSON
            </label>
            <textarea
              id="policyText"
              value={policyText}
              onChange={(e) => setPolicyText(e.target.value)}
              rows={10}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline font-mono"
              placeholder='{\n  "Version": "2012-10-17",\n  "Statement": [...]\n}'
            ></textarea>
          </div>
          
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
          
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="flex items-center">
              <input
                id="saveAnalysis"
                type="checkbox"
                checked={saveAnalysis}
                onChange={(e) => setSaveAnalysis(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="saveAnalysis" className="ml-2 block text-sm text-gray-700">
                Save analysis results
              </label>
            </div>
            
            <div className="flex items-center">
              <input
                id="isTrustPolicy"
                type="checkbox"
                checked={isTrustPolicy}
                onChange={(e) => setIsTrustPolicy(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="isTrustPolicy" className="ml-2 block text-sm text-gray-700">
                Is Trust Policy
              </label>
            </div>
          </div>
          
          {analysisDepth === 'deep' && (
            <div className="mb-6">
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Compliance Requirements
              </label>
              <div className="flex flex-wrap gap-4">
                {complianceOptions.map(option => (
                  <div key={option.id} className="flex items-center">
                    <input
                      id={`compliance-${option.id}`}
                      type="checkbox"
                      checked={complianceRequirements.includes(option.id)}
                      onChange={() => toggleComplianceRequirement(option.id)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor={`compliance-${option.id}`} className="ml-2 block text-sm text-gray-700">
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          
          <button
            type="submit"
            disabled={analyzing}
            className={`${
              analyzing ? 'bg-blue-400' : 'bg-blue-500 hover:bg-blue-700'
            } text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full`}
          >
            {analyzing ? 'Analyzing...' : 'Analyze Policy'}
          </button>
        </form>
      </div>
      
      {results && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Analysis Results</h2>
          
          <div className="mb-4">
            <div className="flex mb-2">
              <div className={`px-3 py-1 text-white font-semibold rounded-md ${
                results.overallRisk === 'Critical' ? 'bg-red-600' :
                results.overallRisk === 'High' ? 'bg-orange-500' :
                results.overallRisk === 'Medium' ? 'bg-yellow-500' :
                'bg-green-500'
              }`}>
                {results.overallRisk} Risk
              </div>
              {results.riskScore !== undefined && (
                <div className="ml-2 px-3 py-1 bg-gray-200 text-gray-800 font-semibold rounded-md">
                  Score: {results.riskScore}/100
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-5 gap-4 mt-2">
              <div className="bg-gray-100 p-3 rounded text-center">
                <div className="text-2xl font-bold">{results.stats.total}</div>
                <div className="text-xs text-gray-500">Total Issues</div>
              </div>
              <div className="bg-red-100 p-3 rounded text-center">
                <div className="text-2xl font-bold text-red-700">{results.stats.critical}</div>
                <div className="text-xs text-gray-500">Critical</div>
              </div>
              <div className="bg-orange-100 p-3 rounded text-center">
                <div className="text-2xl font-bold text-orange-700">{results.stats.high}</div>
                <div className="text-xs text-gray-500">High</div>
              </div>
              <div className="bg-yellow-100 p-3 rounded text-center">
                <div className="text-2xl font-bold text-yellow-700">{results.stats.medium}</div>
                <div className="text-xs text-gray-500">Medium</div>
              </div>
              <div className="bg-green-100 p-3 rounded text-center">
                <div className="text-2xl font-bold text-green-700">{results.stats.low}</div>
                <div className="text-xs text-gray-500">Low</div>
              </div>
            </div>
          </div>
          
          <h3 className="text-lg font-semibold mb-2">Findings</h3>
          
          {results.issues.length === 0 ? (
            <div className="py-4 text-center bg-green-50 rounded border border-green-200">
              <p className="text-green-700">No issues found! Your policy looks good.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {results.issues.map((issue, index) => (
                <div 
                  key={index} 
                  className={`p-4 rounded border ${
                    issue.isPositive ? 'bg-green-50 border-green-200' :
                    issue.severity === 'Critical' ? 'bg-red-50 border-red-200' :
                    issue.severity === 'High' ? 'bg-orange-50 border-orange-200' :
                    issue.severity === 'Medium' ? 'bg-yellow-50 border-yellow-200' :
                    'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center mb-1">
                        {!issue.isPositive && (
                          <span className={`inline-block px-2 py-1 text-xs font-semibold text-white rounded mr-2 ${
                            issue.severity === 'Critical' ? 'bg-red-600' :
                            issue.severity === 'High' ? 'bg-orange-500' :
                            issue.severity === 'Medium' ? 'bg-yellow-500' :
                            'bg-blue-500'
                          }`}>
                            {issue.severity}
                          </span>
                        )}
                        {issue.isPositive && (
                          <span className="inline-block px-2 py-1 text-xs font-semibold text-white bg-green-600 rounded mr-2">
                            Good Practice
                          </span>
                        )}
                        
                        {/* Display detection method */}
                        {issue.detectionMethod && (
                          <span className="inline-block px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded mr-2">
                            {issue.detectionMethod === 'pattern' ? 'Pattern' : 
                            issue.detectionMethod === 'semantic' ? 'Semantic' : 
                            issue.detectionMethod === 'context' ? 'Context' : 
                            issue.detectionMethod}
                          </span>
                        )}
                        
                        {/* Display cross-service impact indicator */}
                        {issue.crossService && (
                          <span className="inline-block px-2 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded mr-2">
                            Cross-Service
                          </span>
                        )}
                        
                        <span className="font-semibold">{issue.description}</span>
                      </div>
                      <p className="text-sm text-gray-600">{issue.recommendation}</p>
                    </div>
                    
                    {!issue.isPositive && !issue.reported && (
                      <button
                        onClick={() => handleReportFalsePositive(issue)}
                        className="text-xs text-gray-500 hover:text-gray-700 flex items-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Report as false positive
                      </button>
                    )}
                    
                    {issue.reported && (
                      <span className="text-xs text-gray-500">Reported as false positive</span>
                    )}
                  </div>
                  
                  {!issue.isPositive && (
                    <RemediationGuide finding={{
                      ...issue, 
                      service: issue.service || policyType === 'auto-detect' ? undefined : policyType
                    }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}