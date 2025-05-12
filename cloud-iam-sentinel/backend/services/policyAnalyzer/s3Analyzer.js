/**
 * @fileOverview S3-specific policy analyzer that detects potential security issues in S3 bucket policies
 * @module services/policyAnalyzer/s3Analyzer
 * @requires baseAnalyzer
 * @requires utils/resourceFetcher
 */
const BaseAnalyzer = require('./baseAnalyzer');
const { getS3Buckets, getS3BucketPolicy } = require('./utils/resourceFetcher');

/**
 * S3-specific policy analyzer
 * Extends the BaseAnalyzer with S3-specific security checks and patterns
 * @class
 * @extends BaseAnalyzer
 */
class S3Analyzer extends BaseAnalyzer {
  /**
   * Creates an instance of S3Analyzer with S3-specific patterns
   */
  constructor() {
    super();
    this.serviceType = 'S3';
    
    // S3-specific patterns for regex-based analysis
    this.patterns = [
      {
        pattern: /"Action":\s*"s3:\*"/i,
        severity: 'High',
        description: 'Policy grants all S3 permissions',
        recommendation: 'Limit S3 permissions to only those required'
      },
      {
        pattern: /"Effect":\s*"Allow".*"Principal":\s*"\*"/i,
        severity: 'Critical',
        description: 'S3 bucket allows public access',
        recommendation: 'Remove public access unless absolutely necessary'
      },
      {
        pattern: /"Effect":\s*"Allow".*"Principal":\s*{\s*"AWS":\s*"\*"\s*}/i,
        severity: 'Critical',
        description: 'S3 bucket allows public access via AWS Principal',
        recommendation: 'Remove public access via AWS Principal unless absolutely necessary'
      },
      {
        pattern: /"Action":\s*\[?\s*"s3:(PutBucketPolicy|PutBucketAcl)"/i,
        severity: 'Medium',
        description: 'Policy allows modification of bucket permissions',
        recommendation: 'Restrict these permissions to administrative users only'
      },
      {
        pattern: /"Action":\s*\[?\s*"s3:(GetObject|ListBucket)".*"Condition":\s*{\s*"Bool":\s*{\s*"aws:SecureTransport":\s*"false"/i,
        severity: 'High',
        description: 'S3 operations allowed over non-HTTPS connections',
        recommendation: 'Enforce HTTPS by using aws:SecureTransport condition set to true'
      },
      {
        pattern: /"Action":\s*\[?\s*"s3:PutObject".*"Condition".*"StringEquals".*"s3:x-amz-server-side-encryption":\s*"(AES256|aws:kms)"/i,
        severity: 'Low',
        description: 'Policy properly enforces encryption for uploaded objects',
        recommendation: 'This is a good security practice - no change required',
        isPositive: true
      },
      {
        pattern: /"Action":\s*\[?\s*"s3:(GetObject|PutObject).*"Resource":\s*"arn:aws:s3:::.+\/\*"/i,
        severity: 'Medium',
        description: 'Policy grants read and write access to all objects in a bucket without encryption or transport security requirements',
        recommendation: 'Consider adding conditions to enforce encryption and HTTPS'
      },
      {
        pattern: /"Action":\s*\[?\s*"s3:GetObject".*"Resource":\s*"\*"/i,
        severity: 'High',
        description: 'Policy allows reading objects from all buckets',
        recommendation: 'Restrict access to specific buckets and objects'
      },
      {
        pattern: /"Action":\s*\[?\s*"s3:PutObject".*"Resource":\s*"\*"/i,
        severity: 'High',
        description: 'Policy allows writing objects to all buckets',
        recommendation: 'Restrict access to specific buckets and objects'
      },
      {
        pattern: /"Action":\s*\[?\s*"s3:DeleteObject".*"Resource":\s*"\*"/i,
        severity: 'High',
        description: 'Policy allows deleting objects from all buckets',
        recommendation: 'Restrict access to specific buckets and objects'
      }
    ];
  }

  /**
   * Analyze a single policy statement semantically for S3-specific issues
   * @param {Object} statement - Policy statement
   * @param {Array} findings - Findings array to append to
   * @param {Object} options - Analysis options
   */
  analyzeStatement(statement, findings, options = {}) {
    // Skip Deny statements as they're generally reducing permissions
    if (statement.Effect !== 'Allow') {
      return;
    }

    // Call the parent method to analyze conditional access
    super.analyzeStatement(statement, findings, options);

    // Normalize actions to array
    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
    
    // Normalize resources to array
    const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];

    // Check for wildcard resource with specific permissions
    if (resources.includes('*')) {
      this.analyzeWildcardResources(actions, findings);
    }

    // Skip duplicate findings if we already flagged wildcard resources
    if (!resources.includes('*') && resources.some(res => res.includes('s3:'))) {
      // Check if encryption is enforced for PutObject operations
      if (actions.some(action => action === 's3:PutObject') && 
          !this.hasEncryptionCondition(statement.Condition)) {
        findings.push(this.createFinding(
          'Medium',
          'S3 PutObject permission without encryption requirement',
          'Add a condition to enforce server-side encryption',
          { detectionMethod: 'semantic' }
        ));
      }

      // Check for HTTPS enforcement for object operations
      if (actions.some(action => 
          action === 's3:GetObject' || 
          action === 's3:PutObject' || 
          action === 's3:ListBucket') && 
          !this.hasSecureTransportCondition(statement.Condition)) {
        findings.push(this.createFinding(
          'Medium',
          'S3 operations allowed without HTTPS requirement',
          'Add a condition to enforce secure transport',
          { detectionMethod: 'semantic' }
        ));
      }
    }
  }

  /**
   * Check for issues with wildcard resources in S3 policies
   * @param {Array} actions - Array of policy actions
   * @param {Array} findings - Findings array to append to
   */
  analyzeWildcardResources(actions, findings) {
    // Check for object-level permissions on wildcard resource
    const hasObjectActions = actions.some(action => 
      action === 's3:GetObject' || 
      action === 's3:PutObject' || 
      action === 's3:DeleteObject' ||
      action === 's3:*' ||
      action === '*'
    );

    if (hasObjectActions) {
      findings.push(this.createFinding(
        'High',
        'Policy grants object-level permissions on all S3 buckets',
        'Restrict access to specific S3 buckets and use conditions to limit scope',
        { detectionMethod: 'semantic' }
      ));
    }
  }

  /**
   * Check if condition enforces encryption
   * @param {Object} condition - The condition object
   * @returns {boolean} True if encryption is enforced
   */
  hasEncryptionCondition(condition) {
    if (!condition) return false;
    
    // Check for SSE-S3 encryption
    const hasSseS3 = this.hasConditionMatch(
      condition,
      ['StringEquals', 'StringEqualsIfExists'],
      ['s3:x-amz-server-side-encryption'],
      'AES256'
    );
    
    // Check for SSE-KMS encryption
    const hasKmsEncryption = this.hasConditionMatch(
      condition,
      ['StringEquals', 'StringEqualsIfExists'],
      ['s3:x-amz-server-side-encryption'],
      'aws:kms'
    );
    
    // Check for a specific KMS key
    const hasSpecificKmsKey = this.hasConditionMatch(
      condition,
      ['StringEquals', 'StringEqualsIfExists', 'ArnEquals', 'ArnLike'],
      ['s3:x-amz-server-side-encryption-aws-kms-key-id']
    );
    
    return hasSseS3 || hasKmsEncryption || hasSpecificKmsKey;
  }

  /**
   * Analyze context-specific risks for S3 policies
   * @param {string} policyText - The policy JSON as a string
   * @param {Object} context - Contextual information about the environment
   * @param {Array} findings - Array to add findings to
   */
  analyzeContext(policyText, context, findings) {
   try {
    const policy = JSON.parse(policyText);
    const statements = Array.isArray(policy.Statement) ? policy.Statement : [policy.Statement];
    
    // Check for public-accessible buckets in production environments
    if (context.environment === 'production') {
      this.checkProductionPublicAccess(statements, findings);
    }
    
    // Check for encryption requirements in compliance contexts
    if (context.complianceRequirements?.length > 0) {
      this.checkComplianceEncryption(statements, context.complianceRequirements, findings);
    }
  } catch (error) {
      console.error('Error in S3 context analysis:', error);
    }
  }

  /**
   * Check for public access in production environments
   * @param {Array} statements - Policy statements
   * @param {Array} findings - Findings array to append to
   */
  checkProductionPublicAccess(statements, findings) {
    // Check for public access patterns
    const hasPublicAccess = statements.some(statement => 
      statement.Effect === 'Allow' && (
        statement.Principal === '*' || 
        (statement.Principal && statement.Principal.AWS === '*')
      )
    );
    
    if (hasPublicAccess) {
      findings.push(this.createFinding(
        'High',
        'S3 bucket allows public access in a production environment',
        'Remove public access in production unless absolutely necessary',
        { 
          detectionMethod: 'context',  // Explicitly mark as contextual
          crossService: false
        }
      ));
    }
  }

  /**
   * Check for encryption requirements in compliance contexts
   * @param {Array} statements - Policy statements
   * @param {Array} complianceRequirements - Compliance frameworks
   * @param {Array} findings - Findings array to append to
   */
  checkComplianceEncryption(statements, complianceRequirements, findings) {
    if (complianceRequirements.includes('PCI') || 
        complianceRequirements.includes('HIPAA')) {
      
      const enforceEncryption = statements.some(statement => {
        if (!statement.Condition) return false;
        
        return this.hasEncryptionCondition(statement.Condition);
      });
      
      if (!enforceEncryption) {
        findings.push(this.createFinding(
          'High',
          `S3 bucket policy does not enforce encryption in a ${complianceRequirements.join('/')} compliance environment`,
          'Add conditions to enforce server-side encryption for all objects',
          { 
            type: 'compliance',
            detectionMethod: 'context'
          }
        ));
      }
    }
  }

  /**
   * Analyze all S3 bucket policies in the AWS account
   * @async
   * @returns {Promise<Array>} Analysis results for all buckets
   */
  async analyzeAllBuckets() {
    try {
      const buckets = await getS3Buckets();
      const results = [];

      for (const bucket of buckets) {
        try {
          const bucketPolicy = await getS3BucketPolicy(bucket.Name);
          
          if (bucketPolicy) {
            const analysis = this.analyzePolicy(bucketPolicy, {
              context: { bucketInfo: { name: bucket.Name } }
            });
            
            results.push({
              bucketName: bucket.Name,
              analysis
            });
          } else {
            results.push({
              bucketName: bucket.Name,
              analysis: { 
                valid: true, 
                issues: [], 
                overallRisk: 'Low',
                stats: { critical: 0, high: 0, medium: 0, low: 0, positive: 0, total: 0 }
              }
            });
          }
        } catch (error) {
          console.error(`Error analyzing bucket ${bucket.Name}:`, error);
          results.push({
            bucketName: bucket.Name,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error fetching S3 buckets:', error);
      return [];
    }
  }

  /**
   * Apply S3-specific scoring adjustments
   * @param {string} policyText - The policy JSON string
   * @param {number} currentScore - Current risk score
   * @returns {number} Adjusted risk score
   */
  applyServiceSpecificScoring(policyText, currentScore) {
    let score = currentScore;
    
    // S3 dangerous permissions
    if (policyText.includes('s3:PutBucketPolicy')) score += 15;
    if (policyText.includes('s3:PutBucketAcl')) score += 12;
    if (policyText.includes('s3:DeleteBucket')) score += 10;
    if (policyText.includes('s3:ListAllMyBuckets') && policyText.includes('"Resource": "*"')) score += 5;
    
    // Positive S3 practices
    if (policyText.includes('s3:x-amz-server-side-encryption')) score -= 8;
    if (policyText.includes('s3:PutBucketVersioning')) score -= 5;
    if (policyText.includes('s3:PutObjectLegalHold')) score -= 3;
    
    return score;
  }
}

module.exports = new S3Analyzer();