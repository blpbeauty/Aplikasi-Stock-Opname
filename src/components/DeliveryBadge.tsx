"use client";

import { useDataSync } from "./DataSyncProvider";
import { getDeliveryStatus } from "@/lib/delivery";

export default function DeliveryBadge({ rowIds, hideSynced = false }: { rowIds: string[]; hideSynced?: boolean }) {
  const { pendingWrites, offline, queueReady } = useDataSync();
  const status = queueReady ? getDeliveryStatus(rowIds, pendingWrites, offline) : "Memeriksa status";
  if (hideSynced && status === "Tersinkron") return null;
  const tone = status === "Gagal kirim" ? "bg-danger-bg text-danger border-danger/30" :
    status === "Tersinkron" ? "bg-success-bg text-success border-success/20" : "bg-amber-bg text-amber-text border-amber-text/30";
  return <span className={`inline-flex items-center gap-1.5 border rounded-label px-2 py-1 text-meta font-semibold ${tone}`}><span className="w-1 h-1 rounded-full bg-current" aria-hidden="true" />{status}</span>;
}
