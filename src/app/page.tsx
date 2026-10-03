"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const session = getSession();
    if (session) {
      router.push("/scan");
    } else {
      router.push("/login");
    }
  }, [router]);

  return (
    <div className="min-h-dvh flex items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}
