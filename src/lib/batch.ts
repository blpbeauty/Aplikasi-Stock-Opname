import { Product } from "./types";

export interface SkuBatchInfo {
  /** Daftar nomor batch non-kosong yang unik & terurut untuk SKU tersebut. */
  batches: string[];
  /** True bila di Master Data / daftar produk aktif terdapat entri SKU ini tanpa nomor batch. */
  allowEmptyBatch: boolean;
}

/**
 * Mengumpulkan daftar batch unik untuk suatu SKU dari satu atau lebih sumber
 * produk (Master Data, hasil pencarian, atau daftar produk lokasi) serta memeriksa
 * apakah SKU tersebut memang terdaftar tanpa batch di Master Data.
 */
export function getSkuBatchInfo(
  sku: string,
  ...sources: Array<readonly Product[] | null | undefined>
): SkuBatchInfo {
  const normalizedSku = String(sku || "").trim().toLowerCase();
  if (!normalizedSku) {
    return { batches: [], allowEmptyBatch: false };
  }

  const batchSet = new Set<string>();
  let allowEmptyBatch = false;

  for (const list of sources) {
    if (!list) continue;
    for (const item of list) {
      if (!item) continue;
      if (String(item.sku || "").trim().toLowerCase() !== normalizedSku) continue;
      const batch = String(item.batch || "").trim();
      if (batch) {
        batchSet.add(batch);
      } else {
        allowEmptyBatch = true;
      }
    }
  }

  return {
    batches: Array.from(batchSet).sort(),
    allowEmptyBatch,
  };
}
