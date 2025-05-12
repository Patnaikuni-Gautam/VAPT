const { IAMClient, ListRolesCommand, GetRoleCommand, ListRolePoliciesCommand, GetRolePolicyCommand, ListAttachedRolePoliciesCommand } = require("@aws-sdk/client-iam");
const { S3Client, ListBucketsCommand, GetBucketPolicyCommand } = require("@aws-sdk/client-s3");
const { LambdaClient, ListFunctionsCommand, GetPolicyCommand } = require("@aws-sdk/client-lambda");

// Create clients
const iamClient = new IAMClient();
const s3Client = new S3Client();
const lambdaClient = new LambdaClient();

/**
 * Fetch all IAM roles
 * @returns {Promise<Array>} List of IAM roles
 */
async function getIamRoles() {
  const roles = [];
  let marker;

  do {
    const command = new ListRolesCommand({ Marker: marker });
    const response = await iamClient.send(command);
    
    // Get detailed info for each role including inline policies
    for (const role of response.Roles) {
      const detailedRole = await getDetailedRole(role.RoleName);
      roles.push(detailedRole);
    }
    
    marker = response.Marker;
  } while (marker);

  return roles;
}

/**
 * Get detailed information about an IAM role
 * @param {string} roleName - IAM role name
 * @returns {Promise<Object>} Detailed role information
 */
async function getDetailedRole(roleName) {
  try {
    const command = new GetRoleCommand({ RoleName: roleName });
    const response = await iamClient.send(command);
    
    // Get inline policies
    const inlinePolicies = await getInlinePolicies(roleName);
    
    // Get attached policies
    const attachedPolicies = await getAttachedPolicies(roleName);
    
    return {
      ...response.Role,
      InlinePolicies: inlinePolicies,
      AttachedPolicies: attachedPolicies
    };
  } catch (error) {
    console.error(`Error fetching detailed information for role ${roleName}:`, error);
    throw error;
  }
}

/**
 * Get inline policies for a role
 * @param {string} roleName - IAM role name
 * @returns {Promise<Object>} Map of policy names to policy documents
 */
async function getInlinePolicies(roleName) {
  try {
    const listCommand = new ListRolePoliciesCommand({ RoleName: roleName });
    const listResponse = await iamClient.send(listCommand);
    
    const policyNames = listResponse.PolicyNames || [];
    const policies = {};
    
    for (const policyName of policyNames) {
      const getCommand = new GetRolePolicyCommand({ 
        RoleName: roleName,
        PolicyName: policyName
      });
      
      const policyResponse = await iamClient.send(getCommand);
      policies[policyName] = decodeURIComponent(policyResponse.PolicyDocument);
    }
    
    return policies;
  } catch (error) {
    console.error(`Error fetching inline policies for role ${roleName}:`, error);
    return {};
  }
}

/**
 * Get attached policies for a role
 * @param {string} roleName - IAM role name
 * @returns {Promise<Array>} List of attached policies
 */
async function getAttachedPolicies(roleName) {
  try {
    const command = new ListAttachedRolePoliciesCommand({ RoleName: roleName });
    const response = await iamClient.send(command);
    return response.AttachedPolicies || [];
  } catch (error) {
    console.error(`Error fetching attached policies for role ${roleName}:`, error);
    return [];
  }
}

/**
 * Fetch all S3 buckets
 * @returns {Promise<Array>} List of S3 buckets
 */
async function getS3Buckets() {
  const command = new ListBucketsCommand({});
  const response = await s3Client.send(command);
  return response.Buckets;
}

/**
 * Get bucket policy for a specific S3 bucket
 * @param {string} bucketName - S3 bucket name
 * @returns {Promise<string|null>} Bucket policy as JSON string or null if no policy
 */
async function getS3BucketPolicy(bucketName) {
  try {
    const command = new GetBucketPolicyCommand({ Bucket: bucketName });
    const response = await s3Client.send(command);
    return response.Policy;
  } catch (error) {
    if (error.name === 'NoSuchBucketPolicy') {
      return null;
    }
    throw error;
  }
}

/**
 * Fetch all Lambda functions
 * @returns {Promise<Array>} List of Lambda functions
 */
async function getLambdaFunctions() {
  const functions = [];
  let marker;

  do {
    const command = new ListFunctionsCommand({ Marker: marker });
    const response = await lambdaClient.send(command);
    functions.push(...response.Functions);
    marker = response.NextMarker;
  } while (marker);

  return functions;
}

/**
 * Get resource-based policy for a Lambda function
 * @param {string} functionName - Lambda function name
 * @returns {Promise<string|null>} Policy document as JSON string or null if no policy
 */
async function getLambdaPolicy(functionName) {
  try {
    const command = new GetPolicyCommand({ FunctionName: functionName });
    const response = await lambdaClient.send(command);
    return response.Policy;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return null;
    }
    throw error;
  }
}

module.exports = {
  getIamRoles,
  getDetailedRole,
  getInlinePolicies,
  getAttachedPolicies,
  getS3Buckets,
  getS3BucketPolicy,
  getLambdaFunctions,
  getLambdaPolicy
};