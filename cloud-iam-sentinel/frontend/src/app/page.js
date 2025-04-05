"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { verifyUser } from "@/services/authService";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await verifyUser(); // checks for valid HttpOnly token
        router.replace("/dashboard");
      } catch {
        router.replace("/login");
      }
    };
    checkAuth();
  }, [router]);

  return null;
}
