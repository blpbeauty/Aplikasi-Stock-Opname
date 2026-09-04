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
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 animate-fadeIn"
      role="dialog"
      aria-label="Pasang aplikasi"
    >
      <div className="w-full max-w-md mx-4 mb-4 bg-paper rounded-sheet shadow-sheet border border-border overflow-hidden animate-slideUp">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex items-center gap-3 border-b border-border-subtle">
          <div className="w-11 h-11 rounded-card flex items-center justify-center text-ivory font-bold"
               style={{ backgroundColor: "var(--espresso)" }}>
            <BrandBLP compact className="text-ivory text-sm" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-text-primary text-base2">
              Pasang BLP Stock
            </h2>
            <p className="text-meta text-text-secondary">
              Tambahkan ke layar utama
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="tap w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-text-secondary hover:bg-surface-warm"
            aria-label="Tutup prompt instalasi"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pb-4 pt-3">
          {isIOS ? (
            // iOS instructions
            <ol className="space-y-2.5">
              <li className="flex items-start gap-3 bg-surface-warm rounded-input p-3 text-meta text-text-primary">
                <span className="tnum shrink-0 w-7 h-7 rounded-full bg-primary text-ivory flex items-center justify-center text-meta font-bold">1</span>
                <span className="pt-0.5">
                  Ketuk ikon <strong>Share</strong> di bagian bawah Safari
                </span>
              </li>
              <li className="flex items-start gap-3 bg-surface-warm rounded-input p-3 text-meta text-text-primary">
                <span className="tnum shrink-0 w-7 h-7 rounded-full bg-primary text-ivory flex items-center justify-center text-meta font-bold">2</span>
                <span className="pt-0.5">
                  Gulir ke bawah dan pilih <strong>&quot;Add to Home Screen&quot;</strong>
                </span>
              </li>
              <li className="flex items-start gap-3 bg-surface-warm rounded-input p-3 text-meta text-text-primary">
                <span className="tnum shrink-0 w-7 h-7 rounded-full bg-primary text-ivory flex items-center justify-center text-meta font-bold">3</span>
                <span className="pt-0.5">
                  Ketuk <strong>&quot;Add&quot;</strong> untuk memasang
                </span>
              </li>
            </ol>
          ) : (
            // Android / Chrome
            <div className="space-y-3">
              <p className="text-meta text-text-secondary">
                Pasang aplikasi ini untuk akses cepat dari layar utama HP Anda.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleInstall}
                  className="flex-1 min-h-touch rounded-input bg-primary text-ivory font-bold text-meta transition active:scale-[0.98]"
                >
                  Pasang Sekarang
                </button>
                <button
                  onClick={handleDismiss}
                  className="min-h-touch px-5 rounded-input text-text-secondary font-semibold text-meta border border-border hover:bg-surface-warm transition"
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
