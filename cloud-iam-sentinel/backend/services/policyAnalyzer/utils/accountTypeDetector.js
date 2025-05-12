/**
 * Detects the account type and role type based on resources, principals, and actions
 * @param {Object} policy - The policy object to analyze
 * @returns {Object} Details about the detected account/role type
 */
function detectAccountAndRoleType(policy) {
  if (!policy || !policy.Statement) {
    return { accountType: 'iam-entity', roleType: 'standard-role' }; // Default
  }

  const statements = Array.isArray(policy.Statement) ? policy.Statement : [policy.Statement];
  
  // Check for root account indicators
  const isRootAccount = statements.some(statement => {
    // Check resources for root account patterns
    const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource || ''];
    const hasRootResource = resources.some(resource => 
      typeof resource === 'string' && resource.includes(':root')
    );

    // Check if principal is AWS root
    const isRootPrincipal = statement.Principal && (
      (statement.Principal.AWS && statement.Principal.AWS.includes(':root')) ||
      (typeof statement.Principal === 'string' && statement.Principal.includes(':root'))
    );

    return hasRootResource || isRootPrincipal;
  });

  if (isRootAccount) {
    return { accountType: 'root-account', roleType: 'root' };
  }
  
  // Detect service roles
  const serviceRole = detectServiceRole(statements);
  if (serviceRole.isServiceRole) {
    return { 
      accountType: 'service-account', 
      roleType: serviceRole.isServiceLinked ? 'service-linked-role' : 'service-role',
      service: serviceRole.serviceName
    };
  }
  
  // Detect cross-account access roles
  const crossAccountRole = detectCrossAccountRole(statements);
  if (crossAccountRole.isCrossAccount) {
    return { 
      accountType: 'cross-account', 
      roleType: 'cross-account-role',
      trustedAccounts: crossAccountRole.trustedAccounts
    };
  }
  
  // Detect admin roles
  const adminRole = detectAdminRole(statements);
  if (adminRole.isAdmin) {
    return { 
      accountType: 'admin-account', 
      roleType: 'admin-role',
      adminLevel: adminRole.adminLevel // 'full', 'service-specific', or 'limited'
    };
  }
  
  // Check if it's a role assumption policy
  const roleAssumption = detectRoleAssumption(statements);
  if (roleAssumption.isRoleAssumption) {
    return {
      accountType: 'iam-entity',
      roleType: 'role-assumption',
      assumptionType: roleAssumption.assumptionType // 'direct' or 'chaining'
    };
  }
  
  // Default to standard IAM role/user
  return { accountType: 'iam-entity', roleType: 'standard-role' };
}

/**
 * Detects if the policy represents a service role
 * @param {Array} statements - Policy statements
 * @returns {Object} Service role detection results
 */
function detectServiceRole(statements) {
  let isServiceRole = false;
  let isServiceLinked = false;
  let serviceName = null;
  
  // Look for service principals in trust policies
  for (const statement of statements) {
    if (statement.Principal && statement.Principal.Service) {
      isServiceRole = true;
      
      // Extract service name
      const services = Array.isArray(statement.Principal.Service) 
        ? statement.Principal.Service 
        : [statement.Principal.Service];
      
      if (services.length > 0) {
        // Extract the service name from the first service
        serviceName = services[0].split('.')[0];
      }
      
      // Check if it appears to be a service-linked role
      // Service-linked roles typically have path /aws-service-role/ or name format AWSServiceRoleFor*
      const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource || ''];
      isServiceLinked = resources.some(resource => 
        typeof resource === 'string' && (
          resource.includes('/aws-service-role/') || 
          resource.includes(':role/AWSServiceRoleFor')
        )
      );
      
      break;
    }
  }
  
  return { isServiceRole, isServiceLinked, serviceName };
}

/**
 * Detects if the policy represents a cross-account role
 * @param {Array} statements - Policy statements
 * @returns {Object} Cross-account detection results
 */
function detectCrossAccountRole(statements) {
  let isCrossAccount = false;
  const trustedAccounts = new Set();
  
  // Look for external AWS account principals
  for (const statement of statements) {
    if (statement.Principal && statement.Principal.AWS) {
      const principals = Array.isArray(statement.Principal.AWS) 
        ? statement.Principal.AWS 
        : [statement.Principal.AWS];
      
      for (const principal of principals) {
        if (typeof principal === 'string' && 
            principal !== '*' && 
            !principal.includes('${aws:') &&
            principal.includes('arn:aws:iam::')) {
          
          isCrossAccount = true;
          
          // Extract account ID
          const matches = principal.match(/arn:aws:iam::(\d+):/);
          if (matches && matches[1]) {
            trustedAccounts.add(matches[1]);
          }
        }
      }
    }
  }
  
  return { 
    isCrossAccount, 
    trustedAccounts: Array.from(trustedAccounts)
  };
}

/**
 * Detects if the policy represents an admin role
 * @param {Array} statements - Policy statements
 * @returns {Object} Admin role detection results
 */
function detectAdminRole(statements) {
  let isAdmin = false;
  let adminLevel = 'limited';
  
  for (const statement of statements) {
    if (statement.Effect !== 'Allow') continue;
    
    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action || ''];
    const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource || ''];
    
    // Check for full admin access
    if (actions.includes('*') && resources.includes('*')) {
      isAdmin = true;
      adminLevel = 'full';
      break;
    }
    
    // Check for IAM admin access
    if (actions.includes('iam:*') && resources.some(r => r === '*' || r.includes('iam::*'))) {
      isAdmin = true;
      adminLevel = 'service-specific';
    }
    
    // Check for powerful admin actions on IAM
    const powerfulActions = [
      'iam:CreatePolicy', 
      'iam:CreateRole',
      'iam:AttachRolePolicy',
      'iam:PutRolePolicy',
      'iam:PassRole'
    ];
    
    if (powerfulActions.some(action => actions.includes(action))) {
      isAdmin = true;
      if (adminLevel !== 'full' && adminLevel !== 'service-specific') {
        adminLevel = 'limited';
      }
    }
  }
  
  return { isAdmin, adminLevel };
}

/**
 * Detects if the policy is about role assumption
 * @param {Array} statements - Policy statements
 * @returns {Object} Role assumption detection results
 */
function detectRoleAssumption(statements) {
  let isRoleAssumption = false;
  let assumptionType = 'direct';
  
  for (const statement of statements) {
    if (statement.Effect !== 'Allow') continue;
    
    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action || ''];
    
    // Check for AssumeRole actions
    if (actions.some(action => 
        action === 'sts:AssumeRole' || 
        action === 'sts:AssumeRoleWithSAML' || 
        action === 'sts:AssumeRoleWithWebIdentity')) {
      
      isRoleAssumption = true;
      
      // Check for role chaining
      // Role chaining typically involves assuming a role from another assumed role
      const resources = Array.isArray(statement.Resource) ? statement.Resource : [statement.Resource || ''];
      if (resources.length > 1 && resources.every(r => r.includes(':role/'))) {
        assumptionType = 'chaining';
      }
      
      break;
    }
  }
  
  return { isRoleAssumption, assumptionType };
}

module.exports = { 
  detectAccountAndRoleType,
  detectServiceRole,
  detectCrossAccountRole,
  detectAdminRole,
  detectRoleAssumption
};