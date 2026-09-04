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
      ? "bg-success-bg text-success border-success/30"
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
            tone === "ok" ? "bg-success" : tone === "busy" ? "bg-info" : "bg-text-secondary"
          }`}
        />
      )}
      <span>{label}</span>
    </button>
  );
}
