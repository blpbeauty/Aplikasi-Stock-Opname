import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import DataSyncProvider from "@/components/DataSyncProvider";
import { Toaster } from "react-hot-toast";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import InstallPrompt from "@/components/InstallPrompt";

/* Font di-host lokal agar konsisten saat offline (kondisi gudang).
   Atkinson Hyperlegible: dibuat untuk keterbacaan maksimal — penting
   untuk angka, SKU, dan karakter mirip (I/l/1, O/0). */
const atkinson = localFont({
  src: [
    { path: "../fonts/atkinson-hyperlegible-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/atkinson-hyperlegible-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  fallback: ["Arial", "sans-serif"],
  display: "swap",
  variable: "--font-atkinson",
});

export const viewport: Viewport = {
  themeColor: "#2f2119",
  width: "device-width",
  initialScale: 1,
  // Pinch zoom sengaja TIDAK dibatasi agar pengguna bisa memperbesar teks.
  userScalable: true,
};

export const metadata: Metadata = {
  title: "Stock Opname App",
  description: "Aplikasi Stock Opname Gudang",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Stock Opname",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={atkinson.variable}>
      <head>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body
        className={`${atkinson.className} bg-[var(--primary-bg)] text-text-primary text-base2`}
      >
        <AuthProvider>
          <DataSyncProvider>
            {children}
            <Toaster position="top-center" />
          </DataSyncProvider>
        </AuthProvider>
        <ServiceWorkerRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
