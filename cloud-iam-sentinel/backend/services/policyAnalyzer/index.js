/**
 * @fileOverview Main Policy Analyzer service that coordinates specialized analyzers
 * @module services/policyAnalyzer
 * @requires './iamAnalyzer'
 * @requires './s3Analyzer'
 * @requires './lambdaAnalyzer'
 * @requires './utils/formatters'
 * @requires '../../models/whitelistRuleModel'
 * @requires '../../models/policyFindingModel'
 */
const iamAnalyzer = require('./iamAnalyzer');
const s3Analyzer = require('./s3Analyzer');
const lambdaAnalyzer = require('./lambdaAnalyzer');
const { 
  processMultiPolicyObject, 
  formatRolePolicies, 
  formatSinglePolicy, 
  detectPolicyType 
} = require('./utils/formatters');
const WhitelistRule = require('../../models/whitelistRuleModel');
const PolicyFinding = require('../../models/policyFindingModel');

/**
 * Helper function to create better regex patterns from descriptions
 * @param {string} description - The finding description
 * @returns {string} A regex pattern that will match similar descriptions
 */
function createPatternFromDescription(description) {
  // Replace spaces with flexible whitespace matching
  let pattern = description.replace(/\s+/g, '\\s+');
  
  // Escape special regex characters except spaces (which we've already handled)
  pattern = pattern.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&');
  
  console.log('Created pattern from description:', pattern);
  return pattern;
}

/**
 * Creates intelligent patterns based on policy context and description
 * @param {Object} finding - The complete finding object
 * @returns {string} A smart regex pattern
 */
function createSmartPattern(finding) {
  const { description, service, severity, policyName } = finding;
  
  // Special handling for known patterns based on service
  if (service === 'IAM') {
    if (description.includes('Administrator access')) {
      return '(Administrator|Admin|Full)\\s+(access|privileges|permissions)';
    }
    if (description.includes('wildcard resource')) {
      return '(wildcard|\\*)\\s+(resource|permission|access|action)';
    }
    if (description.includes('privilege escalation')) {
      return '(privilege|access)\\s+(escalation|elevation)';
    }
  }
  
  if (service === 'S3') {
    if (description.includes('public access')) {
      return '(public|unrestricted|open)\\s+(access|read|write|bucket)';
    }
    if (description.includes('encryption')) {
      return '(encryption|encrypt|encrypted)\\s+(missing|required|needed)';
    }
  }
  
  if (service === 'Lambda') {
    if (description.includes('Lambda functions')) {
      return 'Lambda\\s+(function|invoke|execution|invocation)';
    }
    if (description.includes('resource constraints')) {
      return '(resource|memory|timeout)\\s+(constraints|limits|settings)';
    }
  }
  
  // Extract key phrases (3+ word combinations) for more precise matching
  const keyPhrases = extractKeyPhrases(description);
  if (keyPhrases.length > 0) {
    return keyPhrases.map(phrase => phrase.replace(/\s+/g, '\\s+').replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&')).join('|');
  }
  
  // Default to improved space-handling pattern
  return createPatternFromDescription(description);
}

/**
 * Extract meaningful key phrases from text with improved context awareness
 * @param {string} text - Input text
 * @returns {Array<string>} Key phrases
 */
function extractKeyPhrases(text) {
  // Split into words and normalize
  const words = text.split(/\s+/).map(w => w.toLowerCase().trim());
  
  // Extended common words to filter out
  const commonWords = [
    'with', 'that', 'this', 'from', 'have', 'there', 'been', 'being',
    'were', 'are', 'has', 'had', 'would', 'could', 'should', 'what',
    'when', 'where', 'who', 'will', 'more', 'much', 'other', 'than',
    'then', 'they', 'them', 'their', 'the', 'for', 'and', 'but'
  ];
  
  // Keep important security-related words regardless of length
  const importantTerms = [
    'critical', 'high','medium', 'low', 'aws', 'iam', 's3', 'lambda', 'policy', 'access', 'permissions',
    'role', 'user', 'group', 'resource', 'action', 'condition', 'statement',
    'allow', 'deny', 'public', 'private', 'encryption', 'security'
  ];
  
  // Filter words: keep if >3 chars and not common OR is an important term
  const filteredWords = words.filter(w => 
    (w.length > 3 && !commonWords.includes(w)) || 
    importantTerms.includes(w)
  );
  
  // Find sequences of 2-4 words that form important phrases
  const phrases = [];
  
  // Generate 4-word phrases
  if (filteredWords.length >= 4) {
    for (let i = 0; i <= filteredWords.length - 4; i++) {
      phrases.push(filteredWords.slice(i, i + 4).join(' '));
    }
  }
  
  // Generate 3-word phrases
  if (filteredWords.length >= 3) {
    for (let i = 0; i <= filteredWords.length - 3; i++) {
      phrases.push(filteredWords.slice(i, i + 3).join(' '));
    }
  }
  
  // Generate 2-word phrases
  if (filteredWords.length >= 2) {
    for (let i = 0; i <= filteredWords.length - 2; i++) {
      phrases.push(filteredWords.slice(i, i + 2).join(' '));
    }
  }
  
  // If no phrases generated, use the filtered words (or original text as fallback)
  if (phrases.length === 0) {
    if (filteredWords.length > 0) {
      return filteredWords;
    }
    return [text];
  }
  
  // Return the most relevant phrases (top 3 longest ones)
  return phrases
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
}

/**
 * Get the appropriate analyzer based on policy type
 * @param {string} policyType - Type of policy to analyze
 * @returns {Object} Analyzer instance
 */
function getAnalyzerForType(policyType) {
  switch (policyType) {
    case 'IAM': return iamAnalyzer;
    case 'S3': return s3Analyzer;
    case 'Lambda': return lambdaAnalyzer;
    default: return iamAnalyzer; // Default to IAM analyzer
  }
}

/**
 * Main PolicyAnalyzer service that coordinates between specialized analyzers
 */
class PolicyAnalyzer {
  /**
   * Creates intelligent patterns based on policy context and description
   * @param {Object} finding - The complete finding object
   * @returns {string} A smart regex pattern
   */
  createSmartPattern(finding) {
    return createSmartPattern(finding); // Call the internal function
  }

  /**
   * Analyze a policy document with the appropriate analyzer
   * @param {string} policyText - Policy JSON as string
   * @param {string} policyType - Policy type (IAM, S3, Lambda) or auto-detect
   * @param {Object} options - Additional analysis options
   * @returns {Object} Analysis results
   */
  analyzePolicy(policyText, policyType = 'auto-detect', options = {}) {
    try {
      // Auto-detect policy type if not specified
      if (policyType === 'auto-detect') {
        policyType = detectPolicyType(policyText);
      }
      
      const analyzer = getAnalyzerForType(policyType);
      return analyzer.analyzePolicy(policyText, options);
    } catch (error) {
      console.error('Error analyzing policy:', error);
      return { 
        valid: false,
        issues: [],
        stats: { critical: 0, high: 0, medium: 0, low: 0, positive: 0, total: 0 },
        overallRisk: 'unknown',
        error: error.message
      };
    }
  }

  /**
   * Process and analyze input in various formats
   * @param {Object|string} input - Policy input in various formats
   * @param {string} inputType - Type of input ('multi-policy', 'role', 'single-policy') or auto-detect
   * @param {Object} options - Additional analysis options
   * @returns {Promise<Object>} Analysis results
   */
  async analyze(input, inputType = 'auto-detect', options = {}) {
    try {
      // Auto-detect input type if not specified
      if (inputType === 'auto-detect') {
        inputType = this.detectInputType(input);
      }

      switch (inputType) {
        case 'multi-policy':
          return await this.analyzeMultiPolicy(input, options);
        case 'role':
          return await this.analyzeRoleWithPolicies(input, options);
        case 'single-policy':
          return await this.analyzeSinglePolicy(input, null, options);
        default:
          throw new Error(`Unknown input type: ${inputType}`);
      }
    } catch (error) {
      console.error('Error in policy analysis:', error);
      return {
        error: error.message,
        findings: []
      };
    }
  }

  /**
   * Detect the type of input provided
   * @param {Object|string} input - The policy input
   * @returns {string} Detected input type
   */
  detectInputType(input) {
    if (typeof input === 'string') {
      return 'single-policy';
    } else if (input.RoleName && (input.AssumeRolePolicyDocument || input.PolicyDocument || input.InlinePolicies)) {
      return 'role';
    } else if (input.iam || input.s3 || input.lambda) {
      return 'multi-policy';
    }
    
    // If input is an object but doesn't match specific patterns, assume it's a policy object
    return typeof input === 'object' ? 'single-policy' : 'unknown';
  }

  /**
   * Analyze a multi-policy object containing policies for different services
   * @param {Object} multiPolicyObject - Object containing policies for different services
   * @param {Object} options - Additional analysis options
   * @returns {Promise<Object>} Analysis results by service
   */
  async analyzeMultiPolicy(multiPolicyObject, options = {}) {
    try {
      const formattedPolicies = processMultiPolicyObject(multiPolicyObject);
      const results = {
        iam: [],
        s3: [],
        lambda: []
      };

      // Analyze policies for each service
      for (const serviceType of ['iam', 's3', 'lambda']) {
        const analyzer = getAnalyzerForType(serviceType.toUpperCase());
        
        for (const policy of formattedPolicies[serviceType]) {
          try {
            const policyText = typeof policy === 'string' ? policy : JSON.stringify(policy);
            const analysis = await analyzer.analyzePolicy(policyText, options);
            results[serviceType].push(analysis);
          } catch (policyError) {
            console.error(`Error analyzing ${serviceType} policy:`, policyError);
            results[serviceType].push({
              valid: false,
              error: policyError.message
            });
          }
        }
      }

      // Calculate aggregated risk score across all policies
      results.aggregatedRiskScore = this.calculateMultiPolicyRiskScore(
        [...results.iam, ...results.s3, ...results.lambda]
      );

      return results;
    } catch (error) {
      console.error('Error analyzing multi-policy:', error);
      return { 
        iam: [], 
        s3: [], 
        lambda: [], 
        error: error.message 
      };
    }
  }

  /**
   * Analyze an IAM role with its inline and attached policies
   * @param {Object} role - IAM role object with attached and inline policies
   * @param {Object} options - Additional analysis options
   * @returns {Promise<Object>} Analysis results for the role and all its policies
   */
  async analyzeRoleWithPolicies(role, options = {}) {
    try {
      const formattedPolicies = formatRolePolicies(role);
      const results = {
        roleName: role.RoleName || 'Unnamed Role',
        policies: []
      };

      for (const policy of formattedPolicies) {
        try {
          // Detect policy type and route to appropriate analyzer
          const policyType = policy.type || detectPolicyType(policy.document);
          const analyzer = getAnalyzerForType(policyType);
          
          // Create context object for role-specific analysis
          const analysisOptions = {
            ...options,
            context: {
              ...(options.context || {}),
              roleName: role.RoleName,
              isTrustPolicy: policy.name.includes('AssumeRolePolicy') || policy.name.includes('TrustPolicy')
            }
          };
          
          const analysisResult = await analyzer.analyzePolicy(policy.document, analysisOptions);
          
          results.policies.push({
            name: policy.name,
            type: policyType,
            analysis: analysisResult
          });
        } catch (policyError) {
          console.error(`Error analyzing policy ${policy.name}:`, policyError);
          results.policies.push({
            name: policy.name,
            type: policy.type || 'Unknown',
            analysis: {
              valid: false,
              error: policyError.message
            }
          });
        }
      }

      // Calculate overall risk level for the role
      results.overallRisk = this.calculateOverallRisk(results.policies.map(p => p.analysis));
      
      // Calculate aggregated risk score for the role
      results.riskScore = this.calculateMultiPolicyRiskScore(results.policies.map(p => p.analysis));
      
      return results;
    } catch (error) {
      console.error('Error analyzing role with policies:', error);
      return { 
        roleName: role.RoleName || 'Unnamed Role',
        policies: [],
        overallRisk: 'unknown',
        riskScore: 0,
        error: error.message
      };
    }
  }

  /**
   * Analyze a single policy document
   * @param {Object|string} policyDocument - Policy document
   * @param {string} policyType - Policy type (if known) or auto-detect
   * @param {Object} options - Additional analysis options
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeSinglePolicy(policyDocument, policyType = null, options = {}) {
    try {
      const formattedPolicy = formatSinglePolicy(policyDocument);
      
      // Detect policy type if not provided or if auto-detect is specified
      let detectedType = policyType;
      if (!detectedType || detectedType === 'auto-detect') {
        detectedType = detectPolicyType(formattedPolicy.document);
      }
      
      const analyzer = getAnalyzerForType(detectedType);
      
      // Add the detected type to the analysis result
      const result = await analyzer.analyzePolicy(formattedPolicy.document, options);
      
      // Enhance the result with the detected policy type and detection methods
      return {
        ...result,
        policyType: detectedType,
        detectionMethods: this.calculateDetectionMethods(result.issues || [])
      };
    } catch (error) {
      console.error('Error analyzing single policy:', error);
      return { 
        valid: false,
        error: error.message || 'Failed to analyze policy',
        issues: [],
        stats: { critical: 0, high: 0, medium: 0, low: 0, positive: 0, total: 0 },
        overallRisk: 'Unknown',
        riskScore: 0
      };
    }
  }

  /**
   * Calculate the overall risk level based on multiple policy analyses
   * @param {Array} policyResults - Array of policy analysis results
   * @returns {string} Overall risk level
   */
  calculateOverallRisk(policyResults) {
    try {
      // Filter out policies with errors
      const validResults = policyResults.filter(result => result.valid !== false);
      
      if (validResults.length === 0) {
        return 'unknown';
      }
      
      // Check for critical findings first
      if (validResults.some(result => result.overallRisk === 'Critical')) {
        return 'Critical';
      }
      
      // Check for high findings next
      if (validResults.some(result => result.overallRisk === 'High')) {
        return 'High';
      }
      
      // Check for medium findings
      if (validResults.some(result => result.overallRisk === 'Medium')) {
        return 'Medium';
      }
      
      // If no critical, high, or medium findings, return Low
      return 'Low';
    } catch (error) {
      console.error('Error calculating overall risk:', error);
      return 'unknown';
    }
  }

  /**
   * Calculate the aggregated risk score for multiple policies
   * @param {Array<Object>} policyResults - Array of policy analysis results
   * @returns {number} Weighted average risk score between 0-100
   */
  calculateMultiPolicyRiskScore(policyResults) {
    if (!policyResults || policyResults.length === 0) {
      return 0;
    }
    
    // Filter out invalid policies and ensure risk scores exist
    const validResults = policyResults.filter(result => 
      result && result.valid !== false && typeof result.riskScore === 'number'
    );
    
    if (validResults.length === 0) {
      return 0;
    }
    
    // Weight each policy based on its risk level
    const weightedScores = validResults.map(result => {
      // Apply weight multiplier based on overall risk level
      const weightMultiplier = 
        result.overallRisk === 'Critical' ? 2.0 :
        result.overallRisk === 'High' ? 1.5 :
        result.overallRisk === 'Medium' ? 1.0 : 0.5;
      
      return result.riskScore * weightMultiplier;
    });
    
    // Calculate weighted average
    const totalWeight = validResults.length;
    const sumWeightedScores = weightedScores.reduce((sum, score) => sum + score, 0);
    
    // Cap the score at 100
    return Math.min(Math.round(sumWeightedScores / totalWeight), 100);
  }

  /**
   * Save policy analysis results to the database
   * @param {Object} analysisResult - Analysis results
   * @param {Object} metadata - Policy metadata
   * @param {Object} user - User information
   * @returns {Promise<Array>} Saved findings
   */
  async savePolicyAnalysisResults(analysisResult, metadata, user) {
    try {
      // Ensure metadata has the correct format
      const processedMetadata = {
        policyName: metadata.policyName || 'Unnamed Policy',
        // Convert policy text to string if it's an object
        policyText: typeof metadata.policyText === 'object' ? 
          JSON.stringify(metadata.policyText) : metadata.policyText,
        policyType: metadata.policyType || 'unknown'
      };
      
      // Get the right analyzer for this policy type
      const analyzer = getAnalyzerForType(processedMetadata.policyType);
      
      // Save the findings
      return await analyzer.saveFindings(analysisResult, processedMetadata, user);
    } catch (error) {
      console.error('Error saving policy analysis results:', error);
      return [];
    }
  }
  
  /**
   * Report a false positive finding
   * @param {Object} reportData - The false positive report data
   * @param {string} reportData.findingId - ID of the finding being reported
   * @param {string} reportData.reason - Reason for reporting false positive
   * @param {Object} reportData.context - Additional context information
   * @param {Object} user - The user submitting the report
   * @returns {Promise<Object>} Created false positive report
   */
  async reportFalsePositive(reportData, user) {
    if (!reportData || !reportData.findingId || !user) {
      throw new Error('Invalid report data or user information');
    }
    
    try {
      // Find the policy finding first
      const finding = await PolicyFinding.findById(reportData.findingId);
      
      if (!finding) {
        throw new Error('Policy finding not found');
      }
      
      // Mark the finding as in review
      finding.status = 'In Review';
      finding.statusReason = `False positive reported: ${reportData.reason || 'Not specified'}`;
      finding.lastUpdatedBy = user._id;
      finding.updatedAt = new Date();
      
      await finding.save();
      
      return {
        finding,
        status: 'pending',
        message: 'False positive reported successfully'
      };
    } catch (error) {
      console.error('Error reporting false positive:', error);
      throw error;
    }
  }

  /**
   * Approve or reject a false positive report
   * @param {string} findingId - The policy finding ID
   * @param {boolean} approve - Whether to approve or reject
   * @param {string} reviewerNotes - Optional notes from the reviewer
   * @param {Object} reviewer - The admin who reviewed the report
   * @returns {Promise<Object>} Updated finding and created whitelist rule if approved
   */
  async processFalsePositiveReport(findingId, approve, reviewerNotes = '', reviewer) {
    if (!findingId) {
      throw new Error('Finding ID is required');
    }
    
    try {
      const finding = await PolicyFinding.findById(findingId);
      
      if (!finding) {
        throw new Error('Policy finding not found');
      }
      
      if (approve) {
        // Use the smart pattern creation with enhanced capability
        const pattern = createSmartPattern(finding);
        
        console.log(`Creating whitelist rule for finding: ${finding._id}`);
        console.log(`- Service: ${finding.service}`);
        console.log(`- Severity: ${finding.severity}`);
        console.log(`- Description: ${finding.description}`);
        console.log(`- Generated pattern: ${pattern}`);
        
        const whitelistRule = new WhitelistRule({
          pattern,
          description: finding.policyName || finding.description,
          service: finding.service,
          severity: finding.severity,
          reason: reviewerNotes || 'Approved false positive',
          createdBy: reviewer._id,
          sourceType: 'feedback',
          sourceFindingId: finding._id
        });
        
        // Log the whitelist rule before saving to verify pattern is set
        console.log('About to save whitelist rule with smart pattern:', {
          pattern: whitelistRule.pattern,
          description: whitelistRule.description,
          service: whitelistRule.service,
          severity: whitelistRule.severity
        });
        
        await whitelistRule.save();
        console.log(`Whitelist rule created with ID: ${whitelistRule._id}`);
        
        // Update the finding
        finding.isWhitelisted = true;
        finding.status = 'Whitelisted';
        finding.whitelistedBy = reviewer._id;
        finding.whitelistReason = reviewerNotes || 'Approved false positive';
        finding.whitelistRuleId = whitelistRule._id;
        finding.lastUpdatedBy = reviewer._id;
        finding.updatedAt = new Date();
        
        await finding.save();
        
        // Update any other findings that match this pattern - with better error handling
        try {
          console.log(`Finding other similar findings to whitelist with pattern: "${pattern}"`);
          
          // First try an exact match if the regex fails
          let updateCriteria = {
            service: finding.service,
            severity: finding.severity,
            isWhitelisted: false,
            _id: { $ne: finding._id } // Exclude the current finding
          };
          
          try {
            // Try with regex pattern first
            const regex = new RegExp(pattern, 'i'); // Case insensitive
            updateCriteria.description = { $regex: regex };
            
            const matchCount = await PolicyFinding.countDocuments(updateCriteria);
            console.log(`Found ${matchCount} other findings matching the pattern`);
          } catch (regexErr) {
            console.warn('Error creating regex from pattern, falling back to exact match:', regexErr);
            // Fallback to exact match if regex fails
            updateCriteria.description = finding.description;
          }
          
          const updateResult = await PolicyFinding.updateMany(
            updateCriteria,
            {
              isWhitelisted: true,
              status: 'Whitelisted',
              whitelistedBy: reviewer._id,
              whitelistReason: reviewerNotes || 'Approved false positive via pattern match',
              whitelistRuleId: whitelistRule._id,
              lastUpdatedBy: reviewer._id,
              updatedAt: new Date()
            }
          );
          
          console.log(`Updated ${updateResult.modifiedCount} related findings with whitelist status`);
        } catch (err) {
          console.warn('Error updating similar findings:', err);
        }
        
        console.log(`False positive finding ${findingId} approved and whitelist rule created`);
        
        return {
          finding,
          whitelistRule,
          success: true,
          message: 'False positive approved and whitelist rule created'
        };
      } else {
        // Reject the false positive
        finding.status = 'Open';
        finding.statusReason = `False positive rejected: ${reviewerNotes || 'Not specified'}`;
        finding.lastUpdatedBy = reviewer._id;
        finding.updatedAt = new Date();
        
        await finding.save();
        
        console.log(`False positive finding ${findingId} rejected`);
        
        return {
          finding,
          success: true,
          message: 'False positive rejected successfully'
        };
      }
    } catch (error) {
      console.error('Error processing false positive report:', error);
      throw error;
    }
  }

  /**
   * Get a list of pending false positive reports
   * @param {number} limit - Maximum number of reports to return
   * @returns {Promise<Array>} List of findings with pending false positive reports
   */
  async getPendingFalsePositives(limit = 10) {
    try {
      return await PolicyFinding.find({ status: 'In Review' })
        .populate('user', 'name email')
        .sort({ updatedAt: -1 })
        .limit(limit);
    } catch (error) {
      console.error('Error fetching pending false positives:', error);
      return [];
    }
  }

  /**
   * Extract all detection methods used in issues
   * @param {Array} issues - Array of issues
   * @returns {Array} List of detection methods
   */
  calculateDetectionMethods(issues) {
    const methods = new Set();
    
    issues.forEach(issue => {
      if (issue.detectionMethod) {
        methods.add(issue.detectionMethod);
      }
    });
    
    return Array.from(methods);
  }

  /**
   * Check if a finding should be excluded based on whitelist rules
   * Enhanced with hierarchical matching strategies and multi-stage approach
   * @param {Object} finding - The finding to check
   * @returns {Promise<{isWhitelisted: boolean, matchType?: string, rule?: Object}>} Result with match details
   */
  async shouldExcludeFinding(finding) {
    try {
      // Get all whitelist rules for this service
      const allServiceWhitelistRules = await WhitelistRule.find({
        service: finding.service
      });
      
      if (!allServiceWhitelistRules || allServiceWhitelistRules.length === 0) {
        return { isWhitelisted: false };
      }
      
      // TIER 1: EXACT MATCHES (most specific)
      // First try exact description match
      const exactMatch = allServiceWhitelistRules.find(rule => 
        rule.severity === finding.severity && 
        rule.description === finding.description
      );
      
      if (exactMatch) {
        console.log(`Exact description whitelist match for "${finding.description}"`);
        return { 
          isWhitelisted: true, 
          matchType: 'exact-description',
          rule: exactMatch
        };
      }
      
      // TIER 2: PATTERN MATCHING WITH SAME SEVERITY
      // Highly specific matches with same severity level
      const exactSeverityRules = allServiceWhitelistRules.filter(rule => 
        rule.severity === finding.severity
      );
      
      for (const rule of exactSeverityRules) {
        try {
          const regex = new RegExp(rule.pattern, 'i');
          if (regex.test(finding.description)) {
            console.log(`Pattern whitelist match: "${finding.description}" matches "${rule.pattern}"`);
            return { 
              isWhitelisted: true, 
              matchType: 'pattern-match',
              rule: rule
            };
          }
        } catch (err) {
          console.warn(`Invalid regex in whitelist rule (${rule._id}):`, err);
        }
      }
      
      // TIER 3: WORD SIMILARITY MATCHING
      // More flexible - if key words match
      const descriptionWords = finding.description.toLowerCase().split(/\s+/)
        .filter(word => word.length > 3);
      
      for (const rule of exactSeverityRules) {
        const ruleWords = rule.description.toLowerCase().split(/\s+/)
          .filter(word => word.length > 3);
        
        const commonWords = descriptionWords.filter(word => 
          ruleWords.includes(word)
        );
        
        // If 75% of significant words match
        if (ruleWords.length > 0 && commonWords.length >= Math.ceil(ruleWords.length * 0.75)) {
          console.log(`Word similarity whitelist match for "${finding.description}"`);
          return { 
            isWhitelisted: true, 
            matchType: 'word-similarity',
            rule: rule
          };
        }
      }
      
      // TIER 4: SEVERITY HIERARCHY MATCHING
      // Define severity hierarchy
      const severityLevels = {
        'Critical': 4,
        'High': 3,
        'Medium': 2,
        'Low': 1
      };
      
      // Only allow downgrading severity (higher severity rule will cover lower severity findings)
      const findingSeverityLevel = severityLevels[finding.severity] || 0;
      
      const higherSeverityRules = allServiceWhitelistRules.filter(rule => 
        (severityLevels[rule.severity] || 0) > findingSeverityLevel
      );
      
      // Check pattern matches with higher severity rules
      for (const rule of higherSeverityRules) {
        try {
          const regex = new RegExp(rule.pattern, 'i');
          if (regex.test(finding.description)) {
            console.log(`Severity downgrade whitelist match: "${finding.description}" (${finding.severity}) matches higher severity pattern "${rule.pattern}" (${rule.severity})`);
            return { 
              isWhitelisted: true, 
              matchType: 'severity-downgrade-pattern',
              rule: rule
            };
          }
        } catch (err) {
          console.warn(`Invalid regex in whitelist rule:`, err);
        }
        
        // Also try word similarity for higher severity rules
        const ruleWords = rule.description.toLowerCase().split(/\s+/)
          .filter(word => word.length > 3);
        
        const commonWords = descriptionWords.filter(word => 
          ruleWords.includes(word)
        );
        
        // Higher threshold (85%) for downgrading severity based on word similarity
        if (ruleWords.length > 0 && commonWords.length >= Math.ceil(ruleWords.length * 0.85)) {
          console.log(`Word similarity with severity downgrade for "${finding.description}"`);
          return { 
            isWhitelisted: true, 
            matchType: 'severity-downgrade-similarity',
            rule: rule
          };
        }
      }
      
      return { isWhitelisted: false };
    } catch (error) {
      console.error('Error checking whitelist rules:', error);
      return { isWhitelisted: false };
    }
  }
}

module.exports = new PolicyAnalyzer();