const HIGH_RISK_ROLES = [
    'roles/owner',
    'roles/editor',
    'roles/storage.admin',
    'roles/compute.admin',
    'roles/iam.admin'
];

const MEDIUM_RISK_ROLES = [
    'roles/storage.objectViewer',
    'roles/storage.objectCreator',
    'roles/compute.viewer'
];

const LOW_RISK_ROLES = [
    'roles/monitoring.viewer',
    'roles/logging.viewer',
    'roles/browser'
];

const isRestrictedToService = (condition) => {
    return condition && 
           condition.expression && 
           condition.expression.includes('resource.type');
};

const analyzeGCPIAM = (policyStr) => {
    const misconfigurations = [];
    const warnings = [];
    const explanationMap = [];
    let riskLevel = "No Risk";

    try {
        const policy = typeof policyStr === 'string' ? JSON.parse(policyStr) : policyStr;
        const bindings = policy.bindings || [];

        for (const binding of bindings) {
            const { role, members = [], condition } = binding;

            // CRITICAL RISK - Owner role with allUsers or allAuthenticatedUsers
            if ((role === 'roles/owner' || role === 'roles/editor') && 
                members.some(m => m === 'allUsers' || m === 'allAuthenticatedUsers')) {
                riskLevel = "Critical";
                misconfigurations.push("Critical: Privileged role accessible to all users");
                explanationMap.push({
                    type: "Critical",
                    message: "Extreme security risk detected",
                    explanation: "Administrative access is granted to unauthenticated users"
                });
                break;
            }

            // HIGH RISK - Administrative roles
            else if (HIGH_RISK_ROLES.includes(role)) {
                riskLevel = "High";
                misconfigurations.push(`High: ${role} assigned with broad access`);
                explanationMap.push({
                    type: "High",
                    message: "Administrative role detected",
                    explanation: "Highly privileged role assigned with broad scope"
                });
                break;
            }

            // MEDIUM RISK - Public read access
            else if (MEDIUM_RISK_ROLES.includes(role) && 
                     members.some(m => m === 'allAuthenticatedUsers' || m === 'allUsers')) {
                riskLevel = "Medium";
                warnings.push(`Medium: ${role} accessible to all authenticated users`);
                explanationMap.push({
                    type: "Medium",
                    message: "Broad access configuration",
                    explanation: "Resource accessible to all authenticated users"
                });
            }

            // LOW RISK - Basic viewer roles without conditions
            else if (LOW_RISK_ROLES.includes(role) && 
                     members.every(m => m.startsWith('user:')) &&
                     !condition) {
                if (riskLevel === "No Risk") {
                    riskLevel = "Low";
                    warnings.push(`Low: ${role} assigned to specific users`);
                    explanationMap.push({
                        type: "Low",
                        message: "Limited viewer access",
                        explanation: "Read-only access granted to specific users without conditions"
                    });
                }
            }

            // NO RISK - Viewer role with conditions and specific users
            else if (members.every(m => m.startsWith('user:')) && 
                     isRestrictedToService(condition) &&
                     (role.includes('viewer') || role.includes('readonly'))) {
                if (riskLevel === "No Risk") {
                    explanationMap.push({
                        type: "Safe",
                        message: "Minimal privilege configuration",
                        explanation: "Policy uses specific users, service restrictions, and read-only access"
                    });
                }
            }
        }

        return { misconfigurations, warnings, explanationMap, riskLevel };

    } catch (error) {
        return {
            misconfigurations: ["Error parsing policy"],
            warnings: [],
            explanationMap: [{
                type: "Error",
                message: "Policy analysis failed",
                explanation: error.message
            }],
            riskLevel: "Error"
        };
    }
};

module.exports = { analyzeGCPIAM };
