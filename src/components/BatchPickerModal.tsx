"use client";

import { useState, useEffect, useRef, useId } from "react";
import { XIcon, PlusIcon, CheckIcon } from "@/components/icons";
import toast from "react-hot-toast";

interface BatchPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  sku: string;
  currentBatch?: string;
  batches: string[];
  /** True bila di Master Data terdapat entri SKU ini tanpa nomor batch. */
  allowEmptyBatch?: boolean;
  onSelectBatch: (batch: string) => void;
}

export default function BatchPickerModal({
  isOpen,
  onClose,
  productName,
  sku,
  currentBatch = "",
  batches,
  allowEmptyBatch = false,
  onSelectBatch,
}: BatchPickerModalProps) {
  const [activeTab, setActiveTab] = useState<"list" | "new">("list");
  const [newBatchInput, setNewBatchInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!isOpen) return;
    setNewBatchInput("");
    if (batches.length === 0 && !allowEmptyBatch) {
      setActiveTab("new");
    } else {
      setActiveTab("list");
    }
  }, [isOpen, batches.length, allowEmptyBatch, sku]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === "new") {
      const t = setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
      return () => clearTimeout(t);
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const cleanProductName = String(productName || "").trim();
  const cleanSku = String(sku || "").trim();
  const formattedSubtitle = cleanProductName.startsWith(`[${cleanSku}]`)
    ? `${cleanProductName} · ${cleanSku}`
    : cleanSku
      ? `[${cleanSku}] ${cleanProductName} · ${cleanSku}`
      : cleanProductName;

  const handleConfirmNewBatch = () => {
    const val = newBatchInput.trim().toUpperCase();
    if (!val) {
      toast.error("Masukkan nomor batch terlebih dahulu");
      inputRef.current?.focus();
      return;
    }
    onSelectBatch(val);
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-[#0B393E]/45 flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-sm rounded-2xl border border-[#8ADBD9]/80 shadow-[0_14px_40px_-8px_rgba(14,131,140,0.24)] outline-none flex flex-col max-h-[85dvh] overflow-hidden animate-fadeIn"
      >
        {/* Header Pop-up (Tetap muncul di tengah layar sesuai preferensi operator) */}
        <div className="px-3.5 pt-2.5 pb-2 bg-gradient-to-r from-[#DCF6F5] to-[#EEFBFB] border-b border-[#BCEBEB]/80 flex items-start justify-between gap-2 shrink-0">
          <div className="min-w-0 pt-0.5">
            <h2
              id={titleId}
              className="text-sm font-extrabold text-[#0D3B40] tracking-wide uppercase leading-tight"
            >
              PILIH BATCH
            </h2>
            <p
              id={descId}
              className="text-[11px] text-[#487277] mt-0.5 font-medium break-words leading-snug"
            >
              {formattedSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-9 h-9 -mr-1 -mt-0.5 rounded-full bg-white/90 border border-[#9CE0DF]/60 hover:bg-white active:scale-[0.96] flex items-center justify-center text-[#487277] hover:text-[#0D3B40] transition"
            aria-label="Tutup pilih batch"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-3 space-y-2.5 overflow-y-auto flex-1">
          {/* Tab Switcher: Batch Produk (N) vs + Buat Batch Baru */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab("list")}
              className={`h-9 px-2.5 rounded-full text-[11px] font-bold transition active:scale-[0.98] flex items-center justify-center gap-1 ${activeTab === "list"
                  ? "bg-gradient-to-r from-[#0E838C] to-[#14B8A6] text-white shadow-subtle"
                  : "bg-[#E5F7F7] text-[#487277] border border-[#9CE0DF]/60 hover:text-[#0D3B40]"
                }`}
            >
              <span>Batch Produk ({batches.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("new")}
              className={`h-9 px-2.5 rounded-full text-[11px] font-bold transition active:scale-[0.98] flex items-center justify-center gap-1 ${activeTab === "new"
                  ? "bg-gradient-to-r from-[#0E838C] to-[#14B8A6] text-white shadow-subtle"
                  : "bg-[#E5F7F7] text-[#487277] border border-[#9CE0DF]/60 hover:text-[#0D3B40]"
                }`}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Buat Batch Baru</span>
            </button>
          </div>

          {/* Tab 1: Daftar Chip Batch */}
          {activeTab === "list" ? (
            <div className="space-y-2 pt-0.5">
              {allowEmptyBatch && (
                <button
                  type="button"
                  onClick={() => onSelectBatch("")}
                  className={`w-full min-h-[42px] px-3 py-2 rounded-xl border text-left flex items-center justify-between gap-2 transition-colors active:scale-[0.98] touch-manipulation ${
                    !String(currentBatch || "").trim()
                      ? "bg-[#D5F4F3] border-[#0E838C] text-[#0B666E] ring-1 ring-[#0E838C]"
                      : "bg-[#EFFAFA] border-[#8ADBD9] text-[#0D3B40] hover:bg-[#D5F4F3]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-tight">Tanpa Batch</p>
                    <p className="text-[10px] text-[#487277] mt-0.5">
                      Sesuai Master Data (tanpa nomor batch)
                    </p>
                  </div>
                  <CheckIcon className="w-4 h-4 shrink-0 text-[#0E838C]" />
                </button>
              )}

              {batches.length > 0 ? (
                <div className="grid grid-cols-3 gap-1.5 max-h-[42dvh] overflow-y-auto">
                  {batches.map((b) => {
                    const isSelected =
                      String(currentBatch || "").trim().toLowerCase() ===
                      String(b || "").trim().toLowerCase();
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => onSelectBatch(b)}
                        className={`min-h-[40px] px-2 py-2 rounded-xl border font-mono text-[11px] font-bold tracking-wide text-center flex items-center justify-center break-all transition-colors active:scale-[0.97] touch-manipulation ${
                          isSelected
                            ? "bg-[#D5F4F3] border-[#0E838C] text-[#0B666E] ring-1 ring-[#0E838C]"
                            : "bg-white border-[#9CE0DF]/75 text-[#0D3B40] hover:border-[#0E838C] hover:bg-[#EEFBFB]"
                        }`}
                      >
                        {b}
                      </button>
                    );
                  })}
                </div>
              ) : allowEmptyBatch ? (
                <p className="text-[11px] text-[#487277] text-center py-1">
                  Produk ini terdaftar tanpa batch di Master Data. Ketuk{" "}
                  <strong className="text-[#0D3B40]">Tanpa Batch</strong> di atas untuk melanjutkan.
                </p>
              ) : (
                <div className="py-4 px-3 text-center bg-[#EFFAFA] rounded-xl border border-dashed border-[#8ADBD9] space-y-2">
                  <p className="text-[11px] font-medium text-[#487277] leading-relaxed">
                    Belum ada daftar batch di Master Data untuk SKU{" "}
                    <strong className="font-mono text-[#0D3B40]">{cleanSku || "ini"}</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("new")}
                    className="h-9 px-3.5 bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] active:scale-[0.98] text-white rounded-xl text-[11px] font-semibold transition-transform inline-flex items-center gap-1.5"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    <span>Buat Batch Baru</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Tab 2: Buat Batch Baru */
            <div className="space-y-2.5 pt-0.5">
              <div>
                <label
                  htmlFor="new-batch-modal-input"
                  className="block text-[11px] font-bold uppercase tracking-wider text-[#487277] mb-1"
                >
                  Nomor Batch Baru
                </label>
                <input
                  ref={inputRef}
                  id="new-batch-modal-input"
                  type="text"
                  value={newBatchInput}
                  onChange={(e) => setNewBatchInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleConfirmNewBatch();
                    }
                  }}
                  placeholder="Ketik nomor batch fisik (mis. CAG0701)…"
                  autoComplete="off"
                  className="w-full h-10 px-3 bg-[#EEFBFB] border border-[#9CE0DF]/80 rounded-xl font-mono text-[13px] font-bold text-[#0D3B40] uppercase placeholder:font-sans placeholder:font-normal placeholder:text-[#6B9498] focus:bg-white focus:outline-none focus:border-[#0E838C]"
                />
              </div>

              <button
                type="button"
                onClick={handleConfirmNewBatch}
                disabled={!newBatchInput.trim()}
                className="w-full h-10 bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] active:scale-[0.98] disabled:from-[#D5EDED] disabled:to-[#D5EDED] disabled:text-[#5B8E92] text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition shadow-subtle"
              >
                <CheckIcon className="w-4 h-4" />
                <span>Pakai Batch Ini &amp; Lanjut Input Qty</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

