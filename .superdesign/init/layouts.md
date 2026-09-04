# Layouts — App shell & shared chrome

## Root layout — `src/app/layout.tsx`
Renders `<html lang="id">` with Atkinson Hyperlegible local font; body uses `bg-[var(--primary-bg)] text-text-primary text-base2`. Wraps children in `AuthProvider` → `DataSyncProvider` → page + `Toaster` (react-hot-toast, top-center). Also mounts `ServiceWorkerRegister` (PWA offline) and `InstallPrompt` (install banner). Viewport: themeColor `#2f2119`, pinch zoom intentionally allowed (accessibility).

```tsx
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
```

## Bottom navigation — `src/components/BottomNav.tsx`
Fixed bottom bar (z-40), `bg-paper`, top border, `shadow-bar`, content max 720px centered, safe-area padding. Three tabs: Scan / Riwayat / Profil. Active tab: espresso text + pill chip (`bg-primary-pale`, w-12 h-8) behind the icon. Min height 4rem per tab. Full source in `components.md`.

## Page header — `PageHeader` in `src/components/ui.tsx`
Sticky top header (`bg-paper/95 backdrop-blur-sm`, bottom border): optional back chevron button (44px), bold title + optional secondary subtitle, right slot (used for `IconButton`s and `SyncStatusBadge`). Full source in `components.md`.

## Location band — `.location-band` CSS + `LocationBand` component
The signature layout element: dark espresso strip with 6px ochre left border, 4px radius, huge uppercase tabular-num location code (28px, 36px ≥640px), ivory text, muted sub-line. Used on `/input` (active location) and as brand identity block on `/login` ("Stock Opname / Gudang BLP").

## App shell CSS
`.app-shell` / `.mobile-container`: width 100%, max-width **720px (45rem)**, centered, min-height 100dvh, `background-color: var(--primary-bg)`. Pages with `BottomNav` add bottom padding to clear the fixed nav.

## Context providers (non-visual wrappers)
- `src/components/AuthProvider.tsx` — session context (`useAuth`: `user`, `login`, `logout`), redirects unauthenticated users.
- `src/components/DataSyncProvider.tsx` — offline sync context (`useDataSync`: `syncProgress`, `lastSyncTime`, `forceSync`), background sync of local entries.
