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
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 min-w-max min-h-[44px] px-4 bg-[#EEFBFB] border border-[#9CE0DF]/80 hover:bg-[#D5F4F3] text-[#0D3B40] text-sm font-semibold whitespace-nowrap rounded-xl transition-all duration-150 active:scale-[0.98] disabled:opacity-[.55] disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 min-w-max min-h-[44px] px-4 text-white text-sm font-semibold whitespace-nowrap rounded-xl transition-all duration-150 active:scale-[0.98] disabled:opacity-[.55] disabled:cursor-not-allowed ${
              isDanger
                ? "bg-[#DC2626] hover:bg-[#B91C1C] shadow-subtle"
                : "bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)]"
            }`}
          >
            {busy ? "Memproses…" : confirmText}
          </button>
        </div>
      }
    />
  );
}
