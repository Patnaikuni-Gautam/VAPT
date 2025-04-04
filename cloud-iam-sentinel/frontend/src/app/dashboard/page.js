"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const router = useRouter();
  const [token, setToken] = useState(null);

  useEffect(() => {
    // Check both localStorage and sessionStorage
    const savedToken = localStorage.getItem("token") || sessionStorage.getItem("token");
    if (!savedToken) {
      router.push("/login");
    } else {
      setToken(savedToken);
    }
  }, [router]);

  const handleLogout = () => {
    // Clear token from both storages
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
    router.push("/login");
  };

  if (!token) return <p className="text-center mt-10">Redirecting...</p>;

  return (
    <div className="max-w-2xl mx-auto mt-20 p-6 border rounded shadow bg-white">
      <h1 className="text-3xl font-bold mb-4">Welcome to the Dashboard</h1>
      <p className="mb-6">This is a protected route. Only logged-in users can see this.</p>
      <button
        onClick={handleLogout}
        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
      >
        Logout
      </button>
    </div>
  );
}
