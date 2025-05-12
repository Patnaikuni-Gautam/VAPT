/**
 * Process a multi-policy JSON object
 * @param {Object} multiPolicyObject - Object containing policies for different services
 * @returns {Object} Formatted policies by service
 */
function processMultiPolicyObject(multiPolicyObject) {
  const result = {
    iam: [],
    s3: [],
    lambda: []
  };
  
  if (multiPolicyObject.iam) {
    result.iam = Array.isArray(multiPolicyObject.iam) 
      ? multiPolicyObject.iam
      : [multiPolicyObject.iam];
  }
  
  if (multiPolicyObject.s3) {
    result.s3 = Array.isArray(multiPolicyObject.s3)
      ? multiPolicyObject.s3
      : [multiPolicyObject.s3];
  }
  
  if (multiPolicyObject.lambda) {
    result.lambda = Array.isArray(multiPolicyObject.lambda)
      ? multiPolicyObject.lambda
      : [multiPolicyObject.lambda];
  }
  
  return result;
}

/**
 * Format an IAM role with inline policies
 * @param {Object} role - IAM role object
 * @returns {Array} Formatted policy documents
 */
function formatRolePolicies(role) {
  const policies = [];
  
  // Process inline policies
  if (role.InlinePolicies) {
    for (const [name, document] of Object.entries(role.InlinePolicies)) {
      policies.push({
        name,
        document: typeof document === 'string' ? document : JSON.stringify(document),
        type: 'IAM'
      });
    }
  }
  
  // Process assume role policy
  if (role.AssumeRolePolicyDocument) {
    policies.push({
      name: `${role.RoleName}-AssumeRolePolicy`,
      document: typeof role.AssumeRolePolicyDocument === 'string' 
        ? role.AssumeRolePolicyDocument 
        : JSON.stringify(role.AssumeRolePolicyDocument),
      type: 'IAM'
    });
  }
  
  return policies;
}

/**
 * Format a single policy document
 * @param {Object|string} policyDocument - Policy document
 * @param {string} policyType - Policy type (IAM, S3, Lambda)
 * @returns {Object} Formatted policy
 */
function formatSinglePolicy(policyDocument, policyType = 'IAM') {
  const formattedPolicy = {
    name: 'Unnamed Policy',
    document: typeof policyDocument === 'string' 
      ? policyDocument 
      : JSON.stringify(policyDocument),
    type: policyType
  };
  
  return formattedPolicy;
}

/**
 * Detect the policy type based on content analysis
 * @param {string|Object} policyText - JSON policy text or object to analyze
 * @returns {string} Detected policy type (IAM, S3, Lambda)
 */
function detectPolicyType(policyText) {
  try {
    // Convert to string if input is an object
    const policyString = typeof policyText === 'object' ? JSON.stringify(policyText) : policyText;
    
    // Check for service-specific indicators in policy
    if (policyString.includes('"Action": "s3:') || 
        policyString.includes('"Resource": "arn:aws:s3:')) {
      return 'S3';
    } else if (policyString.includes('"Action": "lambda:') || 
               policyString.includes('"Resource": "arn:aws:lambda:')) {
      return 'Lambda';
    }
    
    return 'IAM'; // Default to IAM if no specific indicators are found
  } catch (error) {
    console.error('Error detecting policy type:', error);
    return 'IAM'; // Default to IAM on error
  }
}

module.exports = {
  processMultiPolicyObject,
  formatRolePolicies,
  formatSinglePolicy,
  detectPolicyType
};