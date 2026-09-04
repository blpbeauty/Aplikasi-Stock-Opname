"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ScanIcon, ClipboardIcon, UserIcon } from "@/components/icons";

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
      icon: <ScanIcon className="w-6 h-6" />,
    },
    {
      key: "history" as const,
      label: "Riwayat",
      href: "/history",
      icon: <ClipboardIcon className="w-6 h-6" />,
    },
    {
      key: "profile" as const,
      label: "Profil",
      href: "/profile",
      icon: <UserIcon className="w-6 h-6" />,
    },
  ];

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed bottom-0 left-0 right-0 z-40 bg-paper border-t border-border shadow-bar"
    >
      <div className="flex justify-around items-stretch max-w-[720px] mx-auto px-2 pb-safe">
        {tabs.map((tab) => {
          const isActive = activePage === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex-1 min-h-[4rem] flex flex-col items-center justify-center gap-0.5 py-1.5 transition rounded-input ${
                isActive ? "text-primary font-bold" : "text-text-secondary"
              }`}
            >
              <span
                className={`flex items-center justify-center w-12 h-8 rounded-full transition ${
                  isActive ? "bg-primary-pale text-primary" : ""
                }`}
              >
                {tab.icon}
              </span>
              <span className="text-meta leading-none">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
