"use client";
import { useState } from "react";

export default function MisconfigurationsPage() {
  const [policyJSON, setPolicyJSON] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/check-iam", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ policy: policyJSON }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Something went wrong");
      setResult(data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="bg-white p-6 rounded-2xl shadow-lg w-full max-w-2xl">
        <h1 className="text-2xl font-bold mb-4 text-center">IAM Misconfiguration Checker</h1>
        <form onSubmit={handleSubmit}>
          <textarea
            className="w-full p-3 border border-gray-300 rounded-lg mb-4 h-60 resize-none"
            placeholder='Paste IAM Policy JSON here...'
            value={policyJSON}
            onChange={(e) => setPolicyJSON(e.target.value)}
            required
          />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Check Policy
          </button>
        </form>

        {error && <p className="text-red-600 mt-4 text-center">{error}</p>}

        {result && (
          <div className="mt-6 bg-gray-50 border p-4 rounded-xl text-sm">
            <h2 className="font-semibold mb-2">Results:</h2>
            <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
