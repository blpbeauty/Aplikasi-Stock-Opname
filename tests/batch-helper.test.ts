import assert from "node:assert/strict";
import test from "node:test";
import { getSkuBatchInfo } from "../src/lib/batch";
import { Product } from "../src/lib/types";

test("SKU yang di Master Data hanya terdaftar tanpa batch mengizinkan batch kosong", () => {
  const master: Product[] = [
    { productName: "Lip Coat Butter", sku: "LC-001", batch: "" },
    { productName: "Lip Coat Butter", sku: "lc-001 ", batch: "   " },
  ];

  const info = getSkuBatchInfo(" LC-001 ", master);
  assert.deepEqual(info, {
    batches: [],
    allowEmptyBatch: true,
  });
});

test("SKU dengan kombinasi tanpa batch dan bernomor batch tetap menampilkan semua opsi", () => {
  const master: Product[] = [
    { productName: "Lip Glaze", sku: "LG-02", batch: "B202" },
    { productName: "Lip Glaze", sku: "LG-02", batch: "" },
  ];
  const localRows: Product[] = [
    { productName: "Lip Glaze", sku: "LG-02", batch: "B101" },
    { productName: "Lip Glaze", sku: "LG-02", batch: "B202" },
  ];

  const info = getSkuBatchInfo("lg-02", master, localRows);
  assert.deepEqual(info, {
    batches: ["B101", "B202"],
    allowEmptyBatch: true,
  });
});

test("SKU yang hanya memiliki nomor batch di Master Data tidak mengizinkan batch kosong", () => {
  const master: Product[] = [
    { productName: "Face Mist", sku: "FM-09", batch: "BATCH-A" },
    { productName: "Face Mist", sku: "FM-09", batch: "BATCH-B" },
  ];

  const info = getSkuBatchInfo("FM-09", master);
  assert.deepEqual(info, {
    batches: ["BATCH-A", "BATCH-B"],
    allowEmptyBatch: false,
  });
});

test("SKU baru atau kosong mengembalikan daftar kosong dan allowEmptyBatch false", () => {
  const master: Product[] = [
    { productName: "Face Mist", sku: "FM-09", batch: "BATCH-A" },
  ];

  assert.deepEqual(getSkuBatchInfo("UNKNOWN-SKU", master), {
    batches: [],
    allowEmptyBatch: false,
  });
  assert.deepEqual(getSkuBatchInfo("", master), {
    batches: [],
    allowEmptyBatch: false,
  });
});
