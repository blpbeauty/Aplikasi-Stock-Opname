"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useDataSync } from "@/components/DataSyncProvider";
import { XIcon, RefreshIcon, ChevronLeftIcon } from "@/components/icons";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
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
      className={`fixed inset-0 z-[70] bg-slate-900/50 flex ${
        size === "sm" ? "items-center p-3" : "items-end sm:items-center sm:p-3"
      } justify-center animate-fadeIn`}
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
        className={`bg-white w-full ${size === "sm" ? "max-w-sm" : "max-w-md"} ${
          size === "sm"
            ? "rounded-md"
            : "rounded-t-md sm:rounded-md border-b-0 sm:border-b"
        } border border-slate-300 shadow-sheet outline-none flex flex-col max-h-[90dvh] overflow-hidden animate-slideUp`}
      >
        {/* Compact Teal Header Strip */}
        <div className="px-3.5 py-2.5 bg-[#0D5C63] text-white border-b border-[#083B40] flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-bold text-white leading-tight truncate">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-xs text-[#D0EBED] mt-0.5 truncate">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-7 h-7 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition"
            aria-label="Tutup dialog"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {children && (
          <div className={`px-3.5 py-3 overflow-y-auto flex-1 ${footer ? "" : "pb-6"}`}>
            {children}
          </div>
        )}

        {footer && (
          <div className="px-3.5 py-2.5 bg-slate-50 border-t border-slate-200 pb-[max(0.625rem,env(safe-area-inset-bottom))] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

interface IconButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  variant?: "neutral" | "primary" | "danger";
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
  const sizeCls = size === "lg" ? "w-10 h-10" : "w-9 h-9";
  const variantCls =
    variant === "primary"
      ? "bg-[#0D5C63] text-white hover:bg-[#14727A]"
      : variant === "danger"
      ? "bg-red-50 text-[#DC2626] border border-red-200 hover:bg-red-100"
      : "bg-slate-100 text-slate-800 border border-slate-300 hover:bg-slate-200";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={label}
      className={`${sizeCls} ${variantCls} rounded flex items-center justify-center transition disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

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
    <header className="sticky top-0 z-30 h-11 min-h-[44px] bg-[#0D5C63] text-white px-3 border-b border-[#083B40] flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition shrink-0"
            aria-label={backLabel}
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
        )}
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <h1 className="text-sm font-bold text-white leading-tight truncate">{title}</h1>
          {subtitle && (
            <div className="text-xs text-[#D0EBED] truncate">{subtitle}</div>
          )}
        </div>
      </div>
      {right}
    </header>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="bg-white rounded border border-slate-200 px-4 py-8 text-center">
      {icon && (
        <div className="w-9 h-9 rounded bg-[#E6F3F4] text-[#0D5C63] mx-auto flex items-center justify-center mb-2">
          {icon}
        </div>
      )}
      <p className="text-sm font-bold text-slate-900">{title}</p>
      {description && (
        <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">{description}</p>
      )}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

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
      <label htmlFor={id} className="block text-xs font-semibold text-slate-700 mb-1">
        {label}
        {required && (
          <span className="text-[#DC2626] ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[11px] font-semibold text-[#DC2626] mt-0.5">
          {error}
        </p>
      )}
    </div>
  );
}

export function LocationBand({ code, sub }: { code: string; sub?: ReactNode }) {
  return (
    <div className="location-band" aria-label={`Lokasi aktif: ${code}`}>
      <p className="location-band-code">{code}</p>
      {sub && <p className="location-band-sub mt-0.5">{sub}</p>}
    </div>
  );
}

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
    label = "Sinkron…";
    tone = "busy";
  } else if (failed && !online) {
    label = "Offline";
    tone = "warn";
  } else if (failed) {
    label = "Gagal";
    tone = "warn";
  } else if (lastSyncTime) {
    label = "Tersimpan";
    tone = "ok";
  } else {
    label = "Belum sinkron";
    tone = "neutral";
  }

  const toneCls =
    tone === "ok"
      ? "bg-emerald-50 text-[#16A34A] border-emerald-200"
      : tone === "warn"
      ? "bg-amber-50 text-[#D97706] border-amber-200"
      : tone === "busy"
      ? "bg-[#E6F3F4] text-[#0D5C63] border-[#A8D3D6]"
      : "bg-slate-100 text-slate-600 border-slate-200";

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
      className={`h-7 px-2 inline-flex items-center gap-1 rounded border ${toneCls} text-[11px] font-semibold transition`}
    >
      {syncing ? (
        <RefreshIcon className="w-3 h-3 animate-spin" />
      ) : (
        <span
          aria-hidden="true"
          className={`w-1.5 h-1.5 rounded-full ${
            tone === "ok"
              ? "bg-[#16A34A]"
              : tone === "warn"
              ? "bg-[#D97706]"
              : "bg-[#0D5C63]"
          }`}
        />
      )}
      <span>{label}</span>
    </button>
  );
}
