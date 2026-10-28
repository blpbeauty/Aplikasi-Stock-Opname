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
      icon: <ScanIcon className="w-5 h-5" />,
    },
    {
      key: "history" as const,
      label: "Riwayat",
      href: "/history",
      icon: <ClipboardIcon className="w-5 h-5" />,
    },
    {
      key: "profile" as const,
      label: "Profil",
      href: "/profile",
      icon: <UserIcon className="w-5 h-5" />,
    },
  ];

  return (
    <nav
      aria-label="Navigasi utama"
      className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200"
    >
      <div className="flex justify-around items-stretch max-w-md mx-auto px-2 pb-safe">
        {tabs.map((tab) => {
          const isActive = activePage === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex-1 h-13 min-h-[52px] flex flex-col items-center justify-center gap-0.5 py-1 transition border-t-2 ${
                isActive
                  ? "border-t-[#0D5C63] text-[#0D5C63] font-bold bg-[#E6F3F4]/40"
                  : "border-t-transparent text-slate-500 hover:text-[#0D5C63]"
              }`}
            >
              <span className="flex items-center justify-center">{tab.icon}</span>
              <span className="text-xs leading-none tracking-tight">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
