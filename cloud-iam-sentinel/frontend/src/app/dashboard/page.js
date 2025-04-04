"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { getToken } from "@/lib/auth";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = getToken();
    if (token) {
      // Mock decode or fetch user details from backend
      const payload = JSON.parse(atob(token.split(".")[1]));
      setUser(payload);
    }
  }, []);

  return (
    <ProtectedRoute>
      <div className="flex flex-col items-center justify-center h-screen bg-gray-100">
        <div className="bg-white p-6 rounded-2xl shadow-md text-center w-full max-w-xl">
          <h1 className="text-3xl font-bold mb-4">Welcome to the Dashboard</h1>
          {user ? (
            <p className="text-gray-700">Logged in as <strong>{user.email}</strong></p>
          ) : (
            <p className="text-gray-500">Loading user info...</p>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
