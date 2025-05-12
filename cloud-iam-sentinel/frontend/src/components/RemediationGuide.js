import React, { useState } from 'react';

/**
 * Component that displays remediation guidance for policy findings
 * @component
 * @param {Object} props - Component props
 * @param {Object} props.finding - The policy finding object
 * @param {string} props.finding.description - Description of the issue
 * @param {string} props.finding.recommendation - Recommended action to fix the issue
 * @param {string} props.finding.service - Service type (IAM, S3, Lambda)
 * @param {string} props.finding.severity - Severity level of the issue
 * @param {string} props.finding.detectionMethod - Method used to detect issue (pattern, semantic, context)
 * @param {boolean} props.finding.crossService - Whether finding impacts multiple services
 * @returns {JSX.Element} Remediation guide component
 */
export default function RemediationGuide({ finding }) {
  const [expanded, setExpanded] = useState(false);

  if (!finding) {
    return (
      <div className="p-4 text-gray-500 border border-gray-200 rounded">
        No finding selected
      </div>
    );
  }

  /**
   * Get service-specific remediation content
   * @returns {JSX.Element} Remediation content for the specific service
   */
  const getServiceSpecificRemediation = () => {
    switch (finding.service) {
      case 'IAM':
        return getIamRemediation(finding);
      case 'S3':
        return getS3Remediation(finding);
      case 'Lambda':
        return getLambdaRemediation(finding);
      default:
        return getDefaultRemediation(finding);
    }
  };
  
  /**
   * Get IAM-specific remediation guidance
   * @param {Object} finding - The policy finding
   * @returns {JSX.Element} IAM remediation guidance
   */
  const getIamRemediation = (finding) => {
    const remediation = finding.recommendation || 'No specific recommendation available';
    
    if (finding.description.includes('wildcard')) {
      return (
        <div>
          <h3 className="font-bold">IAM Permission Remediation:</h3>
          <p>{remediation}</p>
          <pre className="bg-gray-100 p-2 mt-2 rounded text-sm">
            {`{
  "Effect": "Allow",
  "Action": [
    "s3:GetObject",
    "s3:PutObject"
  ],
  "Resource": "arn:aws:s3:::my-bucket/*"
}`}
          </pre>
        </div>
      );
    }
    
    if (finding.description.includes('privilege escalation')) {
      return (
        <div>
          <h3 className="font-bold">Privilege Escalation Risk:</h3>
          <p>{remediation}</p>
          <ul className="list-disc pl-5 mt-2">
            <li>Avoid allowing IAM policy modification permissions</li>
            <li>Use permission boundaries to restrict scope</li>
            <li>Implement strict path restrictions</li>
          </ul>
        </div>
      );
    }
    
    if (finding.description.includes('trust policy')) {
      return (
        <div>
          <h3 className="font-bold">Trust Policy Remediation:</h3>
          <p>{remediation}</p>
          <ul className="list-disc pl-5 mt-2">
            <li>Avoid allowing external principals when unnecessary</li>
            <li>Add condition keys like aws:PrincipalOrgID</li>
            <li>Use aws:SourceIp or aws:SourceVpc restrictions</li>
          </ul>
        </div>
      );
    }
    
    return <p>{remediation}</p>;
  };
  
  /**
   * Get S3-specific remediation guidance
   * @param {Object} finding - The policy finding
   * @returns {JSX.Element} S3 remediation guidance
   */
  const getS3Remediation = (finding) => {
    const remediation = finding.recommendation || 'No specific recommendation available';
    
    if (finding.description.includes('public')) {
      return (
        <div>
          <h3 className="font-bold">S3 Public Access Remediation:</h3>
          <p>{remediation}</p>
          <ul className="list-disc pl-5 mt-2">
            <li>Use AWS Management Console to enable "Block Public Access" settings</li>
            <li>Review and update bucket policy to restrict access</li>
            <li>Consider using presigned URLs for temporary access</li>
          </ul>
        </div>
      );
    }
    
    if (finding.description.includes('encryption')) {
      return (
        <div>
          <h3 className="font-bold">S3 Encryption Remediation:</h3>
          <p>{remediation}</p>
          <ul className="list-disc pl-5 mt-2">
            <li>Enable default encryption on your bucket</li>
            <li>Use S3-managed (SSE-S3) or KMS (SSE-KMS) encryption</li>
            <li>Enforce encryption with bucket policy</li>
          </ul>
          <pre className="bg-gray-100 p-2 mt-2 rounded text-sm">
            {`{
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::my-bucket/*",
  "Condition": {
    "StringNotEquals": {
      "s3:x-amz-server-side-encryption": "AES256"
    }
  }
}`}
          </pre>
        </div>
      );
    }
    
    return <p>{remediation}</p>;
  };
  
  /**
   * Get Lambda-specific remediation guidance
   * @param {Object} finding - The policy finding
   * @returns {JSX.Element} Lambda remediation guidance
   */
  const getLambdaRemediation = (finding) => {
    const remediation = finding.recommendation || 'No specific recommendation available';
    
    if (finding.description.includes('invocation')) {
      return (
        <div>
          <h3 className="font-bold">Lambda Invocation Security:</h3>
          <p>{remediation}</p>
          <ul className="list-disc pl-5 mt-2">
            <li>Restrict which principals can invoke your function</li>
            <li>Add source ARN or source account condition</li>
            <li>Consider using resource-based policies instead of IAM roles when appropriate</li>
          </ul>
          <pre className="bg-gray-100 p-2 mt-2 rounded text-sm">
            {`{
  "Effect": "Allow",
  "Principal": {"Service": "apigateway.amazonaws.com"},
  "Action": "lambda:InvokeFunction",
  "Resource": "arn:aws:lambda:region:account-id:function:my-function",
  "Condition": {
    "ArnLike": {
      "AWS:SourceArn": "arn:aws:execute-api:region:account-id:api-id/stage/method/resource"
    }
  }
}`}
          </pre>
        </div>
      );
    }
    
    if (finding.description.includes('service principal') || finding.description.includes('trusted service')) {
      return (
        <div>
          <h3 className="font-bold">Lambda Service Principal Security:</h3>
          <p>{remediation}</p>
          <ul className="list-disc pl-5 mt-2">
            <li>Be selective about which services can trigger your function</li>
            <li>Always use the most specific resource ARN possible</li>
            <li>Add conditions to restrict service principal permissions</li>
          </ul>
        </div>
      );
    }
    
    if (finding.description.includes('concurrency')) {
      return (
        <div>
          <h3 className="font-bold">Lambda Concurrency Control:</h3>
          <p>{remediation}</p>
          <ul className="list-disc pl-5 mt-2">
            <li>Set reserved concurrency to limit function scaling</li>
            <li>Use provisioned concurrency for stable performance</li>
            <li>Implement circuit breakers in code for dependent services</li>
          </ul>
        </div>
      );
    }
    
    return <p>{remediation}</p>;
  };
  
  /**
   * Get default remediation guidance for other services
   * @param {Object} finding - The policy finding
   * @returns {JSX.Element} Default remediation guidance
   */
  const getDefaultRemediation = (finding) => {
    return <p>{finding.recommendation || 'No specific recommendation available'}</p>;
  };

  return (
    <div className="bg-white p-4 rounded shadow">
      <h2 className="text-lg font-bold mb-2">Remediation Guide</h2>
      <div className="mb-4">
        <span className="font-semibold">Issue: </span>
        <span>{finding.description}</span>
      </div>
      
      <div className="flex flex-wrap gap-2 mb-4">
        <div className={`px-2 py-1 text-xs rounded ${
          finding.severity === 'Critical' ? 'bg-red-100 text-red-800' :
          finding.severity === 'High' ? 'bg-orange-100 text-orange-800' :
          finding.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
          'bg-green-100 text-green-800'
        }`}>
          {finding.severity}
        </div>
        
        <div className="bg-blue-100 text-blue-800 px-2 py-1 text-xs rounded">
          {finding.service || 'General'}
        </div>
        
        {finding.detectionMethod && (
          <div className="bg-purple-100 text-purple-800 px-2 py-1 text-xs rounded">
            {finding.detectionMethod === 'pattern' ? 'Pattern Matching' : 
             finding.detectionMethod === 'semantic' ? 'Semantic Analysis' : 
             finding.detectionMethod === 'context' ? 'Contextual Analysis' : 
             finding.detectionMethod}
          </div>
        )}
        
        {finding.crossService && (
          <div className="bg-amber-100 text-amber-800 px-2 py-1 text-xs rounded">
            Cross-Service Impact
          </div>
        )}
      </div>
      
      <button 
        className="bg-blue-500 text-white px-3 py-1 rounded mb-4"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Hide Details' : 'Show Details'}
      </button>
      
      {expanded && (
        <div className="mt-4">
          {getServiceSpecificRemediation()}
        </div>
      )}
    </div>
  );
}