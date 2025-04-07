"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { verifyUser } from "@/services/authService";
import Navbar from "@/components/Navbar";
import RiskColor from "@/components/RiskColor";
import { ClipboardIcon, ClipboardCheckIcon } from '@heroicons/react/outline';

const Spinner = () => (
  <div className="border-gray-300 h-5 w-5 animate-spin rounded-full border-2 border-t-blue-600" />
);

const JsonDisplay = ({ data }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="relative mt-4 bg-gray-50 rounded-lg shadow-sm">
      <div className="flex justify-between items-center px-4 py-2 bg-gray-100 rounded-t-lg">
        <h3 className="text-sm font-medium text-gray-700">Full JSON Response</h3>
        <button
          onClick={handleCopy}
          className={`flex items-center space-x-1 px-3 py-1 rounded-md text-sm ${
            copied ? 'bg-green-100 text-green-800' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {copied ? (
            <>
              <ClipboardCheckIcon className="h-4 w-4" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <ClipboardIcon className="h-4 w-4" />
              <span>Copy JSON</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm text-gray-800 font-mono">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
};

export default function MisconfigurationsPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    iamJson: "",
    cloudProvider: "",
    accountId: ""
  });
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [jsonError, setJsonError] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    verifyUser().catch(() => router.push("/login"));
  }, [router]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        detectProviderAndAccount(json); // Move provider detection to separate function
      } catch {
        setJsonError(true);
        setError("Invalid JSON format");
      }
    };
    reader.readAsText(file);
  };

  // Add this new function to detect provider and account ID
  const detectProviderAndAccount = (json) => {
    let cloudProvider = "";
    let accountId = "";

    // Check for AWS
    if (json.Statement || json.Version) {
      cloudProvider = "AWS";
      accountId = json.accountId || json.AccountId || 
                  (json.Statement?.[0]?.Principal?.AWS && 
                   json.Statement[0].Principal.AWS.split(":")[4]) || "";
    }
    // Check for GCP
    else if (json.bindings || json.role || json.etag) {
      cloudProvider = "GCP";
      accountId = json.projectNumber || json.projectId || "";
    }
    // Check for Azure
    else if (json.identity || json.roleDefinitionId) {
      cloudProvider = "Azure";
      accountId = json.subscriptionId || "";
    }

    setJsonError(false);
    setFormData({
      iamJson: JSON.stringify(json, null, 2),
      cloudProvider,
      accountId
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setSuccessMsg("");

    try {
      const res = await fetch("http://localhost:5000/api/iam/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Analysis failed");
      console.log("Complete API response:", data); // Add this line
      console.log("Risk level type:", typeof data.riskLevel); // Add this line
      setResult(data);
      setSuccessMsg("✅ Analysis completed successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="pt-24 pb-10 px-4">
        <div className="max-w-3xl mx-auto bg-white shadow-md rounded-lg p-6 border">
          <h2 className="text-2xl font-bold mb-4 text-center text-gray-800">
            IAM Misconfiguration Analyzer
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block font-medium text-gray-700">Cloud Provider</label>
              <input
                type="text"
                value={formData.cloudProvider}
                readOnly
                className="w-full p-2 border rounded bg-gray-100 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block font-medium text-gray-700">Account ID</label>
              <input
                type="text"
                value={formData.accountId}
                readOnly
                className="w-full p-2 border rounded bg-gray-100 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block font-medium text-gray-700">Upload IAM JSON File</label>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="w-full border border-gray-300 rounded py-1 px-2 mt-1"
              />
              {fileName && <p className="text-sm mt-1 text-gray-500">📄 {fileName}</p>}
            </div>

            <div>
              <label className="block font-medium text-gray-700">IAM JSON Content</label>
              <textarea
                value={formData.iamJson}
                onChange={(e) => {
                  try {
                    const json = JSON.parse(e.target.value);
                    detectProviderAndAccount(json);
                  } catch {
                    setJsonError(true);
                    setFormData({ ...formData, iamJson: e.target.value });
                  }
                }}
                rows="10"
                placeholder="{ ... }"
                className="w-full p-2 border rounded font-mono text-sm"
              />
              {jsonError && (
                <p className="text-red-500 text-sm mt-1">⚠️ Invalid JSON format</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || jsonError}
              className={`w-full py-2 rounded text-white ${
                loading || jsonError
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading ? <Spinner /> : "Analyze"}
            </button>
          </form>

          {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
          {successMsg && <p className="text-green-600 mt-4 text-center">{successMsg}</p>}

          {result && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2 text-gray-700">
                Analysis Results: <RiskColor level={result.riskLevel} />
              </h3>

              {result.riskExplanation && (
                <div className="mt-4 p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <h4 className="font-semibold mb-2">Risk Explanation</h4>
                  <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                    {result.riskExplanation.map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              <JsonDisplay data={result} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
