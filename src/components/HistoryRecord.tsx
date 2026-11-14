"use client";

import { useRef, useState } from "react";
import type { HistoryEntry } from "@/lib/types";
import { formatDisplayTime } from "@/lib/format";
import { calcExpr } from "./QtyInput";
import DeliveryBadge from "./DeliveryBadge";
import { PencilIcon, TrashIcon } from "./icons";

interface Props {
  entry: HistoryEntry;
  saving: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSaveCount: (quantity: number, formula: string) => Promise<boolean>;
}

export default function HistoryRecord({
  entry,
  saving,
  onEdit,
  onDelete,
  onSaveCount,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const result = calcExpr(raw);
  const busy = saving || submitting;

  const startEdit = () => {
    setRaw(entry.formula ? entry.formula.split("=")[0].trim() : String(entry.qty));
    setEditing(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (result === null || busy) return;
    setSubmitting(true);
    try {
      const formula = /[+\-*xX×/]/.test(raw)
        ? `${raw.replace(/\s+/g, "")}=${result}`
        : "";
      if (await onSaveCount(result, formula)) setEditing(false);
    } finally {
      setSubmitting(false);
    }
  };

  const isZero = Number(entry.qty) === 0;
  const isEdited = entry.edited === "Yes";

  const borderStatus = isZero
    ? "border-l-4 border-l-[#DC2626] bg-[#FEF2F2]/40"
    : isEdited
    ? "border-l-4 border-l-[#D97706] bg-[#FFFBEB]/45"
    : "border-l-4 border-l-[#16A34A] bg-white";

  const dotStatus = isZero
    ? "bg-[#DC2626]"
    : isEdited
    ? "bg-[#D97706]"
    : "bg-[#16A34A]";

  return (
    <article
      className={`${borderStatus} hover:bg-[#EEFBFB] transition-colors`}
      data-history-row={entry.rowId}
    >
      {/* Ultra-Compact 2-Tier HP Row */}
      <div className="px-3 py-2 space-y-1">
        {/* Line 1: Full Product Name + Qty Quick-Edit Pill */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-[#0D3B40] leading-snug line-clamp-2 break-words min-w-0 flex-1 pt-0.5">
            {entry.productName}
          </h3>

          <button
            type="button"
            onClick={startEdit}
            disabled={busy}
            aria-label={`Edit kuantitas ${entry.qty} untuk ${entry.productName}`}
            title="Ketuk untuk ubah cepat kuantitas / rumus"
            className="h-7 px-2.5 shrink-0 bg-[#D5F4F3]/90 hover:bg-[#C2ECEB] active:scale-[0.98] border border-[#7CD4D3]/85 rounded-lg font-mono text-xs font-bold text-[#0B666E] tabular-nums tnum inline-flex items-center gap-1 transition-all"
          >
            <span>{entry.qty.toLocaleString("id-ID")}</span>
            <span className="font-sans text-[10px] font-medium text-[#487277]">Pcs</span>
          </button>
        </div>

        {/* Line 2: Dot + SKU + Batch + Operator · Time (Left) + Edit/Delete (Right) */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 min-w-0 flex-1 text-[11px] text-[#487277] leading-none overflow-hidden">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotStatus}`} />
            <span className="font-mono text-[11px] text-[#487277] shrink-0 tabular-nums tnum">
              {entry.sku || "—"}
            </span>
            <span className="text-[#487277]/45 shrink-0">•</span>
            <span className="h-[18px] px-1.5 rounded font-mono text-[10px] font-semibold bg-[#D5F4F3] border border-[#82D6D5]/75 text-[#0B666E] inline-flex items-center shrink-0 max-w-[92px] truncate tnum">
              {entry.batch || "NO-BATCH"}
            </span>
            <span className="text-[#487277]/45 shrink-0">•</span>
            <span className="text-[11px] text-[#487277] truncate min-w-0">
              {entry.operator?.split("@")[0]} · {formatDisplayTime(entry.timestamp)}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
              aria-label={`Edit detail ${entry.productName}`}
              title="Edit Detail / Pindah Rak"
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-[#9CE0DF]/80 bg-white hover:bg-[#D5F4F3] hover:text-[#0B666E] text-[#487277] active:scale-[0.96] transition-all"
            >
              <PencilIcon className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              aria-label={`Hapus ${entry.productName}`}
              title="Hapus Entri"
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-[#9CE0DF]/80 bg-white hover:bg-[#FEF2F2] text-[#487277] hover:text-[#DC2626] active:scale-[0.96] transition-all"
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Line 3 (Only when formula / edited / pending delivery exists) */}
        {(entry.formula || isEdited) ? (
          <div className="flex items-center gap-1 flex-wrap pt-0.5">
            {entry.formula && (
              <span
                className="font-mono text-[10px] font-semibold bg-[#D5F4F3] border border-[#82D6D5]/75 text-[#0B666E] px-1.5 py-0.5 rounded-md tnum"
                data-formula={entry.formula}
              >
                ={entry.formula}
              </span>
            )}
            {isEdited && (
              <span className="font-mono text-[10px] font-semibold bg-[#FFFBEB] border border-[#F59E0B]/30 text-[#B45309] px-1.5 py-0.5 rounded-md">
                DIEDIT
              </span>
            )}
            <DeliveryBadge rowIds={[entry.rowId]} hideSynced />
          </div>
        ) : (
          <DeliveryBadge rowIds={[entry.rowId]} hideSynced />
        )}
      </div>

      {/* Inline Quick Count / Formula Editor */}
      {editing && (
        <form
          onSubmit={submit}
          className="px-3 py-2.5 bg-[#EEFBFB] border-t border-[#9BE0DF]/55 space-y-2"
        >
          <div className="flex items-center justify-between text-[11px]">
            <label
              htmlFor={`count-${entry.rowId}`}
              className="font-semibold text-[#0B666E]"
            >
              Edit Jumlah / Rumus:
            </label>
            {result === null ? (
              <span className="text-[11px] font-semibold text-[#DC2626]" role="status">
                Format rumus belum lengkap
              </span>
            ) : (
              <span className="font-mono text-[11px] text-[#0D3B40] tnum" aria-live="polite">
                Hasil: <strong className="text-[#0B666E]">{result.toLocaleString("id-ID")} Pcs</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              id={`count-${entry.rowId}`}
              type="text"
              inputMode="decimal"
              autoFocus
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              autoComplete="off"
              aria-label={`Kuantitas baru untuk ${entry.productName}`}
              disabled={busy}
              onKeyDown={(event) => {
                if (event.key === "Escape") setEditing(false);
              }}
              className="flex-1 min-w-0 h-9 px-2.5 bg-white border border-[#9CE0DF]/85 rounded-xl font-mono text-[13px] font-semibold text-[#0D3B40] focus:outline-none focus:border-[#0E838C] focus:ring-2 focus:ring-[#14B8A6]/20 tabular-nums tnum"
            />

            <div className="flex items-center gap-1 shrink-0">
              {[
                ["+", "Tambah"],
                ["-", "Kurangi"],
                ["×", "Kalikan"],
                ["/", "Bagi"],
              ].map(([operator, label]) => (
                <button
                  key={operator}
                  type="button"
                  aria-label={label}
                  disabled={busy}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setRaw((value) =>
                      /[+\-*xX×/]$/.test(value.trim())
                        ? value.trim().slice(0, -1) + operator
                        : value + operator
                    );
                    inputRef.current?.focus();
                  }}
                  className="w-9 h-9 bg-[#D5F4F3]/70 hover:bg-[#C2ECEB] border border-[#82D6D5]/75 rounded-lg font-mono text-sm font-bold text-[#0B666E] flex items-center justify-center active:scale-[0.96] transition-transform"
                >
                  {operator === "/" ? "÷" : operator === "-" ? "−" : operator}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={busy}
              className="h-9 px-3.5 bg-white border border-[#9CE0DF]/80 rounded-xl text-[11px] font-semibold text-[#487277] hover:text-[#0D3B40] active:scale-[0.98] transition-all"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={result === null || busy}
              className="h-9 px-3.5 bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white rounded-xl text-[11px] font-semibold shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)] active:scale-[0.98] transition-all disabled:opacity-40"
            >
              {busy ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
