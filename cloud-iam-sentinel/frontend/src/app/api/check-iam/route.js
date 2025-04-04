export async function POST(req) {
    try {
      const { policy } = await req.json();
  
      // Dummy validation: check if policy contains "Action": "*"
      const misconfigurations = [];
  
      if (policy.includes('"Action": "*"')) {
        misconfigurations.push("Wildcard action detected (*), which can be overly permissive.");
      }
  
      if (policy.includes('"Effect": "Allow"') && policy.includes('"Resource": "*"')) {
        misconfigurations.push("Allowing all actions on all resources.");
      }
  
      return Response.json({
        success: true,
        misconfigurations,
        message: misconfigurations.length
          ? "Potential misconfigurations found."
          : "No obvious misconfigurations found.",
      });
    } catch (err) {
      return Response.json({ success: false, message: "Invalid JSON or internal error." }, { status: 400 });
    }
  }
  