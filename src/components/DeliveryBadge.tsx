"use client";

import { useDataSync } from "./DataSyncProvider";
import { getDeliveryStatus } from "@/lib/delivery";

export default function DeliveryBadge({
  rowIds,
  hideSynced = false,
}: {
  rowIds: string[];
  hideSynced?: boolean;
}) {
  const { pendingWrites, offline, queueReady } = useDataSync();
  const status = queueReady
    ? getDeliveryStatus(rowIds, pendingWrites, offline)
    : "Memeriksa";
  if (hideSynced && status === "Tersinkron") return null;

  const tone =
    status === "Gagal kirim"
      ? "bg-red-50 text-[#DC2626] border-red-200"
      : status === "Tersinkron"
      ? "bg-emerald-50 text-[#16A34A] border-emerald-200"
      : "bg-amber-50 text-[#D97706] border-amber-200";

  const dotTone =
    status === "Gagal kirim"
      ? "bg-[#DC2626]"
      : status === "Tersinkron"
      ? "bg-[#16A34A]"
      : "bg-[#D97706]";

  return (
    <span
      className={`inline-flex items-center gap-1 border rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none ${tone}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotTone}`} aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}
