# Components — shared UI primitives (full source)

Design concept: **"Label Rak Operasional"** (operational shelf label). Mobile-first, warehouse-grade accessibility (44px touch targets, AA contrast, tabular numbers). All below components live in `src/components/`.

## `src/components/ui.tsx` — primitive library
Contains: `Dialog` (bottom sheet on mobile / centered dialog on desktop; focus trap, Escape, scroll lock, focus restore), `IconButton` (variants neutral/primary/danger, 44/48px), `PageHeader` (sticky: back chevron + title/subtitle + right slot), `EmptyState`, `Field` (label + hint + error), `LocationBand` (high-contrast location strip), `SyncStatusBadge` (honest sync status: syncing/offline/failed/ready/never; tap to retry).

```tsx
"use client";

/**
 * Primitif UI bersama — konsep "Label Rak Operasional".
 * Hanya komponen yang benar-benar dipakai berulang di beberapa halaman.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useDataSync } from "@/components/DataSyncProvider";
import { XIcon, RefreshIcon, ChevronLeftIcon } from "@/components/icons";

/* ────────────────────────────────────────────────────────────────
   Dialog / BottomSheet — semantik dialog lengkap:
   role="dialog" + judul, focus trap, Escape, pengembalian fokus,
   dan penguncian scroll body.
   ──────────────────────────────────────────────────────────────── */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** sm untuk konfirmasi, md untuk form/sheet */
  size?: "sm" | "md";
}

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    // Fokus ke elemen pertama yang bisa difokus (atau panel itu sendiri)
    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first || panel).focus();
    };
    const t = setTimeout(focusFirst, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const items = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        );
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center sm:p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`bg-paper w-full ${size === "sm" ? "sm:max-w-sm" : "sm:max-w-md"} ${
          size === "sm" ? "rounded-t-sheet sm:rounded-card" : "rounded-t-sheet sm:rounded-sheet"
        } border border-border border-b-0 sm:border-b shadow-sheet outline-none flex flex-col max-h-[88vh] animate-slideUp`}
      >
        <div className="px-5 pt-4 pb-3 border-b border-border-subtle flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-text-primary leading-snug">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-meta text-text-secondary mt-0.5">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap shrink-0 -mr-2 -mt-1 w-11 h-11 rounded-input flex items-center justify-center text-text-secondary hover:bg-surface-warm transition"
            aria-label="Tutup dialog"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 pb-16 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div className="px-5 py-3 border-t border-border-subtle pb-safe">{footer}</div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   IconButton — tombol ikon wajib punya nama aksesibel.
   ──────────────────────────────────────────────────────────────── */

interface IconButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  variant?: "neutral" | "primary" | "danger";
  /** 44px default, 48px untuk aksi utama */
  size?: "md" | "lg";
  disabled?: boolean;
  title?: string;
  className?: string;
}

export function IconButton({
  label,
  onClick,
  children,
  variant = "neutral",
  size = "md",
  disabled,
  title,
  className = "",
}: IconButtonProps) {
  const sizeCls = size === "lg" ? "w-12 h-12" : "w-11 h-11";
  const variantCls =
    variant === "primary"
      ? "bg-primary text-ivory hover:bg-primary-light"
      : variant === "danger"
      ? "bg-danger-bg text-danger hover:bg-danger hover:text-white"
      : "bg-surface-warm text-text-primary hover:bg-primary-pale";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={label}
      className={`${sizeCls} ${variantCls} rounded-input flex items-center justify-center transition active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${className}`}
    >
      {children}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────
   PageHeader — header halaman konsisten: kembali + judul + slot kanan.
   ──────────────────────────────────────────────────────────────── */

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  onBack,
  backLabel = "Kembali",
  right,
}: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-paper/95 backdrop-blur-sm px-4 pt-3 pb-2.5 border-b border-border">
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="tap w-11 h-11 -ml-2 rounded-input flex items-center justify-center text-text-primary hover:bg-surface-warm transition"
            aria-label={backLabel}
          >
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold text-text-primary leading-tight">{title}</h1>
          {subtitle && (
            <div className="text-meta text-text-secondary leading-snug">{subtitle}</div>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}

/* ────────────────────────────────────────────────────────────────
   EmptyState — semua keadaan kosong memberi umpan balik jelas.
   ──────────────────────────────────────────────────────────────── */

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="bg-paper rounded-card border border-border px-6 py-10 text-center">
      {icon && (
        <div className="w-12 h-12 rounded-label bg-primary-pale text-primary mx-auto flex items-center justify-center mb-3">
          {icon}
        </div>
      )}
      <p className="text-base2 font-bold text-text-primary">{title}</p>
      {description && (
        <p className="text-meta text-text-secondary mt-1 max-w-xs mx-auto">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   Field — label terasosiasi + hint + error untuk semua form.
   ──────────────────────────────────────────────────────────────── */

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
  className = "",
}: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-meta font-bold text-text-primary mb-1">
        {label}
        {required && (
          <span className="text-danger ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="text-meta text-text-secondary mt-1">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-meta font-semibold text-danger mt-1">
          {error}
        </p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   LocationBand — pita lokasi kontras di atas layar Scan/Input.
   Selalu menjawab: "saya sedang bekerja di lokasi mana?".
   ──────────────────────────────────────────────────────────────── */

export function LocationBand({ code, sub }: { code: string; sub?: ReactNode }) {
  return (
    <div className="location-band" aria-label={`Lokasi aktif: ${code}`}>
      <p className="location-band-code">{code}</p>
      {sub && <p className="location-band-sub mt-0.5">{sub}</p>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   SyncStatusBadge — status sinkronisasi yang jujur:
   - Menyinkronkan (proses berjalan)
   - Gagal sinkron — Coba lagi (error + aksi)
   - Siap offline (data terakhir tersedia untuk dibaca)
   - Belum sinkron (belum pernah sync)
   Status dibedakan dengan teks + ikon, bukan warna saja.
   ──────────────────────────────────────────────────────────────── */

export function SyncStatusBadge() {
  const { syncProgress, lastSyncTime, forceSync } = useDataSync();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const syncing = syncProgress.status === "syncing";
  const failed = syncProgress.status === "error";

  let label: string;
  let tone: "neutral" | "ok" | "warn" | "busy";
  if (syncing) {
    label = "Menyinkronkan…";
    tone = "busy";
  } else if (failed && !online) {
    label = "Offline — pakai data lokal";
    tone = "warn";
  } else if (failed) {
    label = "Gagal sinkron";
    tone = "warn";
  } else if (lastSyncTime) {
    label = "Siap offline";
    tone = "ok";
  } else {
    label = "Belum sinkron";
    tone = "neutral";
  }

  const toneCls =
    tone === "ok"
      ? "bg-surface-warm text-text-primary border-border"
      : tone === "warn"
      ? "bg-amber-bg text-amber-text border-amber-text/30"
      : tone === "busy"
      ? "bg-info-bg text-info border-info/30"
      : "bg-surface-warm text-text-secondary border-border";

  return (
    <button
      type="button"
      onClick={() => {
        if (!syncing) {
          forceSync();
        }
      }}
      disabled={syncing}
      title={
        lastSyncTime
          ? `Terakhir sinkron: ${new Date(lastSyncTime).toLocaleTimeString("id-ID")}${
              online ? "" : " · sedang offline"
            }`
          : "Ketuk untuk sinkronisasi"
      }
      aria-label={`Status sinkronisasi: ${label}. Ketuk untuk sinkron ulang.`}
      className={`tap h-11 px-3 inline-flex items-center gap-1.5 rounded-label border ${toneCls} text-meta font-bold transition active:scale-95 disabled:active:scale-100`}
    >
      {syncing ? (
        <RefreshIcon className="w-3.5 h-3.5 animate-spin" />
      ) : tone === "warn" ? (
        <span aria-hidden="true" className="text-sm leading-none">
          !
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={`w-2 h-2 rounded-full ${
            tone === "ok" ? "bg-primary" : tone === "busy" ? "bg-info" : "bg-text-secondary"
          }`}
        />
      )}
      <span>{label}</span>
    </button>
  );
}
```

## `src/components/BottomNav.tsx` — main bottom navigation
```tsx
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
```

## `src/components/QtyInput.tsx` — quantity input with safe math expressions
Distinctive component: text input accepting `+ - * x /` expressions (e.g. `12+3*4`), live preview pill `= 24` (amber), commit button `=`, operator buttons row (+ − × and 123/abc keypad toggle), no eval (safe tokenizer in `calcExpr`). Two sizes: `wide` (w-full h-12 + operator row) and compact (w-20 h-11). Full source: `src/components/QtyInput.tsx`.

## `src/components/ConfirmModal.tsx` — confirmation dialog
```tsx
"use client";

import { Dialog } from "@/components/ui";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  /** Saat konfirmasi async, set true agar tombol menampilkan status. */
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Ya, Lanjutkan",
  cancelText = "Batal",
  isDanger = false,
  busy = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      title={title}
      description={message}
      size="sm"
      footer={
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 min-h-touch px-4 bg-surface-warm text-text-primary text-meta font-bold rounded-input transition active:scale-[0.98] disabled:opacity-40"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 min-h-touch px-4 text-ivory text-meta font-bold rounded-input transition active:scale-[0.98] disabled:opacity-60 ${
              isDanger ? "bg-danger" : "bg-primary"
            }`}
          >
            {busy ? "Memproses…" : confirmText}
          </button>
        </div>
      }
    />
  );
}
```

## `src/components/ProductCard.tsx` — quantity row card (legacy-ish)
```tsx
"use client";

import { Product } from "@/lib/types";

interface ProductCardProps {
  product: Product;
  quantity: number;
  onChange: (sku: string, qty: number) => void;
  onDelete?: (sku: string) => void;
}

export default function ProductCard({
  product,
  quantity,
  onChange,
  onDelete,
}: ProductCardProps) {
  const handleIncrement = () => {
    onChange(product.sku, quantity + 1);
  };

  const handleDecrement = () => {
    if (quantity > 0) {
      onChange(product.sku, quantity - 1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    if (value >= 0) {
      onChange(product.sku, value);
    }
  };

  return (
    <div className="bg-white border border-border rounded-lg p-4 mb-3 shadow-sm relative">
      {onDelete && (
        <button
          onClick={() => onDelete(product.sku)}
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-red-100 text-red-600 hover:bg-red-500 hover:text-white transition text-sm font-bold"
          title="Hapus produk"
        >
          ✕
        </button>
      )}
      <h3 className="font-semibold text-text-primary mb-1 pr-8">
        {product.productName}
      </h3>
      <p className="text-sm text-text-secondary mb-2">
        SKU: {product.sku} | Batch: {product.batch}
      </p>

      <div className="flex items-center justify-between mt-3">
        <button
          onClick={handleDecrement}
          className="w-10 h-10 bg-primary-pale text-primary rounded-lg font-bold text-xl hover:bg-primary-light hover:text-white transition"
          disabled={quantity === 0}
        >
          −
        </button>

        <input
          type="number"
          value={quantity}
          onChange={handleInputChange}
          className="w-20 h-10 text-center border border-border rounded-lg font-semibold text-lg"
          min="0"
        />

        <button
          onClick={handleIncrement}
          className="w-10 h-10 bg-primary-pale text-primary rounded-lg font-bold text-xl hover:bg-primary-light hover:text-white transition"
        >
          +
        </button>
      </div>
    </div>
  );
}
```

## `src/components/BrandBLP.tsx` — wordmark
```tsx
type BrandBLPProps = {
  className?: string;
  compact?: boolean;
};

export default function BrandBLP({ className = "", compact = false }: BrandBLPProps) {
  return (
    <div className={`inline-flex items-baseline gap-1.5 ${className}`}>
      <span className="font-black tracking-[0.16em] leading-none">BLP</span>
      {!compact && (
        <span className="text-[0.48em] font-semibold tracking-[0.22em] opacity-85 leading-none">
          STOCK OPNAME
        </span>
      )}
    </div>
  );
}
```

## `src/components/LoadingSpinner.tsx`
```tsx
export default function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}
```

## `src/components/icons.tsx` — icon set
25 inline SVG stroke icons (24×24 viewBox, `stroke="currentColor"` width 2, round caps): MapPin, Camera, Search, Building, Plus, Scan (corner brackets + line), Logout, Check, Hourglass, Clock, X, Pencil, Trash, Refresh, User, Box, Clipboard, Calculator, Info, ChevronLeft/Down/Right, Swap, Zap, CheckSquare, Square. Full source: `src/components/icons.tsx`.

## Larger composed components (source at paths; not duplicated here)
- `src/components/Autocomplete.tsx` (245 lines) — generic debounced autocomplete: input + dropdown list, `resolve(query)`, `renderItem`, `getKey`, `onSelect`, `minChars`, `debounceMs`, `uppercase`, `emptyText`, `hint`, `error`; loading spinner + clear button.
- `src/components/ScannerModal.tsx` (68 lines) — scan dialog wrapping `BarcodeScanner` inside `Dialog` + manual barcode entry with `SearchIcon` submit.
- `src/components/BarcodeScanner.tsx` (393 lines) — html5-qrcode camera scanner, scan-success sound, torch/zap affordance.
- `src/components/EditModal.tsx` (378 lines) — edit history entry in `Dialog`: location Autocomplete, barcode scan/search field, product name Autocomplete, SKU + Batch (chip suggestions), wide `QtyInput` + formula note; footer Batal / Simpan Perubahan.
- `src/components/MoveSheet.tsx` (272 lines) — "Pindahkan Produk" sheet: destination Autocomplete (valid locations only), Semua/Pilih-produk segmented toggle, checkbox product list, footer Batal / Pindahkan.
- `src/components/AddHistoryEntryModal.tsx` (460 lines) — add entry form in `Dialog` (location, scan, product autocomplete, qty).
- `src/components/InstallPrompt.tsx` (167 lines) — PWA install banner with `BrandBLP`.
