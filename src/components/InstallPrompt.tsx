"use client";

import { useState, useEffect } from "react";
import BrandBLP from "./BrandBLP";
import { XIcon } from "./icons";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    if (standalone) return; // Don't show if already installed

    // Detect iOS
    const ua = window.navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(isIOSDevice);

    // Check if user dismissed before (respect for 3 days)
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed) {
      const dismissedDate = new Date(dismissed);
      const now = new Date();
      const diffDays = (now.getTime() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays < 3) return; // Don't show for 3 days after dismiss
    }

    // For Android/Chrome - listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // For iOS - show manual instruction after 3 seconds
    if (isIOSDevice) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handler);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setShowPrompt(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDeferredPrompt(null);
    localStorage.setItem("pwa-install-dismissed", new Date().toISOString());
  };

  // Don't render anything if already installed or prompt not ready
  if (isStandalone || !showPrompt) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 animate-fadeIn"
      role="dialog"
      aria-label="Pasang aplikasi"
    >
      <div className="w-full max-w-md mx-3 mb-3 bg-white rounded-2xl shadow-sheet border border-[#9BE0DF]/75 overflow-hidden animate-slideUp pb-safe">
        {/* Header */}
        <div className="px-4 pt-3.5 pb-3 flex items-center gap-3 bg-gradient-to-r from-[#DCF6F5] to-[#EEFBFB] border-b border-[#9BE0DF]/60">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#0E838C] to-[#14B8A6] text-white font-bold shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)]">
            <BrandBLP compact className="text-white text-sm" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-[#0D3B40] text-sm">
              Pasang BLP Stock
            </h2>
            <p className="text-xs text-[#487277] mt-0.5">
              Tambahkan ke layar utama
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="w-11 h-11 -mr-1.5 flex items-center justify-center rounded-xl text-[#487277] hover:bg-white/80 active:scale-[0.96] transition-transform"
            aria-label="Tutup prompt instalasi"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 pb-4 pt-3.5">
          {isIOS ? (
            // iOS instructions
            <ol className="space-y-2">
              <li className="flex items-start gap-3 bg-[#EEFBFB] border border-[#9CE0DF]/75 rounded-xl p-3 text-xs text-[#0D3B40]">
                <span className="tnum shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-[#0E838C] to-[#14B8A6] text-white flex items-center justify-center text-xs font-semibold">1</span>
                <span className="pt-0.5 leading-relaxed">
                  Ketuk ikon <strong>Share</strong> di bagian bawah Safari
                </span>
              </li>
              <li className="flex items-start gap-3 bg-[#EEFBFB] border border-[#9CE0DF]/75 rounded-xl p-3 text-xs text-[#0D3B40]">
                <span className="tnum shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-[#0E838C] to-[#14B8A6] text-white flex items-center justify-center text-xs font-semibold">2</span>
                <span className="pt-0.5 leading-relaxed">
                  Gulir ke bawah dan pilih <strong>&quot;Add to Home Screen&quot;</strong>
                </span>
              </li>
              <li className="flex items-start gap-3 bg-[#EEFBFB] border border-[#9CE0DF]/75 rounded-xl p-3 text-xs text-[#0D3B40]">
                <span className="tnum shrink-0 w-6 h-6 rounded-full bg-gradient-to-r from-[#0E838C] to-[#14B8A6] text-white flex items-center justify-center text-xs font-semibold">3</span>
                <span className="pt-0.5 leading-relaxed">
                  Ketuk <strong>&quot;Add&quot;</strong> untuk memasang
                </span>
              </li>
            </ol>
          ) : (
            // Android / Chrome
            <div className="space-y-3">
              <p className="text-xs text-[#487277] leading-relaxed">
                Pasang aplikasi ini untuk akses cepat dari layar utama HP Anda.
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={handleInstall}
                  className="flex-1 min-h-[44px] rounded-xl bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white font-semibold text-sm shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)] transition-all duration-150 active:scale-[0.98]"
                >
                  Pasang Sekarang
                </button>
                <button
                  onClick={handleDismiss}
                  className="min-h-[44px] px-5 rounded-xl bg-[#EEFBFB] text-[#487277] font-semibold text-sm border border-[#9CE0DF]/80 hover:text-[#0D3B40] hover:bg-[#D5F4F3] transition-all duration-150 active:scale-[0.98]"
                >
                  Nanti
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
