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
    ? "border-l-4 border-l-[#DC2626] bg-red-50/15"
    : isEdited
    ? "border-l-4 border-l-[#D97706] bg-amber-50/15"
    : "border-l-4 border-l-[#16A34A] bg-white";

  const dotStatus = isZero
    ? "bg-[#DC2626]"
    : isEdited
    ? "bg-[#D97706]"
    : "bg-[#16A34A]";

  return (
    <article
      className={`${borderStatus} hover:bg-slate-50/80 transition-colors`}
      data-history-row={entry.rowId}
    >
      {/* Dense Main Row */}
      <div className="px-3 py-2 flex items-center justify-between gap-2 min-h-[58px]">
        {/* Left Side: Product Name (Wrapped) + Details */}
        <div className="min-w-0 flex-1 pr-1.5">
          {/* Line 1: Nama Produk Utama di Atas */}
          <h3 className="text-sm font-semibold text-[#0F172A] leading-tight break-words">
            {entry.productName}
          </h3>

          {/* Line 2: Status Dot + SKU + Model Chip Batch + Operator/Time + Formula/Delivery Badges */}
          <div className="flex items-center gap-1.5 mt-1 text-xs text-[#475569] leading-none flex-wrap">
            <span className={`w-2 h-2 rounded-full shrink-0 ${dotStatus}`} />
            <span className="font-mono text-xs text-[#475569] tabular-nums tnum">
              {entry.sku || "—"}
            </span>
            <span className="text-slate-300">•</span>
            <span className="h-5 px-1.5 rounded font-mono text-[11px] font-semibold bg-[#EAF2EB] border border-[#BDD7C4] text-[#2E5339] inline-flex items-center tnum">
              {entry.batch || "NO-BATCH"}
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-[11px] text-slate-500 truncate">
              {entry.operator?.split("@")[0]} · {formatDisplayTime(entry.timestamp)}
            </span>

            {entry.formula && (
              <span
                className="font-mono text-[10px] font-semibold bg-[#EAF2EB] border border-[#BDD7C4] text-[#2E5339] px-1 py-0.5 rounded tnum"
                data-formula={entry.formula}
              >
                ={entry.formula}
              </span>
            )}

            {isEdited && (
              <span className="font-mono text-[10px] font-semibold bg-amber-50 border border-amber-200 text-[#D97706] px-1 py-0.5 rounded">
                DIEDIT
              </span>
            )}

            <DeliveryBadge rowIds={[entry.rowId]} hideSynced />
          </div>
        </div>

        {/* Right Side: Compact Quantity Button + Edit + Delete */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={startEdit}
            disabled={busy}
            aria-label={`Edit kuantitas ${entry.qty} untuk ${entry.productName}`}
            title="Ketuk untuk ubah cepat kuantitas / rumus"
            className="h-8 px-2.5 bg-[#EAF2EB]/50 hover:bg-[#EAF2EB] active:bg-[#D6E8DC] border border-[#BDD7C4] rounded font-mono text-sm font-bold text-[#2E5339] tabular-nums tnum flex items-center gap-1 transition-colors"
          >
            <span>{entry.qty.toLocaleString("id-ID")}</span>
            <span className="font-sans text-[10px] font-medium text-slate-500">Pcs</span>
          </button>

          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            aria-label={`Edit detail ${entry.productName}`}
            title="Edit Detail / Pindah Rak"
            className="w-7 h-8 flex items-center justify-center rounded border border-slate-200 bg-white hover:bg-[#EAF2EB] hover:text-[#2E5339] text-slate-600 transition-colors"
          >
            <PencilIcon className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            aria-label={`Hapus ${entry.productName}`}
            title="Hapus Entri"
            className="w-7 h-8 flex items-center justify-center rounded border border-slate-200 bg-white hover:bg-red-50 text-slate-400 hover:text-[#DC2626] transition-colors"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Inline Quick Count / Formula Editor */}
      {editing && (
        <form
          onSubmit={submit}
          className="px-3 py-2 bg-[#EAF2EB]/40 border-t border-[#BDD7C4] space-y-2"
        >
          <div className="flex items-center justify-between text-xs">
            <label
              htmlFor={`count-${entry.rowId}`}
              className="font-semibold text-[#2E5339]"
            >
              Edit Jumlah / Rumus:
            </label>
            {result === null ? (
              <span className="text-[11px] font-semibold text-[#DC2626]" role="status">
                Format rumus belum lengkap
              </span>
            ) : (
              <span className="font-mono text-xs text-slate-700 tnum" aria-live="polite">
                Hasil: <strong className="text-[#2E5339]">{result.toLocaleString("id-ID")} Pcs</strong>
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
              className="flex-1 h-8 px-2.5 bg-white border border-slate-300 rounded font-mono text-sm font-bold text-slate-900 focus:outline-none focus:border-[#2E5339] tabular-nums tnum"
            />

            <div className="flex items-center gap-1">
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
                  className="w-7 h-8 bg-white hover:bg-[#EAF2EB] border border-slate-300 rounded font-mono text-sm font-bold text-[#2E5339] flex items-center justify-center"
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
              className="h-7 px-3 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={result === null || busy}
              className="h-7 px-3 bg-[#2E5339] hover:bg-[#3D6E4C] text-white rounded text-xs font-semibold disabled:opacity-40"
            >
              {busy ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
