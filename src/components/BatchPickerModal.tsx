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
  onSelectBatch: (batch: string) => void;
}

export default function BatchPickerModal({
  isOpen,
  onClose,
  productName,
  sku,
  currentBatch = "",
  batches,
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
    if (batches.length === 0) {
      setActiveTab("new");
    } else {
      setActiveTab("list");
    }
  }, [isOpen, batches.length, sku]);

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
      className="fixed inset-0 z-[80] bg-slate-900/50 flex items-end sm:items-center sm:p-3 justify-center animate-fadeIn"
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
        className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-sheet outline-none flex flex-col max-h-[85dvh] overflow-hidden animate-slideUp"
      >
        {/* Header Pop-up */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-base font-extrabold text-slate-900 tracking-wide uppercase leading-tight"
            >
              PILIH BATCH
            </h2>
            <p
              id={descId}
              className="text-xs text-slate-500 mt-0.5 font-medium break-words leading-snug"
            >
              {formattedSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-full hover:bg-slate-100 active:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
            aria-label="Tutup pilih batch"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3.5 overflow-y-auto flex-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {/* Tab Switcher: Batch Produk (N) vs + Buat Batch Baru */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("list")}
              className={`h-10 px-3 rounded-full text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                activeTab === "list"
                  ? "bg-[#0F172A] text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <span>Batch Produk ({batches.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("new")}
              className={`h-10 px-3 rounded-full text-xs font-bold transition flex items-center justify-center gap-1 ${
                activeTab === "new"
                  ? "bg-[#0F172A] text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Buat Batch Baru</span>
            </button>
          </div>

          {/* Tab 1: Daftar Chip Batch */}
          {activeTab === "list" ? (
            batches.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 max-h-[48dvh] overflow-y-auto pt-0.5">
                {batches.map((b) => {
                  const isSelected =
                    String(currentBatch || "").trim().toLowerCase() ===
                    String(b || "").trim().toLowerCase();
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => onSelectBatch(b)}
                      className={`min-h-[48px] px-2.5 py-2.5 rounded-xl border font-mono text-xs sm:text-sm font-bold tracking-wide text-center flex items-center justify-center break-all transition active:scale-95 touch-manipulation ${
                        isSelected
                          ? "bg-[#E6F3F4] border-[#0D5C63] text-[#0D5C63] ring-1 ring-[#0D5C63]"
                          : "bg-white border-slate-200 text-slate-900 hover:border-[#0D5C63] hover:bg-slate-50"
                      }`}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 px-3 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
                <p className="text-xs font-medium text-slate-600">
                  Belum ada daftar batch di Master Data untuk SKU{" "}
                  <strong className="font-mono text-slate-900">{cleanSku || "ini"}</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("new")}
                  className="h-8 px-3 bg-[#0D5C63] hover:bg-[#14727A] text-white rounded-lg text-xs font-semibold transition inline-flex items-center gap-1"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>Buat Batch Baru</span>
                </button>
              </div>
            )
          ) : (
            /* Tab 2: Buat Batch Baru */
            <div className="space-y-3 pt-1">
              <div>
                <label
                  htmlFor="new-batch-modal-input"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
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
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm font-bold text-slate-900 uppercase placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-[#0D5C63]"
                />
              </div>

              <button
                type="button"
                onClick={handleConfirmNewBatch}
                disabled={!newBatchInput.trim()}
                className="w-full h-10 bg-[#0D5C63] hover:bg-[#14727A] active:bg-[#083B40] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition"
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

