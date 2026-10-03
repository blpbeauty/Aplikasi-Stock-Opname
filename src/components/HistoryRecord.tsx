"use client";

import { useRef, useState } from "react";
import type { HistoryEntry } from "@/lib/types";
import { formatDisplayTime } from "@/lib/format";
import { calcExpr } from "./QtyInput";
import FormulaBreakdown from "./FormulaBreakdown";
import DeliveryBadge from "./DeliveryBadge";
import { PencilIcon, TrashIcon } from "./icons";

interface Props {
  entry: HistoryEntry;
  saving: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSaveCount: (quantity: number, formula: string) => Promise<boolean>;
}

export default function HistoryRecord({ entry, saving, onEdit, onDelete, onSaveCount }: Props) {
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
      const formula = /[+\-*xX×/]/.test(raw) ? `${raw.replace(/\s+/g, "")}=${result}` : "";
      if (await onSaveCount(result, formula)) setEditing(false);
    } finally { setSubmitting(false); }
  };

  return (
    <article className="history-record" data-history-row={entry.rowId}>
      <div className="history-record-top">
        <h3>{entry.productName}</h3>
        <button type="button" className="history-quantity" onClick={startEdit} disabled={busy}
          aria-label={`Edit kuantitas ${entry.qty} untuk ${entry.productName}`}>
          <span className="history-quantity-number">{entry.qty.toLocaleString("id-ID")}</span>
          <span className="history-quantity-unit">pcs <PencilIcon className="w-3 h-3" /></span>
        </button>
      </div>

      <dl className="history-product-codes">
        <div><dt>SKU</dt><dd>{entry.sku || "—"}</dd></div>
        <div><dt>Batch</dt><dd>{entry.batch || "Tanpa batch"}</dd></div>
      </dl>
      <DeliveryBadge rowIds={[entry.rowId]} hideSynced />

      {editing ? (
        <form className="history-count-editor" onSubmit={submit}>
          <label htmlFor={`count-${entry.rowId}`}>Edit jumlah atau rumus</label>
          <input ref={inputRef} id={`count-${entry.rowId}`} type="text" inputMode="decimal" autoFocus
            value={raw} onChange={event => setRaw(event.target.value)} autoComplete="off"
            aria-label={`Kuantitas baru untuk ${entry.productName}`} disabled={busy}
            onKeyDown={event => { if (event.key === "Escape") setEditing(false); }} />
          <div className="history-operator-buttons">
            {[["+", "Tambah"], ["-", "Kurangi"], ["×", "Kalikan"], ["/", "Bagi"]].map(([operator, label]) => (
              <button key={operator} type="button" aria-label={label} disabled={busy}
                onMouseDown={event => event.preventDefault()} onClick={() => {
                  setRaw(value => /[+\-*xX×/]$/.test(value.trim()) ? value.trim().slice(0, -1) + operator : value + operator);
                  inputRef.current?.focus();
                }}>{operator === "/" ? "÷" : operator === "-" ? "−" : operator}</button>
            ))}
          </div>
          {result === null ? <p className="text-meta text-danger" role="status">Lengkapi angka dan rumus terlebih dahulu.</p> :
            <p className="history-count-preview" aria-live="polite">Hasil hitung <strong>{result.toLocaleString("id-ID")} pcs</strong></p>}
          <div className="history-count-actions">
            <button type="button" onClick={() => setEditing(false)} disabled={busy}>Batal</button>
            <button type="submit" disabled={result === null || busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
          </div>
        </form>
      ) : <FormulaBreakdown formula={entry.formula} quantity={entry.qty} />}

      <div className="history-record-footer">
        <div className="history-record-meta">
          <p><span className="font-semibold">{entry.operator?.split("@")[0]}</span><span aria-hidden="true"> · </span>{formatDisplayTime(entry.timestamp)}</p>
          {busy ? <p className="text-info" role="status">Menyimpan…</p> : entry.edited === "Yes" &&
            <p className="history-edited">Diedit {entry.editTimestamp ? formatDisplayTime(entry.editTimestamp) : ""}</p>}
        </div>
        <div className="history-record-actions">
          <button type="button" className="history-edit-button" aria-label={`Edit ${entry.productName}`} onClick={onEdit} disabled={busy}>
            <PencilIcon className="w-3.5 h-3.5" /> Edit
          </button>
          <button type="button" className="history-delete-button" aria-label={`Hapus ${entry.productName}`} onClick={onDelete} disabled={busy}>
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </article>
  );
}
