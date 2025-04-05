"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { verifyUser } from "@/services/authService";

const Spinner = () => (
  <div className="border-gray-300 h-5 w-5 animate-spin rounded-full border-2 border-t-blue-600" />
);

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    verifyUser()
      .then(data => {
        if (data?.user) {
          setUser(data.user);
        } else {
          router.push("/login?message=Authentication failed");
        }
      })
      .catch((error) => {
        console.error('Authentication error:', error);
        if (error.message === 'Failed to fetch') {
          router.push("/login?message=API connection failed. Please check if the server is running.");
        } else {
          router.push("/login?message=Session expired");
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <Spinner />
        <p className="ml-2 text-gray-600">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-4 sm:px-0">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.name || "User"}!
          </h1>
          <p className="mt-1 text-md text-gray-600">
            Here's your overview.
          </p>
        </div>

        <div className="px-4 py-4 sm:px-0">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Your recent actions and system events.
                </p>
              </div>
              <div className="bg-gray-50 px-5 py-3">
                <a href="#" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">View all</a>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <h3 className="text-lg font-medium text-gray-900">IAM Analysis</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Quick access to IAM configuration analysis.
                </p>
              </div>
              <div className="bg-gray-50 px-5 py-3">
                <a href="/misconfigurations" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">Analyze Now</a>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <h3 className="text-lg font-medium text-gray-900">Account Settings</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Manage your profile and security preferences.
                </p>
              </div>
              <div className="bg-gray-50 px-5 py-3">
                <a href="#" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">Settings</a>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
