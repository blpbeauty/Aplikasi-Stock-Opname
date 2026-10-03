import { parseTimestamp, toDateStr } from "./format";
import type { HistoryEntry } from "./types";

export function getHistoryMonth(now: Date = new Date()): string {
  return toDateStr(now).slice(0, 7);
}

/** Keep the original count date: editing an old row does not change its period. */
export function selectHistoryMonth(entries: HistoryEntry[], month: string): HistoryEntry[] {
  return entries.filter((entry) => {
    const countedAt = parseTimestamp(entry.timestamp);
    return countedAt !== null && getHistoryMonth(countedAt) === month;
  });
}

export function formatHistoryMonth(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(year, number - 1, 1).toLocaleDateString("id-ID", {
    month: "long", year: "numeric",
  });
}
