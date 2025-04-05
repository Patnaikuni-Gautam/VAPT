"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { verifyUser } from "@/services/authService";

const Spinner = () => (
  <div className="border-gray-300 h-5 w-5 animate-spin rounded-full border-2 border-t-blue-600" />
);

export default function ProtectedRoute({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    verifyUser()
      .then(data => {
        if (data?.user) {
          setIsAuthenticated(true);
        } else {
          router.push("/login?message=Session expired");
        }
      })
      .catch(() => router.push("/login?message=Unauthorized"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <Spinner />
        <p className="ml-2 text-gray-600">Verifying access...</p>
      </div>
    );
  }

  return isAuthenticated ? children : null;
}
