import { test } from "node:test";
import assert from "node:assert/strict";
import { getDraft, listDrafts, saveDraft, removeDraft, InputDraft } from "../src/lib/drafts";
import { getDeliveryStatus } from "../src/lib/delivery";
import type { PendingWrite } from "../src/lib/localDb";

test("draft restoration preserves counted zero and isolates account and location", () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    get length() { return storage.size; }, key: (index: number) => [...storage.keys()][index] || null,
    getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  const draft: InputDraft = { version: 1, location: "A-01", updatedAt: 123, products: [{ productName: "A", sku: "001", batch: "P-01" }], newProducts: [],
    quantities: { "001__P-01": 0, "002__P-02": 0 }, counted: { "001__P-01": true }, formulas: {},
    newProductForm: { productName: "New", sku: "003", batch: "P-03", barcode: "", qty: 2 }, newProductFormula: "", showAddForm: true };
  saveDraft("one@test", draft);
  assert.deepEqual(getDraft("ONE@test", " a-01 "), draft);
  assert.equal(getDraft("two@test", "A-01"), null);
  assert.equal(getDraft("one@test", "B-01"), null);
  assert.equal(listDrafts("one@test").length, 1);
  assert.equal(listDrafts("two@test").length, 0);
  assert.equal(getDraft("one@test", "A-01")?.counted["002__P-02"], undefined, "untouched zero is not counted");
  storage.set([...storage.keys()][0], "invalid json");
  assert.equal(getDraft("one@test", "A-01"), null);
  saveDraft("one@test", draft);
  removeDraft("one@test", "A-01");
  assert.equal(listDrafts("one@test").length, 0);
  Object.defineProperty(globalThis, "localStorage", { value: { setItem() { throw new Error("Storage full"); } } });
  assert.throws(() => saveDraft("one@test", draft), /Storage full/, "do not claim a draft is stored when storage fails");
});

test("delivery labels distinguish pending, offline, failed and confirmed writes", () => {
  const job = { action: "saveStockOpname", data: {}, entries: [{ rowId: "R-1" }] } as PendingWrite;
  assert.equal(getDeliveryStatus(["R-1"], [job], false), "Menunggu kirim");
  assert.equal(getDeliveryStatus(["R-1"], [job], true), "Tersimpan di perangkat");
  assert.equal(getDeliveryStatus(["R-1"], [{ ...job, error: "Server busy" }], false), "Gagal kirim");
  assert.equal(getDeliveryStatus(["R-2"], [job], false), "Tersinkron");
  assert.equal(getDeliveryStatus(["R-1"], [], false), "Tersinkron");
});
