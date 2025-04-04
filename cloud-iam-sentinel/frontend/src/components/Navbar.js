"use client";
import { useRouter } from "next/navigation";
import { removeToken } from "@/lib/auth";

export default function Navbar() {
  const router = useRouter();

  const handleLogout = () => {
    removeToken();
    router.push("/login");
  };

  return (
    <nav className="bg-white shadow p-4 flex justify-between items-center">
      <div className="text-xl font-bold">Cloud IAM Sentinel</div>
      <div className="flex gap-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-blue-600 hover:underline"
        >
          Dashboard
        </button>
        <button
          onClick={() => router.push("/misconfigurations")}
          className="text-blue-600 hover:underline"
        >
          Misconfigurations
        </button>
        <button
          onClick={handleLogout}
          className="text-red-600 hover:underline"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
