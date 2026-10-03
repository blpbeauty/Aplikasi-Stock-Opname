import type { PendingWrite } from "./localDb";

export type DeliveryStatus = "Tersinkron" | "Tersimpan di perangkat" | "Menunggu kirim" | "Gagal kirim";

export function getDeliveryStatus(rowIds: string[], jobs: PendingWrite[], offline: boolean): DeliveryStatus {
  const ids = new Set(rowIds);
  const pending = jobs.filter(job => job.entries.some(entry => ids.has(entry.rowId)));
  if (pending.some(job => job.error)) return "Gagal kirim";
  if (pending.length) return offline ? "Tersimpan di perangkat" : "Menunggu kirim";
  return "Tersinkron";
}
