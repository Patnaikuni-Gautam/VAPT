"use client";

import { useRouter } from "next/navigation";
import { logoutUser } from "@/services/authService";

export default function Navbar() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logoutUser();
      router.push("/login");
    } catch (error) {
      console.error("Logout failed:", error.message);
    }
  };

  return (
    <nav className="bg-gray-800 text-white p-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div onClick={() => router.push("/dashboard")} 
          className="text-lg font-bold cursor-pointer hover:text-gray-300">
          Cloud IAM Checker
        </div>
        <div className="space-x-4">
          <button onClick={() => router.push("/dashboard")} 
            className="hover:text-gray-300">
            Dashboard
          </button>
          <button onClick={() => router.push("/misconfigurations")} 
            className="hover:text-gray-300">
            Misconfigurations
          </button>
          <button onClick={handleLogout}
            className="bg-red-600 px-3 py-1 rounded hover:bg-red-700">
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
