import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import DataSyncProvider from "@/components/DataSyncProvider";
import { Toaster } from "react-hot-toast";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import InstallPrompt from "@/components/InstallPrompt";

/* Font di-host lokal agar konsisten saat offline (kondisi gudang).
   Inter: sans modern untuk UI; JetBrains Mono: kode lokasi, SKU, batch,
   dan angka jumlah — nuansa data industri dengan digit tabular. */
const inter = localFont({
  src: "../fonts/inter-latin-variable.woff2",
  weight: "400 700",
  style: "normal",
  fallback: ["Arial", "sans-serif"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = localFont({
  src: "../fonts/jetbrains-mono-latin-variable.woff2",
  weight: "500 700",
  style: "normal",
  fallback: ["Consolas", "monospace"],
  display: "swap",
  variable: "--font-jetbrains",
});

export const viewport: Viewport = {
  themeColor: "#14181f",
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
    <html lang="id" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body
        className={`${inter.className} bg-[var(--primary-bg)] text-text-primary text-base2`}
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
