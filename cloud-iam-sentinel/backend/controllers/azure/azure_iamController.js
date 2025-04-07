const analyzeAzureIAM = (policy, policyStr) => {
    const misconfigurations = [];
    const warnings = [];
    const explanationMap = [];
    let riskLevel = "No Risk";

    const roleDefinitionId = policy.properties?.roleDefinitionId || policy.roleDefinitionId || "";
    const identity = policy.identity || {};
    const identityType = identity.type || "";
    const scope = policyStr.includes('"assignableScopes":["/"]');
    const hasCustomScope = policyStr.includes('"assignableScopes"') && !scope;

    // Critical Risk
    if (roleDefinitionId.includes("owner") && scope) {
        const msg = "Owner role with global scope detected";
        misconfigurations.push(msg);
        explanationMap.push({
            type: "Critical",
            message: msg,
            explanation: "Global Owner access poses extreme security risks"
        });
        riskLevel = "Critical";
    }
    // High Risk
    else if (roleDefinitionId.includes("owner") || scope) {
        const msg = roleDefinitionId.includes("owner") ? 
            "Owner role detected" : "Global scope detected";
        misconfigurations.push(msg);
        explanationMap.push({
            type: "High",
            message: msg,
            explanation: "Highly privileged access requires careful review"
        });
        riskLevel = "High";
    }
    // Medium Risk
    else if (roleDefinitionId.includes("contributor")) {
        const msg = "Contributor role detected";
        warnings.push(msg);
        explanationMap.push({
            type: "Medium",
            message: msg,
            explanation: "Contributor role provides significant access"
        });
        riskLevel = "Medium";
    }
    // Low Risk
    else if (!roleDefinitionId.includes("reader") && !hasCustomScope) {
        const msg = "Custom role without clear restrictions";
        warnings.push(msg);
        explanationMap.push({
            type: "Low",
            message: msg,
            explanation: "Consider implementing clear role boundaries"
        });
        riskLevel = "Low";
    }
    // No Risk - When using reader roles with proper scope
    else if (
        (roleDefinitionId.includes("reader") || hasCustomScope) &&
        !scope &&
        policy.properties?.condition
    ) {
        const msg = "Policy uses reader role with proper scoping and conditions";
        explanationMap.push({
            type: "Safe",
            message: msg,
            explanation: "Policy follows least privilege principle with proper access controls"
        });
        riskLevel = "No Risk";
    }

    return { misconfigurations, warnings, explanationMap, riskLevel };
};

module.exports = { analyzeAzureIAM };
