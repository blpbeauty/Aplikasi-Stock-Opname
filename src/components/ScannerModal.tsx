"use client";

/**
 * Modal pemindai barcode bersama — membungkus BarcodeScanner dengan
 * judul, tombol tutup yang jelas, dan input manual sebagai fallback
 * bila kamera gagal/tidak tersedia.
 */

import { useState } from "react";
import BarcodeScanner from "@/components/BarcodeScanner";
import { Dialog } from "@/components/ui";
import { SearchIcon } from "@/components/icons";

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  title: string;
}

export default function ScannerModal({
  isOpen,
  onClose,
  onScan,
  title,
}: ScannerModalProps) {
  const [manualCode, setManualCode] = useState("");

  const submitManual = () => {
    const code = manualCode.trim();
    if (!code) return;
    setManualCode("");
    onClose();
    onScan(code);
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={title} description="Arahkan kamera ke barcode atau QR">
      <div className="space-y-3">
        <BarcodeScanner onScan={onScan} active={isOpen} />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitManual();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Kamera bermasalah? Ketik kode manual…"
            aria-label="Masukkan kode secara manual"
            className="flex-1 min-h-touch px-3 bg-surface-warm border border-border rounded-input text-meta font-semibold text-text-primary"
          />
          <button
            type="submit"
            disabled={!manualCode.trim()}
            className="px-4 min-h-touch bg-primary text-ivory rounded-input text-meta font-bold disabled:opacity-40 flex items-center gap-1.5"
          >
            <SearchIcon className="w-4 h-4" /> OK
          </button>
        </form>
      </div>
    </Dialog>
  );
}
