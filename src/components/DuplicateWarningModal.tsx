"use client";

import { Dialog } from "@/components/ui";
import { formatDisplayTime } from "@/lib/format";
import type { DuplicateMatch } from "@/lib/duplicates";
import { InfoIcon } from "@/components/icons";

interface Props {
  isOpen: boolean;
  location: string;
  duplicates: DuplicateMatch[];
  onConfirmOverwrite: () => void;
  onConfirmAppend: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export default function DuplicateWarningModal({
  isOpen,
  location,
  duplicates,
  onConfirmOverwrite,
  onConfirmAppend,
  onCancel,
  busy = false,
}: Props) {
  if (!isOpen) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={busy ? () => {} : onCancel}
      title="Peringatan Duplikasi Input"
      description={`Ditemukan ${duplicates.length} produk di lokasi ${location} yang sudah pernah diinput hari ini. Pilih tindakan untuk mencegah data ganda.`}
      size="md"
      footer={
        <div className="flex flex-col gap-2 pt-1 w-full">
          <button
            type="button"
            onClick={onConfirmOverwrite}
            disabled={busy}
            className="w-full min-h-touch px-4 bg-primary text-ivory font-bold text-sm rounded-input shadow-xs active:scale-[0.99] disabled:opacity-50 transition"
          >
            {busy ? "Memproses…" : "Timpa / Perbarui Nilai (Rekomendasi)"}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="flex-1 min-h-touch px-3 bg-surface-warm text-text-primary font-bold text-xs rounded-input border border-border disabled:opacity-50 active:scale-[0.98] transition"
            >
              Batal & Periksa
            </button>
            <button
              type="button"
              onClick={onConfirmAppend}
              disabled={busy}
              className="flex-1 min-h-touch px-3 bg-paper text-text-secondary font-bold text-xs rounded-input border border-border hover:text-text-primary disabled:opacity-50 active:scale-[0.98] transition"
            >
              Tetap Tambah Baru
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
        <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-amber-bg/70 border border-amber-text/30 text-amber-text text-xs leading-relaxed">
          <InfoIcon className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Memilih <strong>&quot;Timpa&quot;</strong> akan memperbarui kuantitas entri sebelumnya dan mencegah baris ganda di laporan Google Sheets.
          </p>
        </div>

        <div className="space-y-2">
          {duplicates.map((dup, idx) => (
            <div
              key={`${dup.item.sku}__${dup.item.batch}__${idx}`}
              className="p-2.5 rounded-xl border border-border bg-surface-warm/60 space-y-1.5"
            >
              <div className="flex justify-between items-start gap-2">
                <span className="font-bold text-text-primary text-xs leading-snug">
                  {dup.item.productName}
                </span>
                {dup.existing.isPending && (
                  <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-warning text-warning-text border border-warning-text/20">
                    Di antrean
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-secondary font-mono">
                <span>SKU: {dup.item.sku}</span>
                <span>Batch: {dup.item.batch || "Tanpa batch"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/60 text-xs">
                <div>
                  <span className="block text-[10px] text-text-secondary uppercase tracking-wider font-semibold">
                    Sebelumnya ({formatDisplayTime(dup.existing.timestamp)})
                  </span>
                  <span className="font-bold text-text-primary tnum">
                    {dup.existing.qty.toLocaleString("id-ID")} pcs
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-text-secondary uppercase tracking-wider font-semibold">
                    Input Sekarang
                  </span>
                  <span className="font-bold text-primary tnum">
                    {dup.item.qty.toLocaleString("id-ID")} pcs
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
