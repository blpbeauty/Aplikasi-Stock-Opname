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
      className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#8ADBD9]/50 shadow-bar"
    >
      <div className="flex justify-around items-center gap-1.5 max-w-md mx-auto px-2.5 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        {tabs.map((tab) => {
          const isActive = activePage === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex-1 min-h-[48px] px-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-150 active:scale-[0.97] ${
                isActive
                  ? "bg-gradient-to-r from-[#D3F5F4] to-[#E3F9F8] text-[#0B666E] border border-[#8ADBD9]/75 font-bold shadow-subtle"
                  : "text-[#487277] hover:text-[#0D3B40] hover:bg-[#EEFBFB] font-medium border border-transparent"
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
