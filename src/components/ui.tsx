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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      // Jangan rebut fokus jika user atau browser sudah memfokuskan elemen di dalam dialog
      if (panel.contains(document.activeElement)) return;
      const autoFocusEl = panel.querySelector<HTMLElement>("[autofocus]");
      if (autoFocusEl) {
        autoFocusEl.focus();
        return;
      }
      const firstInput = panel.querySelector<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
      );
      if (firstInput) {
        firstInput.focus();
        return;
      }
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first || panel).focus();
    };
    const t = setTimeout(focusFirst, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
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
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[70] bg-[#0B393E]/40 backdrop-blur-[2px] flex ${
        size === "sm" ? "items-center p-4" : "items-end"
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
        className={`bg-white w-full ${size === "sm" ? "max-w-sm rounded-2xl shadow-[0_14px_38px_-8px_rgba(14,131,140,0.22)]" : "max-w-md rounded-t-2xl border-b-0 shadow-sheet"} border border-[#8ADBD9]/80 outline-none flex flex-col max-h-[90dvh] overflow-hidden animate-slideUp`}
      >
        {/* Drag Handle (Bottom Sheet Mobile) */}
        {size !== "sm" && (
          <div className="pt-2 pb-0.5 bg-[#DCF6F5]/80 flex justify-center shrink-0">
            <span aria-hidden="true" className="w-10 h-1 rounded-full bg-[#8ADBD9]" />
          </div>
        )}

        {/* Soft Aqua Pastel Header */}
        <div className={`px-4 ${size === "sm" ? "pt-3.5 pb-2.5" : "pt-2 pb-2.5"} bg-gradient-to-r from-[#DCF6F5] to-[#EEFBFB] border-b border-[#BCEBEB]/80 flex items-start justify-between gap-2 shrink-0`}>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id={titleId} className="text-[15px] font-bold text-[#0D3B40] leading-snug break-words">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-xs text-[#487277] mt-0.5 leading-relaxed break-words">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-11 h-11 -mr-1.5 -mt-1 rounded-full bg-white/90 border border-[#9CE0DF]/60 hover:bg-white flex items-center justify-center text-[#487277] hover:text-[#0D3B40] transition active:scale-[0.96]"
            aria-label="Tutup dialog"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {children && (
          <div className={`px-4 py-3 overflow-y-auto flex-1 ${footer ? "" : "pb-[max(1.25rem,env(safe-area-inset-bottom))]"}`}>
            {children}
          </div>
        )}

        {footer && (
          <div className="px-4 py-3 bg-[#EFFAFA] border-t border-[#BCEBEB]/80 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0">
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
  const sizeCls = size === "lg" ? "w-12 h-12" : "w-11 h-11";
  const variantCls =
    variant === "primary"
      ? "bg-gradient-to-br from-[#0E838C] to-[#14B8A6] text-white hover:from-[#0B6F77] hover:to-[#0D9488]"
      : variant === "danger"
      ? "bg-[#FEF2F2] text-[#DC2626] border border-red-200/70 hover:bg-red-100"
      : "bg-[#E5F7F7] text-[#0D3B40] border border-[#9CE0DF]/70 hover:bg-[#D5F4F3]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={label}
      className={`${sizeCls} ${variantCls} rounded-xl flex items-center justify-center transition active:scale-[0.98] disabled:opacity-50 ${className}`}
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
    <header className="sticky top-0 z-30 min-h-[52px] bg-gradient-to-r from-[#D5F4F3]/95 via-[#E4F8F8]/95 to-[#EEFAFA]/95 backdrop-blur-md text-[#0D3B40] px-3 py-1.5 border-b border-[#8ADBD9]/65 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="w-11 h-11 -ml-1.5 rounded-xl bg-white/75 hover:bg-white flex items-center justify-center text-[#0D3B40] transition active:scale-[0.97] shrink-0"
            aria-label={backLabel}
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <h1 className="text-[15px] font-bold text-[#0D3B40] leading-tight truncate">{title}</h1>
          {subtitle && (
            <div className="text-xs text-[#487277] truncate">{subtitle}</div>
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
    <div className="bg-white rounded-2xl border border-[#9BE0DF]/70 shadow-subtle px-5 py-7 text-center">
      {icon && (
        <div className="w-11 h-11 rounded-xl bg-[#D5F4F3] text-[#0E838C] mx-auto flex items-center justify-center mb-2.5">
          {icon}
        </div>
      )}
      <p className="text-sm font-bold text-[#0D3B40]">{title}</p>
      {description && (
        <p className="text-xs text-[#487277] mt-1 max-w-xs mx-auto leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-3.5 flex justify-center">{action}</div>}
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
      <label htmlFor={id} className="block text-xs font-semibold text-[#0D3B40] mb-1">
        {label}
        {required && (
          <span className="text-[#DC2626] ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-[#487277] mt-1 leading-snug">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-semibold text-[#DC2626] mt-1 leading-snug">
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
      ? "bg-emerald-50 text-[#16A34A] border-emerald-200/80"
      : tone === "warn"
      ? "bg-amber-50 text-[#B45309] border-amber-200/80"
      : tone === "busy"
      ? "bg-[#D8F5F4] text-[#0B666E] border-[#82D6D5]"
      : "bg-[#EEFBFB] text-[#487277] border-[#9CE0DF]/70";

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
      className={`min-h-[44px] px-3 inline-flex items-center gap-1.5 rounded-xl border ${toneCls} text-xs font-semibold transition active:scale-[0.98]`}
    >
      {syncing ? (
        <RefreshIcon className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <span
          aria-hidden="true"
          className={`w-2 h-2 rounded-full ${
            tone === "ok"
              ? "bg-[#16A34A]"
              : tone === "warn"
              ? "bg-[#D97706]"
              : "bg-[#0E838C]"
          }`}
        />
      )}
      <span>{label}</span>
    </button>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-[#9BE0DF]/70 shadow-subtle divide-y divide-[#E5F7F7] overflow-hidden animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-3.5 py-3 flex items-center justify-between gap-3">
          <div className="flex-1 space-y-2 min-w-0">
            <div className="h-4 bg-[#D8F3F2] rounded-lg w-3/4" />
            <div className="flex items-center gap-2">
              <div className="h-3.5 bg-[#E8F8F8] rounded-md w-16" />
              <div className="h-5 bg-[#CCF2F1] rounded-lg w-20" />
            </div>
          </div>
          <div className="h-11 w-20 bg-[#E8F8F8] rounded-xl shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="max-w-md mx-auto min-h-dvh bg-gradient-to-b from-[#D7F4F4] via-[#ECF9F9] to-[#F4FCFC] flex flex-col">
      <div className="bg-[#DDF5F5] border-b border-[#8ADBD9]/65 px-3.5 py-3 space-y-2.5 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-7 w-32 bg-[#BCEBEB] rounded-xl" />
          <div className="flex gap-2">
            <div className="h-9 w-20 bg-[#CCF2F1] rounded-xl" />
            <div className="h-9 w-9 bg-[#CCF2F1] rounded-xl" />
          </div>
        </div>
        <div className="h-10 w-full bg-[#0E838C]/20 rounded-xl" />
        <div className="h-11 w-full bg-white/80 rounded-xl" />
      </div>
      <div className="p-3 space-y-3">
        <ListSkeleton rows={6} />
      </div>
    </div>
  );
}
