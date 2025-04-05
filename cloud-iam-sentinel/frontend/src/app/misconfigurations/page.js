"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { verifyUser } from "@/services/authService";
import Navbar from "@/components/Navbar";

const Spinner = () => (
  <div className="border-gray-300 h-5 w-5 animate-spin rounded-full border-2 border-t-blue-600" />
);

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
        const accountId = json.accountId || json.AccountId || json.account_id || "";
        let cloudProvider = "";

        if (json.Statement || json.Version) cloudProvider = "AWS";
        else if (json.bindings || json.role || json.etag) cloudProvider = "GCP";
        else if (json.identity || json.roleDefinitionId) cloudProvider = "Azure";

        setJsonError(false);
        setFormData({
          iamJson: JSON.stringify(json, null, 2),
          accountId,
          cloudProvider
        });
      } catch {
        setJsonError(true);
        setError("Invalid JSON format");
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("http://localhost:5000/api/iam/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Analysis failed");
      setResult(data);
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
                    JSON.parse(e.target.value);
                    setJsonError(false);
                    setFormData({ ...formData, iamJson: e.target.value });
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

          {result && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2 text-gray-700">Analysis Results:</h3>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-x-auto max-h-80">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}