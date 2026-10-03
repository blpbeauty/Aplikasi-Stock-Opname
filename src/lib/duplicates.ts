import type { HistoryEntry } from "./types";
import type { PendingWrite } from "./localDb";

export interface DuplicateCheckItem {
  productName: string;
  sku: string;
  batch: string;
  qty: number;
  formula?: string;
  isNew?: boolean;
}

export interface DuplicateMatch {
  item: DuplicateCheckItem;
  existing: {
    rowId?: string;
    sessionId?: string;
    qty: number;
    timestamp: string;
    operator: string;
    isPending: boolean;
    pendingJobId?: number;
  };
}

export function isSameDay(dateStr1: string, dateStr2: string | Date = new Date()): boolean {
  if (!dateStr1) return false;
  const d1 = new Date(dateStr1);
  const d2 = typeof dateStr2 === "string" ? new Date(dateStr2) : dateStr2;
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function findDuplicates(
  location: string,
  itemsToSave: DuplicateCheckItem[],
  historyEntries: HistoryEntry[],
  pendingWrites: PendingWrite[],
  referenceDate: Date = new Date()
): DuplicateMatch[] {
  const normLoc = location.trim().toUpperCase();
  const matches: DuplicateMatch[] = [];

  for (const item of itemsToSave) {
    const itemSku = item.sku.trim().toLowerCase();
    const itemBatch = String(item.batch || "").trim().toLowerCase();

    // 1. Check pending writes in queue (most recent unsynced operations)
    let foundInPending = false;
    for (const job of pendingWrites) {
      if (job.action === "saveStockOpname") {
        const jobLoc = String(job.data.location || "").trim().toUpperCase();
        if (jobLoc === normLoc && Array.isArray(job.data.items)) {
          const matchingItem = job.data.items.find(
            (p: any) =>
              String(p.sku || "").trim().toLowerCase() === itemSku &&
              String(p.batch || "").trim().toLowerCase() === itemBatch
          );
          if (matchingItem) {
            const entry = job.entries?.find(
              (e: any) =>
                String(e.sku || "").trim().toLowerCase() === itemSku &&
                String(e.batch || "").trim().toLowerCase() === itemBatch
            );
            matches.push({
              item,
              existing: {
                rowId: entry?.rowId,
                sessionId: job.data.sessionId,
                qty: matchingItem.qty,
                timestamp: job.data.timestamp || new Date().toISOString(),
                operator: job.data.operator || "",
                isPending: true,
                pendingJobId: job.id,
              },
            });
            foundInPending = true;
            break;
          }
        }
      }
    }

    if (foundInPending) continue;

    // 2. Check local history entries (same location, sku, batch, and created today)
    const matchingHistory = historyEntries.find((entry) => {
      const entryLoc = String(entry.location || "").trim().toUpperCase();
      const entrySku = String(entry.sku || "").trim().toLowerCase();
      const entryBatch = String(entry.batch || "").trim().toLowerCase();

      return (
        entryLoc === normLoc &&
        entrySku === itemSku &&
        entryBatch === itemBatch &&
        isSameDay(entry.timestamp, referenceDate)
      );
    });

    if (matchingHistory) {
      matches.push({
        item,
        existing: {
          rowId: matchingHistory.rowId,
          sessionId: matchingHistory.sessionId,
          qty: matchingHistory.qty,
          timestamp: matchingHistory.timestamp,
          operator: matchingHistory.operator,
          isPending: false,
        },
      });
    }
  }

  return matches;
}
