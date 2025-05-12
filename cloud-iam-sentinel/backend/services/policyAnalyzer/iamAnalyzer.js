/**
 * @fileOverview IAM-specific policy analyzer that detects potential security issues in IAM policies
 * @module services/policyAnalyzer/iamAnalyzer
 * @requires baseAnalyzer
 * @requires utils/resourceFetcher
 */
const BaseAnalyzer = require('./baseAnalyzer');
const { getIamRoles } = require('./utils/resourceFetcher');

/**
 * IAM-specific policy analyzer
 * @class
 * @extends BaseAnalyzer
 */
class IamAnalyzer extends BaseAnalyzer {
  /**
   * Creates an instance of IamAnalyzer with IAM-specific patterns
   */
  constructor() {
    super();
    this.serviceType = 'IAM';
    
    // IAM-specific patterns for regex-based analysis
    this.patterns = [
      {
        pattern: /"Action":\s*"iam:\*"/i,
        severity: 'Critical',
        description: 'Policy grants all IAM permissions',
        recommendation: 'Limit IAM permissions to only those required'
      },
      {
        pattern: /"Action":\s*"iam:(PassRole|CreateRole|DeleteRole)"/i,
        severity: 'High',
        description: 'Policy contains sensitive IAM permission',
        recommendation: 'Restrict these permissions to administrative users only'
      },
      {
        pattern: /"Principal":\s*{\s*"AWS":\s*"\*"\s*}/i,
        severity: 'Critical', 
        description: 'Policy allows access from any AWS account',
        recommendation: 'Restrict access to specific AWS accounts or users'
      },
      {
        pattern: /"Action":\s*\[?\s*"iam:(GetAccessKey|CreateAccessKey|DeleteAccessKey)"/i,
        severity: 'High',
        description: 'Policy allows managing access keys',
        recommendation: 'Restrict access key management to administrative users only'
      },
      {
        pattern: /"Action":\s*\[?\s*"iam:(UpdateAssumeRolePolicy|AttachRolePolicy)"/i,
        severity: 'High',
        description: 'Policy allows modifying role trust or permissions',
        recommendation: 'These permissions should be highly restricted as they can be used to escalate privileges'
      }
    ];
    
    // Add positive patterns for good IAM policy practices
    this.positivePatterns = [
      {
        pattern: /"Resource":\s*"arn:aws:iam::[^:]+:user\/\$\{aws:username\}"/i,
        severity: 'Low',
        description: 'Policy uses variable interpolation to limit actions to the current user',
        recommendation: 'This is a good security practice that limits scope to the user making the request',
        isPositive: true
      },
      {
        pattern: /"Effect":\s*"Deny"/i,
        severity: 'Low',
        description: 'Policy includes explicit deny statements which is a security best practice',
        recommendation: 'Explicit denies help enforce restrictions and reduce risk',
        isPositive: true
      },
      {
        pattern: /"Action":\s*\[\s*"iam:Get[^\"]*"\s*,\s*"iam:List[^\"]*"\s*\]/i,
        severity: 'Low',
        description: 'Policy limits IAM actions to read-only operations',
        recommendation: 'Read-only access is a good security practice',
        isPositive: true
      }
    ];
    
    // Add the positive patterns to the patterns array
    this.patterns = [...this.patterns, ...this.positivePatterns];
  }

  /**
   * Analyze a single policy statement semantically for IAM-specific issues
   * @param {Object} statement - Policy statement
   * @param {Array} findings - Findings array to append to
   * @param {Object} options - Analysis options
   */
  analyzeStatement(statement, findings, options = {}) {
    // Explicitly set service type for every analysis
    this.serviceType = 'IAM';

    // Skip the standard check for Deny statements
    if (statement.Effect !== 'Allow') {
      // Instead of skipping, add positive finding for Deny statements
      if (statement.Effect === 'Deny') {
        findings.push(this.createFinding(
          'Low',
          'Policy uses explicit deny which is a security best practice',
          'Explicit denies help enforce restrictions and are preferred over relying on the absence of allows',
          { 
            detectionMethod: 'semantic',
            isPositive: true 
          }
        ));
      }
      return;
    }

    // Call the parent method to analyze conditional access
    super.analyzeStatement(statement, findings, options);

    // Normalize actions and resources to arrays
    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
    const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource];

    // Check for user self-management pattern
    const hasUserSelfLimitation = resources.some(res => 
      typeof res === 'string' && res.includes('${aws:username}')
    );
    
    if (hasUserSelfLimitation) {
      findings.push(this.createFinding(
        'Low',
        'Policy uses variable interpolation to scope permissions to the current user',
        'This is a good security practice that limits scope to the user making the request',
        { 
          detectionMethod: 'semantic',
          isPositive: true 
        }
      ));
    }

    // Check if actions are limited to read-only operations
    const isReadOnly = actions.every(action => 
      action.startsWith('iam:Get') || 
      action.startsWith('iam:List') || 
      action.startsWith('iam:Describe')
    );
    
    if (isReadOnly && actions.length > 0) {
      findings.push(this.createFinding(
        'Low',
        'Policy is limited to read-only IAM operations',
        'Read-only access is a good security practice',
        { 
          detectionMethod: 'semantic',
          isPositive: true 
        }
      ));
    }

    // Check for privilege escalation risks
    if (options.checkPrivilegeEscalation !== false && 
        this.mightAllowPrivilegeEscalation(actions, resources)) {
      findings.push(this.createFinding(
        'High',
        'Policy might allow privilege escalation',
        'Review permissions that can be used to escalate privileges (e.g., iam:PassRole with wildcard resources)',
        { detectionMethod: 'semantic' }
      ));
    }

    // Check for PassRole with wildcard resources
    if (actions.some(action => action === 'iam:PassRole' || action === 'iam:*' || action === '*') && 
        this.hasWildcardResource(resources)) {
      findings.push(this.createFinding(
        'High',
        'Policy allows passing roles to any service',
        'Restrict iam:PassRole to specific roles and services',
        { detectionMethod: 'semantic' }
      ));
    }
  }

  /**
   * Check multiservice document for IAM components 
   * @param {Object} policy - Policy object containing multiple services
   * @param {Array} findings - Findings array to append to
   */
  analyzeMultiServicePolicy(policy, findings) {
    // For multiservice policies, check specifically for IAM components
    if (!policy || !policy.Statement) return;
    
    const statements = Array.isArray(policy.Statement) ? policy.Statement : [policy.Statement];
    
    for (const statement of statements) {
      if (statement.Effect !== 'Allow') continue;
      
      const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
      
      // Look for IAM-specific actions in multiservice policies
      const iamActions = actions.filter(action => 
        action.startsWith('iam:') || action === '*'
      );
      
      if (iamActions.length > 0) {
        findings.push(this.createFinding(
          'High',
          'IAM permissions found in multiservice policy - potential privilege escalation risk',
          'Separate IAM permissions from other service permissions for better security',
          { 
            detectionMethod: 'semantic',
            crossService: true
          }
        ));
        break;
      }
    }
  }

  /**
   * Analyze a policy in the context of other resources and services
   * @param {string} policyText - The policy JSON as a string
   * @param {Object} context - Contextual information about environment
   * @param {Array} findings - Findings array to append to
   */
  analyzeContext(policyText, context, findings) {
    try {
      // Always set service type explicitly
      this.serviceType = 'IAM';
      
      const policy = JSON.parse(policyText);

      // Check if this is a trust policy
      if (context.isTrustPolicy) {
        this.analyzeTrustPolicy(policy, findings);
      }
      
      if (context.allPolicies) {
        this.analyzeRoleForServiceInteractions(policy, context, findings);
      }
      
      // Special handling for multiservice analysis
      if (context.isMultiServiceAnalysis === true) {
        this.analyzeMultiServicePolicy(policy, findings);
      }
    } catch (error) {
      console.error('Error in IAM contextual analysis:', error);
    }
  }

  /**
   * Check if a policy might allow privilege escalation
   * @param {Array<string>} actions - Policy actions
   * @param {Array<string>} resources - Policy resources
   * @returns {boolean} True if policy might allow privilege escalation
   */
  mightAllowPrivilegeEscalation(actions, resources) {
    // List of potentially dangerous permissions that might be used for privilege escalation
    const dangerousActions = [
      'iam:CreatePolicyVersion',
      'iam:SetDefaultPolicyVersion',
      'iam:CreateAccessKey',
      'iam:UpdateAssumeRolePolicy',
      'iam:AttachRolePolicy',
      'iam:AttachUserPolicy',
      'iam:AttachGroupPolicy',
      'iam:PutUserPolicy',
      'iam:PutRolePolicy',
      'iam:PutGroupPolicy',
      'iam:CreatePolicy',
      'iam:CreateRole',
      'iam:PassRole'
    ];

    // Check if policy contains dangerous actions with wildcard resources
    return actions.some(action => 
      (dangerousActions.includes(action) || action === 'iam:*' || action === '*') && 
      this.hasWildcardResource(resources)
    );
  }

  /**
   * Check if condition requires a specific permission boundary
   * @param {Object} condition - The condition object
   * @returns {boolean} True if permission boundary is enforced
   */
  hasPermissionBoundaryCondition(condition) {
    return this.hasConditionMatch(
      condition,
      ['StringEquals', 'ArnEquals'],
      ['iam:PermissionsBoundary']
    );
  }

  /**
   * Check if condition restricts to specific paths
   * @param {Object} condition - The condition object
   * @returns {boolean} True if path is restricted
   */
  hasPathRestriction(condition) {
    return this.hasConditionMatch(
      condition,
      ['StringEquals', 'StringLike'],
      ['iam:ResourcePath']
    );
  }

  /**
   * Analyze trust policy for security risks
   * @param {Object} policy - Trust policy object
   * @param {Array} findings - Findings array to populate
   */
  analyzeTrustPolicy(policy, findings) {
    if (!policy.Statement) return;

    const statements = Array.isArray(policy.Statement) ? policy.Statement : [policy.Statement];
    
    for (const statement of statements) {
      if (statement.Effect !== 'Allow') continue;

      // Check for wildcards in principals
      if (this.allowsExternalPrincipals(statement)) {
        findings.push(this.createFinding(
          'High',
          'Trust policy allows cross-account access with wide permissions',
          'Restrict cross-account access to specific external accounts',
          { 
            detectionMethod: 'semantic',
            crossService: true
          }
        ));
      }
    }
  }

  /**
   * Analyze role for cross-service interactions and potential security issues
   * @param {Object} policy - Policy object
   * @param {Object} context - Context information including other services
   * @param {Array} findings - Findings array to populate
   */
  analyzeRoleForServiceInteractions(policy, context, findings) {
    // Always set service type correctly
    this.serviceType = 'IAM';
    
    // Check for Lambda+S3 interactions
    if (this.allowsLambdaService(policy) && context.allPolicies?.s3?.length > 0) {
      for (const s3Policy of context.allPolicies.s3) {
        if (this.policyHasS3Permission(s3Policy)) {
          findings.push(this.createFinding(
            'Medium',
            'Role assumable by Lambda has S3 permissions - potential cross-service privilege escalation',
            'Ensure Lambda functions use minimal required permissions',
            { 
              detectionMethod: 'context',
              crossService: true
            }
          ));
          break;
        }
      }
    }
    
    // Check context-related IAM permissions
    if (policy.Statement) {
      const statements = Array.isArray(policy.Statement) ? policy.Statement : [policy.Statement];
      
      // Check for dangerous IAM+Lambda combinations
      if (context.allPolicies?.lambda?.length > 0) {
        const hasIamPermissions = statements.some(stmt => 
          stmt.Effect === 'Allow' && 
          this.hasIamManagementAction(stmt.Action));
          
        if (hasIamPermissions) {
          findings.push(this.createFinding(
            'High',
            'IAM management permissions combined with Lambda access creates privilege escalation risk',
            'Separate IAM management from Lambda execution permissions',
            { 
              detectionMethod: 'context',
              crossService: true
            }
          ));
        }
      }
    }
  }

  /**
   * Check if actions include IAM management capabilities
   * @param {Array|string} actions - Policy actions
   * @returns {boolean} True if actions include IAM management capabilities
   */
  hasIamManagementAction(actions) {
    const actionsArray = Array.isArray(actions) ? actions : [actions];
    
    const managementActions = [
      'iam:PassRole', 
      'iam:PutRolePolicy', 
      'iam:CreateRole',
      'iam:AttachRolePolicy',
      'iam:*'
    ];
    
    return actionsArray.some(action => 
      managementActions.includes(action) || action === '*');
  }

  /**
   * Check if policy allows Lambda service to assume the role
   * @param {Object} policy - Policy object
   * @returns {boolean} True if Lambda can assume this role
   */
  allowsLambdaService(policy) {
    if (!policy.Statement) return false;
    
    const statements = Array.isArray(policy.Statement) ? policy.Statement : [policy.Statement];
    
    return statements.some(statement => {
      if (statement.Effect !== 'Allow') return false;
      
      return statement.Principal && 
             statement.Principal.Service && 
             (statement.Principal.Service === 'lambda.amazonaws.com' || 
              (Array.isArray(statement.Principal.Service) && 
               statement.Principal.Service.includes('lambda.amazonaws.com')));
    });
  }

  /**
   * Check if policy has S3 access permissions
   * @param {Object} s3Policy - S3 policy object
   * @returns {boolean} True if policy grants S3 access
   */
  policyHasS3Permission(s3Policy) {
    if (!s3Policy.document) return false;
    
    const document = typeof s3Policy.document === 'string' 
      ? JSON.parse(s3Policy.document) 
      : s3Policy.document;
    
    if (!document.Statement) return false;
    
    const statements = Array.isArray(document.Statement) ? document.Statement : [document.Statement];
    
    return statements.some(statement => {
      if (statement.Effect !== 'Allow') return false;
      
      const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
      return actions.some(action => action === 's3:*' || action === '*');
    });
  }

  /**
   * Check if policy allows external principals
   * @param {Object} statement - Policy statement
   * @returns {boolean} True if external principals are allowed
   */
  allowsExternalPrincipals(statement) {
    if (!statement.Principal) return false;

    // Check for * principal
    if (statement.Principal === '*') return true;

    // Check for * in AWS principal
    if (statement.Principal.AWS) {
      if (statement.Principal.AWS === '*') return true;
      
      const awsPrincipals = Array.isArray(statement.Principal.AWS) 
        ? statement.Principal.AWS 
        : [statement.Principal.AWS];
      
      return awsPrincipals.some(arn => arn === '*' || arn.includes(':root'));
    }

    return false;
  }

  /**
   * Fetch IAM roles and analyze their policies
   * @async
   * @returns {Promise<Array>} Analysis results for all roles
   */
  async analyzeAllRoles() {
    try {
      const roles = await getIamRoles();
      const results = [];

      for (const role of roles) {
        const policyDocs = this.extractPoliciesFromRole(role);
        const roleResult = {
          roleName: role.RoleName,
          findings: []
        };

        for (const policyDoc of policyDocs) {
          const analysis = this.analyzePolicy(policyDoc.document, {
            context: {
              isTrustPolicy: policyDoc.isTrustPolicy,
              roleName: role.RoleName
            }
          });

          if (analysis.valid && analysis.issues.length > 0) {
            roleResult.findings.push({
              policyName: policyDoc.name,
              issues: analysis.issues
            });
          }
        }

        results.push(roleResult);
      }

      return results;
    } catch (error) {
      console.error('Error analyzing all roles:', error);
      return [];
    }
  }

  /**
   * Extract policy documents from an IAM role
   * @param {Object} role - IAM role object
   * @returns {Array} Array of policy document objects
   */
  extractPoliciesFromRole(role) {
    const policies = [];

    // Trust policy
    if (role.AssumeRolePolicyDocument) {
      let trustPolicyDoc = role.AssumeRolePolicyDocument;
      if (typeof trustPolicyDoc !== 'string') {
        trustPolicyDoc = JSON.stringify(trustPolicyDoc);
      }

      policies.push({
        name: `${role.RoleName}-TrustPolicy`,
        document: trustPolicyDoc,
        isTrustPolicy: true
      });
    }

    // Inline policies
    if (role.InlinePolicies) {
      for (const [name, document] of Object.entries(role.InlinePolicies)) {
        policies.push({
          name,
          document: typeof document === 'string' ? document : JSON.stringify(document),
          isTrustPolicy: false
        });
      }
    }

    // Note: Attached policies would need to be fetched separately to get their content

    return policies;
  }

  /**
   * Apply IAM-specific scoring adjustments
   * @param {string} policyText - The policy JSON string
   * @param {number} currentScore - Current risk score
   * @returns {number} Adjusted risk score
   */
  applyServiceSpecificScoring(policyText, currentScore) {
    let score = currentScore;
    
    // IAM dangerous permissions (keep existing code)
    if (policyText.includes('iam:PassRole')) score += 15;
    if (policyText.includes('iam:CreatePolicyVersion')) score += 12;
    if (policyText.includes('iam:SetDefaultPolicyVersion')) score += 12;
    if (policyText.includes('iam:AttachRolePolicy')) score += 10;
    if (policyText.includes('iam:AttachUserPolicy')) score += 10;
    if (policyText.includes('iam:UpdateAssumeRolePolicy')) score += 12;
    
    // Positive IAM practices - stronger reductions
    if (policyText.includes('iam:PermissionsBoundary')) score -= 15;
    if (policyText.includes('iam:ResourceTag')) score -= 10;
    if (policyText.includes('${aws:username}')) score -= 20;  // Variable interpolation
    if (policyText.includes('"Effect": "Deny"')) score -= 15;  // Explicit deny
    
    // Check for read-only patterns
    if (policyText.match(/iam:Get|iam:List/i) && 
        !policyText.match(/iam:Create|iam:Update|iam:Put|iam:Delete/i)) {
      score -= 15;  // Read-only access pattern
    }
    
    return Math.max(0, score); // Ensure score doesn't go negative
  }

  /**
   * Determine overall risk level based on findings statistics
   * @param {Object} stats - Findings statistics
   * @returns {string} Overall risk level
   */
  determineOverallRisk(stats) {
    // Give more weight to positive findings when calculating risk
    const positiveCount = stats.positive || 0;
    
    if (stats.critical > 0) {
      return 'Critical';
    }
    
    // If we have high findings but also positive practices, downgrade to Medium
    if (stats.high > 0) {
      return positiveCount >= 1 ? 'Medium' : 'High';
    }
    
    // With medium findings, we stay at Medium
    if (stats.medium > 0) {
      return 'Medium';
    }
    
    // If we have only low findings or positive practices, it's Low risk
    return 'Low';
  }
}

module.exports = new IamAnalyzer();