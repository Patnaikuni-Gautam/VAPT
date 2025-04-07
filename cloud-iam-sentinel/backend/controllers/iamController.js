const { analyzeAWSIAM } = require('./aws/aws_iamController');
const { analyzeGCPIAM } = require('./gcp/gcp_iamController');
const { analyzeAzureIAM } = require('./azure/azure_iamController');

const analyzeIAMPolicy = async (req, res) => {
  try {
    const { iamJson, cloudProvider, accountId } = req.body;
    const policy = typeof iamJson === 'string' ? JSON.parse(iamJson) : iamJson;
    const policyStr = JSON.stringify(policy);

    
    let detectedProvider = cloudProvider;
    if (!detectedProvider) {
      if (policyStr.includes('"Statement"') || policyStr.includes('"Version"')) {
        detectedProvider = 'AWS';
      } else if (policyStr.includes('"bindings"') || policyStr.includes('"role"')) {
        detectedProvider = 'GCP';
      } else if (policyStr.includes('"roleDefinitionId"') || policyStr.includes('"identity"')) {
        detectedProvider = 'Azure';
      }
    }

    if (!detectedProvider) {
      return res.status(400).json({
        success: false,
        message: 'Could not determine cloud provider from policy'
      });
    }

    // Dispatch to provider-specific analyzer
    let misconfigurations = [];
    let warnings = [];
    let explanationMap = [];

    if (detectedProvider === 'AWS') {
      ({ misconfigurations, warnings, explanationMap } = analyzeAWSIAM(policyStr));
    } else if (detectedProvider === 'GCP') {
      ({ misconfigurations, warnings, explanationMap } = analyzeGCPIAM(policy));
    } else if (detectedProvider === 'Azure') {
      ({ misconfigurations, warnings, explanationMap } = analyzeAzureIAM(policy, policyStr));
    }

    // Risk level calculation
    let riskLevel = 'No Risk'; // Default to No Risk when no issues found
    
    // Check for misconfigurations that contain severity indicators in their text
    const hasCritical = misconfigurations.some(m => m.toLowerCase().includes('critical'));
    const hasHigh = misconfigurations.some(m => m.toLowerCase().includes('high'));
    const hasMedium = misconfigurations.some(m => m.toLowerCase().includes('medium'));
    
    if (hasCritical) {
      riskLevel = 'Critical';
    } else if (hasHigh) {
      riskLevel = 'High';
    } else if (hasMedium || warnings.length > 0) {
      riskLevel = 'Medium';
    } else if (misconfigurations.length > 0) {
      riskLevel = 'Low';
    }

    return res.json({
      success: true,
      cloudProvider: detectedProvider,
      accountId: accountId || '',
      misconfigurations,
      warnings,
      riskLevel,
      explanation: explanationMap,
      message:
        misconfigurations.length || warnings.length
          ? 'Policy reviewed with potential issues or recommendations.'
          : 'No obvious misconfigurations found.'
    });

  } catch (err) {
    console.error('Error analyzing IAM policy:', err.message);
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON or internal error: ' + err.message
    });
  }
};

module.exports = {
  analyzeIAMPolicy
};
