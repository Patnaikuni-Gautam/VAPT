const safeWildcardActions = [
    "ec2:Describe*", "iam:Get*", "iam:List*",
    "logs:Describe*", "logs:Get*", "cloudwatch:Get*", "cloudwatch:List*",
    "rds:Describe*", "lambda:Get*", "dynamodb:Describe*", "dynamodb:List*"
  ];
  
  const destructiveActions = [
    "s3:Put*", "s3:Delete*", "ec2:Terminate*", "iam:Delete*", "iam:Put*",
    "lambda:Delete*", "rds:Delete*", "dynamodb:Delete*"
  ];
  
  const readOnlyActions = [
    "s3:Get*", "s3:List*", "ec2:Describe*", "iam:Get*", "iam:List*",
    "logs:Get*", "logs:Describe*", "cloudwatch:Get*", "cloudwatch:List*",
    "rds:Describe*", "lambda:Get*", "dynamodb:Get*", "dynamodb:List*"
  ];
  
  const isInternalPrincipal = (principal) => {
    if (!principal || typeof principal !== 'object') return false;
    if (principal.AWS === '*') return false;
    if (Array.isArray(principal.AWS)) {
      return principal.AWS.every(arn => arn.startsWith('arn:aws:iam::'));
    }
    return typeof principal.AWS === 'string' && principal.AWS.startsWith('arn:aws:iam::');
  };
  
  const isDestructiveAction = (action) => {
    return destructiveActions.some(pattern => {
      if (pattern.endsWith('*')) return action.startsWith(pattern.slice(0, -1));
      return action === pattern;
    });
  };
  
  const isReadOnlyAction = (action) => {
    return readOnlyActions.some(pattern => {
      if (pattern.endsWith('*')) return action.startsWith(pattern.slice(0, -1));
      return action === pattern;
    });
  };
  
  const getHighestRisk = (a, b) => {
    const order = ["No Risk", "Low", "Medium", "High", "Critical"];
    return order.indexOf(a) > order.indexOf(b) ? a : b;
  };
  
  const analyzeAWSIAM = (policyStr) => {
    const misconfigurations = [];
    const warnings = [];
    const explanationMap = [];
    let highestRisk = "No Risk";
  
    let policy;
    try {
      policy = JSON.parse(policyStr);
    } catch (err) {
      return {
        misconfigurations: ["Invalid JSON"],
        warnings: [],
        explanationMap: [],
        riskLevel: "Invalid"
      };
    }
  
    for (const stmt of policy.Statement || []) {
      const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
      const resources = Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource];
      const principal = stmt.Principal;
      const effect = stmt.Effect;
  
      if (effect !== "Allow") continue;
  
      const hasWildcardPrincipal = !isInternalPrincipal(principal);
      const hasWildcardResource = resources.includes("*");
      const hasWildcardAction = actions.includes("*");
  
      const allSafe = actions.every(isReadOnlyAction);
      const anyDestructive = actions.some(isDestructiveAction);
      const anyWildcard = actions.some(a => a.includes("*"));
  
      let currentRisk = "No Risk";
  
      if (hasWildcardPrincipal && hasWildcardAction) {
        currentRisk = "Critical";
        misconfigurations.push("Critical: Wildcard principal with wildcard actions");
        explanationMap.push({
          type: "Critical",
          message: "Anonymous full access",
          explanation: "Wildcard principal with unrestricted action access"
        });
      } else if (hasWildcardPrincipal && anyDestructive) {
        currentRisk = "High";
        misconfigurations.push("High: Wildcard principal with destructive actions");
        explanationMap.push({
          type: "High",
          message: "Anonymous destructive access",
          explanation: "Wildcard principal with access to write/delete actions"
        });
      } else if (hasWildcardPrincipal && allSafe) {
        currentRisk = "Medium";
        warnings.push("Medium: Wildcard principal with read-only access");
        explanationMap.push({
          type: "Medium",
          message: "Anonymous read-only access",
          explanation: "Wildcard principal with access to safe read-only actions"
        });
      } else if (!hasWildcardPrincipal && anyDestructive) {
        currentRisk = "Medium";
        warnings.push("Medium: Scoped principal with destructive access");
        explanationMap.push({
          type: "Medium",
          message: "Scoped destructive access",
          explanation: "Destructive permissions granted even with internal principal"
        });
      } else if (!hasWildcardPrincipal && anyWildcard && !allSafe) {
        currentRisk = "Low";
        warnings.push("Low: Scoped access with unsafe wildcards");
        explanationMap.push({
          type: "Low",
          message: "Wildcard non-read-only permissions",
          explanation: "Internal principal using some wildcards beyond safe reads"
        });
      } else if (!hasWildcardPrincipal && allSafe) {
        currentRisk = "No Risk";
        explanationMap.push({
          type: "Safe",
          message: "Scoped read-only policy",
          explanation: "Read-only safe permissions for internal IAM principal"
        });
      }
  
      highestRisk = getHighestRisk(highestRisk, currentRisk);
    }
  
    return {
      misconfigurations,
      warnings,
      explanationMap,
      riskLevel: highestRisk
    };
  };
  
  module.exports = { analyzeAWSIAM };
  