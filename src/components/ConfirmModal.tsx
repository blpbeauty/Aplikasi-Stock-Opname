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
            className="flex-1 min-h-touch px-4 bg-surface-warm text-text-primary text-meta font-bold rounded-input transition active:scale-[0.98] disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 min-h-touch px-4 text-ivory text-meta font-bold rounded-input transition active:scale-[0.98] disabled:opacity-50 ${
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
