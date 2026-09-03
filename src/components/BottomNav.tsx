"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface BottomNavProps {
  activePage: "scan" | "history" | "profile";
}

export default function BottomNav({ activePage }: BottomNavProps) {
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/scan");
    router.prefetch("/history");
    router.prefetch("/profile");
  }, [router]);

  const tabs = [
    {
      key: "scan" as const,
      label: "Scan",
      href: "/scan",
      icon: (active: boolean) => (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={active ? 2.4 : 1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
          />
        </svg>
      ),
    },
    {
      key: "history" as const,
      label: "Riwayat",
      href: "/history",
      icon: (active: boolean) => (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={active ? 2.4 : 1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
    {
      key: "profile" as const,
      label: "Profil",
      href: "/profile",
      icon: (active: boolean) => (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={active ? 2.4 : 1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      ),
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-border shadow-[0_-4px_20px_rgba(74,53,40,0.05)]">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto px-4 pb-safe">
        {tabs.map((tab) => {
          const isActive = activePage === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 transition-all rounded-xl active:scale-95 ${
                isActive
                  ? "text-primary font-bold"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <div
                className={`relative px-4 py-1 rounded-full transition-all ${
                  isActive ? "bg-primary-pale text-primary" : ""
                }`}
              >
                {tab.icon(isActive)}
              </div>
              <span
                className={`text-[11px] mt-0.5 tracking-tight ${
                  isActive ? "font-bold text-primary" : "font-medium"
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
