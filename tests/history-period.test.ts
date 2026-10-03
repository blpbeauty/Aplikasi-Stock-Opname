import { test } from "node:test";
import assert from "node:assert/strict";
import { getHistoryMonth, selectHistoryMonth, formatHistoryMonth } from "../src/lib/historyPeriod";
import type { HistoryEntry } from "../src/lib/types";

const row = (rowId: string, timestamp: string, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({
  rowId, sessionId: `SO-${rowId}`, timestamp, operator: "Bagas", location: "CEN/PARAS/A-01",
  productName: "Lip Coat", sku: "LPBF01", batch: "P-01", qty: 10,
  edited: "No", editTimestamp: "", formula: "", ...extra,
});

test("current count period excludes old, future and invalid rows without mixing edit dates", () => {
  const month = getHistoryMonth(new Date(2026, 9, 3));
  const history = [
    row("old", "30 Sep 2026 23:59", { edited: "Yes", editTimestamp: "3 Okt 2026 09:00", qty: 999 }),
    row("first", "1 Okt 2026 00:00", { qty: 0 }),
    row("other-session", "2 Oct 2026 09:15", { operator: "Dina", location: "CEN/PAYU/B-02" }),
    row("offline", new Date(2026, 9, 3, 9, 15).toISOString()),
    row("last", "31 Okt 2026 23:59"),
    row("future-month", "1 Nov 2026 00:00"),
    row("previous-year", "3 Okt 2025 09:00"),
    row("bad", "invalid"),
  ];
  assert.equal(month, "2026-10");
  assert.equal(formatHistoryMonth(month), "Oktober 2026");
  const visible = selectHistoryMonth(history, month);
  assert.deepEqual(visible.map(entry => entry.rowId), ["first", "other-session", "offline", "last"]);
  assert.equal(visible.reduce((total, entry) => total + entry.qty, 0), 30);
  assert.equal(history.length, 8, "archive remains unchanged");
  assert.deepEqual(selectHistoryMonth(history.filter(entry => entry.rowId === "old"), month), [],
    "an empty current month must not bring the previous month back");
});

test("count period changes correctly at year boundary", () => {
  assert.equal(getHistoryMonth(new Date(2027, 0, 1)), "2027-01");
  assert.deepEqual(selectHistoryMonth([row("old", "31 Des 2026 23:59"), row("new", "1 Jan 2027 00:00")], "2027-01")
    .map(entry => entry.rowId), ["new"]);
});
