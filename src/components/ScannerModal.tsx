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
            className="flex-1 min-h-[44px] px-3.5 bg-[#EEFBFB] border border-[#9CE0DF]/80 rounded-xl text-sm font-medium text-[#0D3B40] placeholder:text-[#6B9498] focus:bg-white focus:outline-none focus:border-[#0E838C] focus:ring-2 focus:ring-[#14B8A6]/20"
          />
          <button
            type="submit"
            disabled={!manualCode.trim()}
            className="px-4 min-h-[44px] bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white rounded-xl text-xs font-semibold shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)] disabled:opacity-40 active:scale-[0.98] transition-all flex items-center gap-1.5"
          >
            <SearchIcon className="w-4 h-4" /> OK
          </button>
        </form>
      </div>
    </Dialog>
  );
}
