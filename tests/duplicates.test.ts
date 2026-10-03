import { test } from "node:test";
import assert from "node:assert/strict";
import { findDuplicates, isSameDay } from "../src/lib/duplicates";
import type { HistoryEntry } from "../src/lib/types";
import type { PendingWrite } from "../src/lib/localDb";

test("isSameDay checks calendar date equality", () => {
  const d1 = "2026-10-03T08:00:00.000Z";
  const d2 = "2026-10-03T15:30:00.000Z";
  const d3 = "2026-10-04T01:00:00.000Z";

  assert.equal(isSameDay(d1, d2), true);
  assert.equal(isSameDay(d1, d3), false);
  assert.equal(isSameDay("", d1), false);
  assert.equal(isSameDay("invalid-date", d1), false);
});

test("findDuplicates detects matching items in history and pending writes", () => {
  const refDate = new Date("2026-10-03T10:00:00.000Z");

  const historyEntries: HistoryEntry[] = [
    {
      rowId: "R-101",
      sessionId: "SO-101",
      timestamp: "2026-10-03T07:15:00.000Z",
      operator: "andi@blp.com",
      location: "CEN/PARAS/01",
      productName: "Lip Coat Butter Fudge",
      sku: "LC-BF-01",
      batch: "B123",
      qty: 15,
      edited: "No",
      editTimestamp: "",
      formula: "15",
    },
    {
      rowId: "R-102",
      sessionId: "SO-101",
      timestamp: "2026-10-02T10:00:00.000Z", // Yesterday
      operator: "andi@blp.com",
      location: "CEN/PARAS/01",
      productName: "Lip Coat Ginger Bread",
      sku: "LC-GB-01",
      batch: "B124",
      qty: 10,
      edited: "No",
      editTimestamp: "",
      formula: "10",
    },
  ];

  const pendingWrites: PendingWrite[] = [
    {
      id: 5,
      action: "saveStockOpname",
      data: {
        sessionId: "SO-102",
        location: "CEN/PARAS/01",
        timestamp: "2026-10-03T09:30:00.000Z",
        operator: "andi@blp.com",
        items: [
          { productName: "Cheek Stain Cherry", sku: "CS-CH-01", batch: "B999", qty: 25 },
        ],
      },
      entries: [
        {
          rowId: "R-103",
          sessionId: "SO-102",
          timestamp: "2026-10-03T09:30:00.000Z",
          operator: "andi@blp.com",
          location: "CEN/PARAS/01",
          productName: "Cheek Stain Cherry",
          sku: "CS-CH-01",
          batch: "B999",
          qty: 25,
          edited: "No",
          editTimestamp: "",
          formula: "25",
        },
      ],
    },
  ];

  const itemsToSave = [
    { productName: "Lip Coat Butter Fudge", sku: "LC-BF-01", batch: "B123", qty: 20 }, // Match in history today
    { productName: "Cheek Stain Cherry", sku: "CS-CH-01", batch: "B999", qty: 30 },    // Match in pending
    { productName: "Lip Coat Ginger Bread", sku: "LC-GB-01", batch: "B124", qty: 10 }, // Only exists yesterday -> not a duplicate today
    { productName: "New Eyeliner", sku: "EYE-01", batch: "B001", qty: 5 },              // Completely new
  ];

  const duplicates = findDuplicates("CEN/PARAS/01", itemsToSave, historyEntries, pendingWrites, refDate);

  assert.equal(duplicates.length, 2);

  // Check history match
  const histMatch = duplicates.find(d => d.item.sku === "LC-BF-01");
  assert.ok(histMatch);
  assert.equal(histMatch.existing.qty, 15);
  assert.equal(histMatch.existing.rowId, "R-101");
  assert.equal(histMatch.existing.isPending, false);

  // Check pending match
  const pendMatch = duplicates.find(d => d.item.sku === "CS-CH-01");
  assert.ok(pendMatch);
  assert.equal(pendMatch.existing.qty, 25);
  assert.equal(pendMatch.existing.isPending, true);
  assert.equal(pendMatch.existing.pendingJobId, 5);
});
