const analyzeIAMPolicy = async (req, res) => {
  try {
    const { iamJson, cloudProvider, accountId } = req.body;

    // Dummy validation: check if policy contains "Action": "*"
    const misconfigurations = [];

    if (iamJson.includes('"Action": "*"')) {
      misconfigurations.push("Wildcard action detected (*), which can be overly permissive.");
    }

    if (iamJson.includes('"Effect": "Allow"') && iamJson.includes('"Resource": "*"')) {
      misconfigurations.push("Allowing all actions on all resources.");
    }

    return res.json({
      success: true,
      misconfigurations,
      message: misconfigurations.length
        ? "Potential misconfigurations found."
        : "No obvious misconfigurations found.",
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: "Invalid JSON or internal error." });
  }
};

module.exports = {
  analyzeIAMPolicy
};
