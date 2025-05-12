/**
 * Model for tracking false positive feedback submitted by users
 * @typedef {import('../../models/falsePositiveFeedbackModel')} FalsePositiveFeedback
 */
const FalsePositiveFeedback = require('../../models/falsePositiveFeedbackModel');

/**
 * Model for storing policy findings
 * @typedef {import('../../models/policyFindingModel')} PolicyFinding
 */
const PolicyFinding = require('../../models/policyFindingModel');

/**
 * Model for whitelist rules
 * @typedef {import('../../models/whitelistRuleModel')} WhitelistRule
 */
const WhitelistRule = require('../../models/whitelistRuleModel');

/**
 * Utility for detecting account and role types
 */
const { detectAccountAndRoleType } = require('./utils/accountTypeDetector');

/**
 * Base policy analyzer with common functionality
 */
class BaseAnalyzer {
  constructor() {
    this.patterns = [];
    this.serviceType = 'Generic';
  }

  /**
   * Generates a consistent ID for findings
   * @param {string} prefix - Optional prefix for the ID
   * @returns {string} Unique finding ID
   */
  generateFindingId(prefix = '') {
    const idPrefix = prefix || this.serviceType;
    return `${idPrefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }
  
  /**
   * Creates a standardized finding object
   * @param {string} severity - Finding severity (Critical, High, Medium, Low)
   * @param {string} description - Description of the issue
   * @param {string} recommendation - Remediation recommendation
   * @param {Object} options - Additional finding options
   * @param {string} [options.type='security'] - Finding type (security, best-practice, compliance)
   * @param {boolean} [options.isPositive=false] - Whether finding is a positive security practice
   * @param {string} [options.detectionMethod='pattern'] - How the issue was detected (pattern, semantic, context)
   * @param {boolean} [options.crossService=false] - Whether finding spans multiple services
   * @param {string} [options.idPrefix] - Optional prefix for the finding ID
   * @returns {Object} Standardized finding object
   */
  createFinding(severity, description, recommendation, options = {}) {
    return {
      id: this.generateFindingId(options.idPrefix),
      type: options.type || 'security',
      severity,
      description,
      recommendation,
      isPositive: options.isPositive || false,
      detectionMethod: options.detectionMethod || 'pattern',
      crossService: options.crossService || false
    };
  }

  /**
   * Normalizes and provides defaults for context object
   * @param {Object} context - Input context object
   * @returns {Object} Normalized context with default values
   */
  normalizeContext(context = {}) {
    return {
      // Environment information
      environment: context.environment || 'unknown',
      accountId: context.accountId || null,
      region: context.region || null,
      
      // Resource information
      resourceType: context.resourceType || null,
      resourceName: context.resourceName || null,
      resourceArn: context.resourceArn || null,
      
      // Policy information
      policyName: context.policyName || null,
      isTrustPolicy: !!context.isTrustPolicy,
      roleName: context.roleName || null,
      
      // Compliance context
      complianceRequirements: context.complianceRequirements || [],
      
      // Service-specific contextual information
      bucketInfo: context.bucketInfo || null,
      functionInfo: context.functionInfo || null,
      
      // Cross-service context
      allPolicies: context.allPolicies || null,
      integrations: context.integrations || null,
      
      // Preserve any other provided properties
      ...context
    };
  }

  /**
   * Analyzes a policy using defined patterns, semantic analysis, and contextual evaluation
   * @param {string|Object} policyInput - The policy text or object
   * @param {object} options - Analysis options
   * @returns {Object} Analysis results
   */
  analyzePolicy(policyInput, options = {}) {
    const findings = [];
    let policy;
    let policyText;

    // Handle the input based on its type
    if (typeof policyInput === 'object' && policyInput !== null) {
      policy = policyInput;
      policyText = JSON.stringify(policy);
    } else if (typeof policyInput === 'string') {
      try {
        policy = JSON.parse(policyInput);
        policyText = policyInput;
      } catch (error) {
        return {
          valid: false,
          error: 'Invalid JSON format: ' + error.message,
          issues: []
        };
      }
    } else {
      return {
        valid: false,
        error: 'Invalid policy input type',
        issues: []
      };
    }

    // Detect account and role type automatically from policy content
    const detectedAccountInfo = detectAccountAndRoleType(policy);
    
    // Apply regex-based pattern matching on the string version
    this.applyPatternMatching(policyText, findings);
    this.applyCommonPatterns(policyText, findings);
    
    // Perform semantic analysis on the object version with account context
    try {
      this.performSemanticAnalysis(policy, findings, {
        ...options,
        accountInfo: detectedAccountInfo
      });
    } catch (error) {
      console.error('Error during semantic analysis:', error);
    }
    
    // Normalize context and perform contextual analysis
    const normalizedContext = this.normalizeContext({
      ...options.context || {},
      accountInfo: detectedAccountInfo
    });
    
    this.analyzeContext(policyText, normalizedContext, findings);
    
    // Calculate statistics and overall risk
    const stats = this.calculateStatistics(findings);
    const riskScore = this.calculateRiskScore(policyText, findings, detectedAccountInfo);
    const overallRisk = this.determineOverallRisk(stats, detectedAccountInfo);
    
    return {
      valid: true,
      issues: findings,
      overallRisk,
      riskScore,
      stats,
      accountInfo: detectedAccountInfo // Include detected account info in results
    };
  }

  /**
   * Calculate statistics from findings
   * @param {Array} findings - The findings array
   * @returns {Object} Statistics object
   */
  calculateStatistics(findings) {
    const stats = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      positive: 0,
      get total() {
        return this.critical + this.high + this.medium + this.low + this.positive;
      }
    };

    findings.forEach(finding => {
      if (finding.isPositive) {
        stats.positive++;
        return;
      }

      switch (finding.severity) {
        case 'Critical': stats.critical++; break;
        case 'High': stats.high++; break;
        case 'Medium': stats.medium++; break;
        case 'Low': stats.low++; break;
      }
    });

    return stats;
  }

  /**
   * Determine overall risk level based on statistics
   * @param {Object} stats - Statistics object
   * @param {Object} accountInfo - Detailed account information
   * @returns {string} Overall risk level
   */
  determineOverallRisk(stats, accountInfo) {
    // Default risk levels based on findings
    let riskLevel = 'Low';
    
    if (stats.critical > 0) {
      riskLevel = 'Critical';
    } else if (stats.high > 0) {
      riskLevel = 'High';
    } else if (stats.medium > 0) {
      riskLevel = 'Medium';
    }
    
    // Adjust based on account type and role type
    if (accountInfo) {
      // Root accounts can handle higher permissions
      if (accountInfo.accountType === 'root-account') {
        if (riskLevel === 'High') riskLevel = 'Medium';
        if (riskLevel === 'Medium') riskLevel = 'Low';
      }
      
      // Admin accounts can also handle higher permissions
      else if (accountInfo.accountType === 'admin-account') {
        // Only downgrade if it's not Critical
        if (riskLevel === 'High') riskLevel = 'Medium';
      }
      
      // Service-linked roles have pre-defined permissions set by AWS
      else if (accountInfo.roleType === 'service-linked-role') {
        if (riskLevel === 'High') riskLevel = 'Medium';
      }
      
      // Cross-account roles pose higher risk
      else if (accountInfo.accountType === 'cross-account') {
        if (riskLevel === 'Medium') riskLevel = 'High';
      }
    }
    
    return riskLevel;
  }

  /**
   * Apply regex-based pattern matching
   * @param {string} policyText - The policy JSON as a string
   * @param {Array} findings - Array to add findings to
   */
  applyPatternMatching(policyText, findings) {
    this.patterns.forEach(rule => {
      if (rule.pattern.test(policyText)) {
        findings.push(this.createFinding(
          rule.severity, 
          rule.description, 
          rule.recommendation, 
          { 
            isPositive: rule.isPositive || false, 
            detectionMethod: 'pattern'
          }
        ));
      }
    });
  }

  /**
   * Apply common patterns that apply to all policy types
   * @param {string} policyText - The policy JSON as a string
   * @param {Array} findings - Array to add findings to
   */
  applyCommonPatterns(policyText, findings) {
    const commonPatterns = [
      {
        pattern: /"Effect":\s*"Allow".*"Action":\s*"\*"/i,
        severity: 'Critical',
        description: 'Policy allows all actions',
        recommendation: 'Never use wildcard in Action when Effect is Allow'
      },
      {
        pattern: /"Effect":\s*"Allow".*"NotAction"/i,
        severity: 'High',
        description: 'Policy uses NotAction with Allow effect',
        recommendation: 'Avoid using NotAction with Allow effect as it grants all permissions except those listed'
      },
      {
        pattern: /"Resource":\s*"\*"/i,
        severity: 'High',
        description: 'Policy uses wildcard for all resources',
        recommendation: 'Specify exact resource ARNs instead of using wildcards'
      },
      {
        pattern: /"Condition":\s*{[^}]*"Bool":\s*{[^}]*"aws:MultiFactorAuthPresent":\s*"true"/i,
        severity: 'Low',
        description: 'Policy requires MFA',
        recommendation: 'This is a good security practice - requiring MFA for sensitive actions',
        isPositive: true
      },
      {
        pattern: /"Condition":\s*{[^}]*"Bool":\s*{[^}]*"aws:SecureTransport":\s*"true"/i,
        severity: 'Low',
        description: 'Policy requires secure transport (HTTPS)',
        recommendation: 'This is a good security practice - requiring HTTPS for data transfer',
        isPositive: true
      }
    ];

    commonPatterns.forEach(rule => {
      if (rule.pattern.test(policyText)) {
        findings.push(this.createFinding(
          rule.severity,
          rule.description,
          rule.recommendation,
          {
            isPositive: rule.isPositive || false,
            detectionMethod: 'pattern'
          }
        ));
      }
    });
  }

  /**
   * Perform semantic analysis on the policy
   * @param {Object} policy - The parsed policy object
   * @param {Array} findings - Array to add findings to
   * @param {object} options - Analysis options
   */
  performSemanticAnalysis(policy, findings, options = {}) {
    if (!policy.Statement) return;

    const statements = Array.isArray(policy.Statement) ? policy.Statement : [policy.Statement];
    statements.forEach(statement => this.analyzeStatement(statement, findings, options));
  }

  /**
   * Analyze a single policy statement semantically
   * @param {Object} statement - Policy statement object
   * @param {Array} findings - Array to add findings to
   * @param {object} options - Analysis options
   */
  analyzeStatement(statement, findings, options = {}) {
    // Skip Deny statements as they're generally reducing permissions
    if (statement.Effect !== 'Allow') {
      return;
    }

    // Analyze conditional access controls
    if (statement.Condition) {
      this.analyzeConditionalAccess(statement, findings);
    }
  }

  /**
   * Analyze conditional access controls in a statement
   * @param {Object} statement - Policy statement
   * @param {Array} findings - Findings array to append to
   */
  analyzeConditionalAccess(statement, findings) {
    // Check for weak conditional operators
    if (this.hasWeakConditionOperator(statement.Condition)) {
      findings.push(this.createFinding(
        'Low',
        'Policy uses weak condition operators (IfExists)',
        'Use strong condition operators when possible to prevent permission bypass',
        { detectionMethod: 'semantic' }
      ));
    }
  }

  /**
   * Check if condition contains weak/ineffective operators
   * @param {Object} condition - The condition object
   * @returns {boolean} True if condition contains weak operators
   */
  hasWeakConditionOperator(condition) {
    if (!condition) return false;

    const weakOperators = [
      'StringEqualsIfExists',
      'StringLikeIfExists',
      'NumericEqualsIfExists',
      'DateEqualsIfExists',
      'BoolIfExists',
      'ArnEqualsIfExists',
      'ArnLikeIfExists'
    ];

    return Object.keys(condition).some(key => weakOperators.includes(key));
  }

  /**
   * Check if a condition contains specific operator and key combinations
   * @param {Object} condition - The condition object to check
   * @param {Array} operators - Array of condition operators to check
   * @param {Array} keys - Array of condition keys to check
   * @param {*} value - Optional specific value to match (if null, just checks key existence)
   * @returns {boolean} True if condition matches any operator+key combination
   */
  hasConditionMatch(condition, operators, keys, value = null) {
    if (!condition) return false;
    
    for (const operator of operators) {
      if (!condition[operator]) continue;
      
      for (const key of keys) {
        if (condition[operator][key] === undefined) continue;
        
        // If no specific value to match, any value is acceptable
        if (value === null) return true;
        
        // Check if the value matches (for string comparison or array inclusion)
        const conditionValue = condition[operator][key];
        
        if (Array.isArray(conditionValue)) {
          if (conditionValue.includes(value)) return true;
        } else if (conditionValue === value) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Check if resources include wildcards
   * @param {string|Array} resources - Resources to check
   * @param {boolean} [includePartial=true] - Whether to detect partial wildcards (e.g., "arn:aws:s3:::*")
   * @returns {boolean} True if resources include wildcards
   */
  hasWildcardResource(resources, includePartial = true) {
    if (!resources) return false;
    
    const resourceArray = Array.isArray(resources) ? resources : [resources];
    
    return resourceArray.some(resource => {
      if (typeof resource !== 'string') return false;
      
      // Check for exact '*' wildcard
      if (resource === '*') return true;
      
      // Check for partial wildcards if enabled
      return includePartial && resource.includes('*');
    });
  }

  /**
   * Common condition checking methods (consolidated)
   */
  hasSourceArnCondition(condition) {
    return this.hasConditionMatch(condition, ['ArnLike', 'ArnEquals'], ['aws:SourceArn']);
  }

  hasMfaCondition(condition) {
    return this.hasConditionMatch(condition, ['Bool', 'BoolIfExists'], ['aws:MultiFactorAuthPresent'], 'true');
  }

  hasSecureTransportCondition(condition) {
    return this.hasConditionMatch(condition, ['Bool', 'BoolIfExists'], ['aws:SecureTransport'], 'true');
  }
  
  hasIpRestriction(condition) {
    return this.hasConditionMatch(condition, ['IpAddress', 'NotIpAddress'], ['aws:SourceIp']);
  }

  /**
   * Analyze a policy in the context of other policies and resources
   * @param {string} policyText - The policy JSON as a string
   * @param {Object} context - Contextual information about environment
   * @param {Array} findings - Findings array to append to
   */
  analyzeContext(policyText, context, findings) {
    // Base implementation - to be overridden by specific analyzers
  }

  /**
   * Calculate a numeric risk score for a policy
   * @param {string} policyText - The policy JSON string
   * @param {Array} findings - Current findings
   * @param {Object} accountInfo - Detailed account information
   * @returns {number} Risk score (0-100)
   */
  calculateRiskScore(policyText, findings, accountInfo) {
    let score = 0;
    
    // Base score from findings
    const criticalCount = findings.filter(f => !f.isPositive && f.severity === 'Critical').length;
    const highCount = findings.filter(f => !f.isPositive && f.severity === 'High').length;
    const mediumCount = findings.filter(f => !f.isPositive && f.severity === 'Medium').length;
    const lowCount = findings.filter(f => !f.isPositive && f.severity === 'Low').length;
    const positiveCount = findings.filter(f => f.isPositive).length;
    
    score += criticalCount * 25;
    score += highCount * 15;
    score += mediumCount * 7;
    score += lowCount * 3;
    score -= positiveCount * 10;
    
    // Apply risk multiplier based on account type
    let riskMultiplier = 1.0;
    
    switch (accountInfo.accountType) {
      case 'root-account':
        riskMultiplier = 0.5; // Lower risk for root account
        break;
      case 'admin-account':
        riskMultiplier = 0.7; // Lower risk for admin accounts, but higher than root
        break;
      case 'service-account':
        // Service roles have specialized access needs
        riskMultiplier = accountInfo.roleType === 'service-linked-role' ? 0.6 : 0.8;
        break;
      case 'cross-account':
        riskMultiplier = 1.2; // Higher risk for cross-account access
        break;
      default:
        riskMultiplier = 1.0;
    }
    
    // Apply multiplier to specific patterns
    if (policyText.includes('"Resource": "*"')) score += 10 * riskMultiplier;
    if (policyText.includes('"Action": "*"')) score += 20 * riskMultiplier;
    if (policyText.includes('"NotAction"')) score += 15 * riskMultiplier;
    if (policyText.includes('"Principal": "*"')) score += 25;  // Always high risk
    
    // Additional adjustments based on role type
    if (accountInfo.roleType === 'role-assumption' && accountInfo.assumptionType === 'chaining') {
      score += 10; // Role chaining increases complexity and risk
    }
    
    // Service-specific scoring adjustments
    score = this.applyServiceSpecificScoring(policyText, score, accountInfo);
    
    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Apply service-specific scoring adjustments
   * @param {string} policyText - The policy JSON string
   * @param {number} currentScore - Current risk score
   * @param {Object} accountInfo - Detailed account information
   * @returns {number} Adjusted risk score
   */
  applyServiceSpecificScoring(policyText, currentScore, accountInfo) {
    // Default implementation - override in service-specific analyzers
    return currentScore;
  }

  /**
   * Check if a finding should be excluded based on false positive data
   * @param {Object} finding - The finding to check
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} True if finding should be excluded
   */
  async shouldExcludeFinding(finding, userId) {
    try {
      const falsePositive = await FalsePositiveFeedback.findOne({
        user: userId,
        service: this.serviceType,
        isApproved: true,
        description: finding.description
      });

      return !!falsePositive;
    } catch (error) {
      console.error('Error checking false positives:', error);
      return false;
    }
  }

  /**
   * Save analysis findings to database
   * @param {Object} analysisResult - The analysis result
   * @param {Object} metadata - Policy metadata
   * @param {Object} user - User information
   * @returns {Promise<Array>} Saved findings
   */
  async saveFindings(analysisResult, metadata, user) {
    if (!analysisResult.valid || !analysisResult.issues || analysisResult.issues.length === 0) {
      return [];
    }

    const savedFindings = [];

    // Save each finding
    for (const issue of analysisResult.issues) {
      const finding = new PolicyFinding({
        user: user._id,
        policyName: metadata.policyName,
        // Convert policy text to string if it's an object
        policyText: typeof metadata.policyText === 'object' ? 
          JSON.stringify(metadata.policyText) : metadata.policyText,
        service: this.serviceType,
        severity: issue.severity,
        description: issue.description,
        detectedIssues: [issue.description],
        recommendation: issue.recommendation,
        isPositive: issue.isPositive || false,
        detectionMethod: issue.detectionMethod || 'pattern',
        crossService: issue.crossService || false
      });

      // Check if this should be excluded due to false positives
      const shouldExclude = await this.shouldExcludeFinding(finding, user._id);

      if (!shouldExclude) {
        const savedFinding = await finding.save();
        savedFindings.push(savedFinding);
      }
    }

    return savedFindings;
  }
}

module.exports = BaseAnalyzer;