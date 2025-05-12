/**
 * @fileOverview Lambda-specific policy analyzer that detects potential security issues in Lambda policies
 * @module services/policyAnalyzer/lambdaAnalyzer
 * @requires baseAnalyzer
 * @requires utils/resourceFetcher
 */
const BaseAnalyzer = require('./baseAnalyzer');
const { getLambdaFunctions, getLambdaPolicy } = require('./utils/resourceFetcher');

/**
 * Lambda-specific policy analyzer
 * @class
 * @extends BaseAnalyzer
 */
class LambdaAnalyzer extends BaseAnalyzer {
  /**
   * Creates an instance of LambdaAnalyzer with Lambda-specific patterns
   */
  constructor() {
    super();
    this.serviceType = 'Lambda';
    
    // Lambda-specific patterns for regex-based analysis
    this.patterns = [
      {
        pattern: /"Action":\s*"lambda:\*"/i,
        severity: 'Medium',
        description: 'Policy grants all Lambda permissions',
        recommendation: 'Limit Lambda permissions to only those required'
      },
      {
        pattern: /"Action":\s*\[?\s*"lambda:(CreateFunction|UpdateFunctionCode)"/i,
        severity: 'Medium',
        description: 'Policy allows creating or updating Lambda functions',
        recommendation: 'Restrict these permissions to DevOps teams'
      },
      {
        pattern: /"Action":\s*\[?\s*"lambda:(AddPermission|CreateEventSourceMapping)"/i,
        severity: 'Medium',
        description: 'Policy allows modifying Lambda permissions or triggers',
        recommendation: 'Restrict these permissions to DevOps teams'
      },
      {
        pattern: /"Action":\s*\[?\s*"lambda:InvokeFunction"/i,
        severity: 'Low',
        description: 'Policy allows invoking Lambda functions',
        recommendation: 'Ensure the Resource element is properly scoped to specific functions'
      },
      {
        pattern: /"Principal":\s*{\s*"Service":\s*"apigateway.amazonaws.com"/i,
        severity: 'Low',
        description: 'Lambda function can be invoked by API Gateway',
        recommendation: 'Ensure API Gateway endpoints have proper authentication',
        isPositive: false
      },
      {
        pattern: /"Action":\s*\[?\s*"lambda:InvokeFunction".*"Resource":\s*"\*"/i,
        severity: 'Medium',
        description: 'Policy allows invoking any Lambda function',
        recommendation: 'Restrict invocation to specific functions'
      }
    ];

    // Define sensitive Lambda actions
    this.sensitiveActions = [
      'lambda:InvokeFunction',
      'lambda:AddPermission',
      'lambda:CreateFunction',
      'lambda:UpdateFunctionCode',
      'lambda:*',
      '*'
    ];

    // Define actions that affect invocation
    this.invocationActions = [
      'lambda:InvokeFunction',
      'lambda:*',
      '*'
    ];

    // Define versioning-related actions
    this.versioningActions = [
      'lambda:PublishVersion',
      'lambda:PublishLayerVersion'
    ];

    // Define environment configuration actions
    this.configurationActions = [
      'lambda:UpdateFunctionConfiguration'
    ];

    // Define less trusted services
    this.lessTrustedServices = [
      'apigateway.amazonaws.com',
      'events.amazonaws.com',
      's3.amazonaws.com'
    ];
  }

  /**
   * Ensures a value is an array
   * @param {*} value - The value to ensure is an array
   * @returns {Array} The value as an array
   */
  ensureArray(value) {
    if (value === undefined || value === null) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  /**
   * Checks if actions include any sensitive Lambda actions
   * @param {Array} actions - Array of policy actions
   * @returns {boolean} True if any sensitive action is found
   */
  hasSensitiveAction(actions) {
    return actions.some(action => this.sensitiveActions.includes(action));
  }

  /**
   * Checks if actions include any Lambda invocation actions
   * @param {Array} actions - Array of policy actions
   * @returns {boolean} True if any invocation action is found
   */
  hasInvocationAction(actions) {
    return actions.some(action => this.invocationActions.includes(action));
  }

  /**
   * Checks if actions include any versioning-related actions
   * @param {Array} actions - Array of policy actions
   * @returns {boolean} True if any versioning action is found
   */
  hasVersioningAction(actions) {
    return actions.some(action => this.versioningActions.includes(action));
  }

  /**
   * Checks if actions include any configuration-related actions
   * @param {Array} actions - Array of policy actions
   * @returns {boolean} True if any configuration action is found
   */
  hasConfigurationAction(actions) {
    return actions.some(action => this.configurationActions.includes(action));
  }

  /**
   * Checks if a service is in the less trusted services list
   * @param {string} service - Service principal name
   * @returns {boolean} True if service is less trusted
   */
  isLessTrustedService(service) {
    return this.lessTrustedServices.includes(service);
  }

  /**
   * Analyze a single policy statement semantically
   * @param {Object} statement - Policy statement
   * @param {Array} findings - Findings array to append to
   * @param {object} options - Analysis options
   */
  analyzeStatement(statement, findings, options = {}) {
    // Skip Deny statements as they're generally reducing permissions
    if (statement.Effect !== 'Allow') {
      return;
    }

    // Call the parent method to analyze conditional access
    super.analyzeStatement(statement, findings, options);

    // Normalize actions to array
    const actions = this.ensureArray(statement.Action);
    
    // Normalize resources to array
    const resources = this.ensureArray(statement.Resource);

    // Check for wildcard resource with specific permissions
    if (this.hasWildcardResource(resources)) {
      this.checkWildcardResources(statement, actions, findings);
    }

    // Check for public invocation permissions
    if (statement.Principal && 
        (statement.Principal === '*' || 
        (statement.Principal.AWS && statement.Principal.AWS === '*'))) {
      this.checkPublicInvocation(statement, actions, findings);
    }

    // Check for service principal invocations
    if (statement.Principal && statement.Principal.Service) {
      this.checkServicePrincipals(statement, actions, findings);
    }
  }

  /**
   * Check for risks with wildcard resources
   * @param {Object} statement - Policy statement
   * @param {Array} actions - Normalized actions array
   * @param {Array} findings - Findings array to populate
   */
  checkWildcardResources(statement, actions, findings) {
    if (this.hasSensitiveAction(actions)) {
      findings.push(this.createFinding(
        'Medium',
        'Policy grants Lambda permissions on all functions',
        'Restrict permissions to specific Lambda functions',
        { detectionMethod: 'semantic' }
      ));
    }
  }

  /**
   * Check for public invocation permissions
   * @param {Object} statement - Policy statement
   * @param {Array} actions - Normalized actions array
   * @param {Array} findings - Findings array to populate
   */
  checkPublicInvocation(statement, actions, findings) {
    if (this.hasInvocationAction(actions)) {
      
      // Check if there's a mitigating source ARN condition
      if (!this.hasSourceArnCondition(statement.Condition)) {
        findings.push(this.createFinding(
          'High',
          'Lambda function allows public invocation',
          'Restrict invocation with source ARN conditions',
          { detectionMethod: 'semantic' }
        ));
      }
    }
  }

  /**
   * Check for service principal invocations
   * @param {Object} statement - Policy statement
   * @param {Array} actions - Normalized actions array
   * @param {Array} findings - Findings array to populate
   */
  checkServicePrincipals(statement, actions, findings) {
    const services = this.ensureArray(statement.Principal.Service);
      
    // Check for invocation without source ARN for less trusted services
    if (this.hasInvocationAction(actions)) {
      
      if (services.some(service => this.isLessTrustedService(service)) && 
          !this.hasSourceArnCondition(statement.Condition)) {
        findings.push(this.createFinding(
          'Medium',
          `Lambda function can be invoked by ${services.join(', ')} without source ARN restriction`,
          'Add a source ARN condition to restrict which resources can invoke the function',
          { detectionMethod: 'semantic' }
        ));
      }
    }
  }

  /**
   * Perform enhanced semantic analysis for Lambda policies
   * @param {Object} policy - Parsed policy object
   * @param {Array} findings - Findings array to populate
   * @param {Object} options - Analysis options
   */
  performSemanticAnalysis(policy, findings, options = {}) {
    // Call the parent method first
    super.performSemanticAnalysis(policy, findings, options);

    if (!policy || !policy.Statement) return;
    
    const statements = this.ensureArray(policy.Statement);
    
    // Lambda-specific semantic analysis
    statements.forEach(statement => {
      if (statement.Effect === 'Allow') {
        this.analyzeLambdaPermissions(statement, findings);
        this.analyzeEventSourceSecurity(statement, findings);
      }
    });
    
    // Check concurrency-related permissions
    this.checkConcurrencyControls(policy, findings);
  }

  /**
   * Analyze Lambda permissions and potential risks
   * @param {Object} statement - Policy statement
   * @param {Array} findings - Findings array to populate
   */
  analyzeLambdaPermissions(statement, findings) {
    const actions = this.ensureArray(statement.Action);
    const resources = this.ensureArray(statement.Resource);
    
    // Check for function versioning permissions
    if (this.hasVersioningAction(actions) && this.hasWildcardResource(resources)) {
      findings.push(this.createFinding(
        'Medium',
        'Policy allows publishing Lambda versions without restrictions',
        'Restrict who can publish Lambda versions to specific functions',
        { detectionMethod: 'semantic' }
      ));
    }

    // Check for permission to modify function environment variables
    if (this.hasConfigurationAction(actions) && this.hasWildcardResource(resources)) {
      findings.push(this.createFinding(
        'Medium',
        'Policy allows modifying environment variables for any function',
        'Restrict the ability to modify environment variables, which may contain secrets',
        { detectionMethod: 'semantic' }
      ));
    }
  }

  /**
   * Analyze event source mapping security
   * @param {Object} statement - Policy statement
   * @param {Array} findings - Findings array to populate
   */
  analyzeEventSourceSecurity(statement, findings) {
    if (!statement.Principal || !statement.Principal.Service) return;
    
    const services = this.ensureArray(statement.Principal.Service);
    
    // Check for event source mappings without proper restrictions
    const eventSources = services.filter(service => 
      service.endsWith('.amazonaws.com') && 
      service !== 'lambda.amazonaws.com'
    );
    
    if (eventSources.length > 0 && !this.hasSourceArnCondition(statement.Condition)) {
      findings.push(this.createFinding(
        'Medium',
        `Lambda allows invocation from ${eventSources.join(', ')} without source ARN restriction`,
        'Add source ARN conditions to restrict which resources can trigger the function',
        { detectionMethod: 'semantic' }
      ));
    }
  }

  /**
   * Check for concurrency controls and limitations in Lambda policies
   * @param {Object} policy - Policy object to analyze
   * @param {Array} findings - Array to add findings to
   */
  checkConcurrencyControls(policy, findings) {
    if (!policy.Statement) return;
    
    const statements = this.ensureArray(policy.Statement);
    
    // Check if policy includes concurrency configuration permissions
    const hasConcurrencyPermissions = statements.some(statement => 
      statement.Effect === 'Allow' &&
      this.actionIncludesConcurrencyControl(statement.Action)
    );
    
    if (hasConcurrencyPermissions) {
      findings.push(this.createFinding(
        'Low',
        'Policy allows modifying Lambda concurrency settings',
        'Restrict concurrency configuration to administrative users',
        { 
          type: 'best-practice',
          detectionMethod: 'best-practice'
        }
      ));
    }
  }

  /**
   * Check if action includes concurrency control permissions
   * @param {string|Array} action - The action(s) to check
   * @returns {boolean} True if action includes concurrency controls
   */
  actionIncludesConcurrencyControl(action) {
    const actions = this.ensureArray(action);
    return actions.includes('lambda:PutFunctionConcurrency');
  }
  
  /**
   * Analyze a policy in the context of other resources and services
   * @param {string} policyText - The policy JSON as a string
   * @param {Object} context - Contextual information about environment
   * @param {Array} findings - Findings array to append to
   */
  analyzeContext(policyText, context, findings) {
    try {
      const policy = JSON.parse(policyText);
      const statements = this.ensureArray(policy.Statement);
      
      // Check for cross-account access
      if (context.accountId) {
        this.checkCrossAccountAccess(statements, context.accountId, findings);
      }
      
      // Check for API Gateway integration risks
      if (context.integrations && context.integrations.apiGateway) {
        this.checkApiGatewayRisks(statements, findings);
      }
    } catch (error) {
      console.error('Error in Lambda context analysis:', error);
    }
  }
  
  /**
   * Check for cross-account access in Lambda statements
   * @param {Array} statements - Policy statements
   * @param {string} accountId - Current AWS account ID
   * @param {Array} findings - Findings array to populate
   */
  checkCrossAccountAccess(statements, accountId, findings) {
    for (const statement of statements) {
      if (!statement.Principal || !statement.Principal.AWS) continue;
      
      const principals = this.ensureArray(statement.Principal.AWS);
          
      if (this.hasCrossAccountPrincipal(principals, accountId)) {
        findings.push(this.createFinding(
          'High',
          'Lambda function grants permissions to external AWS accounts',
          'Verify that cross-account access is intended and necessary',
          { detectionMethod: 'context' }
        ));
        return; // Only add one finding for cross-account access
      }
    }
  }

  /**
   * Check if principals include cross-account access
   * @param {Array} principals - AWS principals
   * @param {string} accountId - Current account ID
   * @returns {boolean} True if cross-account access exists
   */
  hasCrossAccountPrincipal(principals, accountId) {
    return principals.some(principal => 
      principal.includes(':') && !principal.includes(accountId)
    );
  }
  
  /**
   * Check for API Gateway integration risks
   * @param {Array} statements - Policy statements
   * @param {Array} findings - Findings array to populate
   */
  checkApiGatewayRisks(statements, findings) {
    const hasOpenPermissions = statements.some(statement => 
      statement.Effect === 'Allow' && 
      statement.Principal && 
      statement.Principal.Service === 'apigateway.amazonaws.com' &&
      (!statement.Condition || Object.keys(statement.Condition).length === 0)
    );
    
    if (hasOpenPermissions) {
      findings.push(this.createFinding(
        'Medium',
        'Lambda function allows API Gateway invocation without source restrictions',
        'Add source ARN conditions to restrict which API Gateway resources can invoke this function',
        { detectionMethod: 'context' }
      ));
    }
  }

  /**
   * Analyze all Lambda function policies
   * @returns {Promise<Array>} Analysis results for all Lambda functions
   */
  async analyzeAllFunctions() {
    try {
      const functions = await getLambdaFunctions();
      const results = [];

      for (const func of functions) {
        try {
          const functionPolicy = await getLambdaPolicy(func.FunctionName);
          
          if (functionPolicy) {
            const analysis = this.analyzePolicy(functionPolicy, {
              context: { functionInfo: { name: func.FunctionName } }
            });
            
            results.push({
              functionName: func.FunctionName,
              analysis
            });
          } else {
            results.push({
              functionName: func.FunctionName,
              analysis: {
                valid: true,
                issues: [],
                overallRisk: 'Low',
                stats: { critical: 0, high: 0, medium: 0, low: 0, positive: 0, total: 0 }
              }
            });
          }
        } catch (error) {
          console.error(`Error analyzing function ${func.FunctionName}:`, error);
          results.push({
            functionName: func.FunctionName,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error analyzing Lambda functions:', error);
      return [];
    }
  }

  /**
   * Apply Lambda-specific scoring adjustments
   * @param {string} policyText - The policy JSON string
   * @param {number} currentScore - Current risk score
   * @returns {number} Adjusted risk score
   */
  applyServiceSpecificScoring(policyText, currentScore) {
    let score = currentScore;
    
    // Lambda dangerous permissions
    if (policyText.includes('lambda:AddPermission')) score += 10;
    if (policyText.includes('lambda:UpdateFunctionCode')) score += 8;
    if (policyText.includes('lambda:InvokeFunction') && policyText.includes('"Resource": "*"')) score += 12;
    
    // Check for unrestricted service principals
    if (policyText.includes('"Service": "apigateway.amazonaws.com"') && 
        !policyText.includes('aws:SourceArn')) {
      score += 8;
    }
    
    // Positive Lambda practices
    if (policyText.includes('lambda:ResourceTag')) score -= 5;
    if (policyText.includes('lambda:FunctionUrlAuthType')) score -= 3;
    
    return score;
  }
}

module.exports = new LambdaAnalyzer();