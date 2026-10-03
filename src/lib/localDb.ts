/**
 * Local Database Layer (IndexedDB)
 * 
 * Menyimpan semua Master Data dan History dari Google Sheets ke browser.
 * Semua operasi read (lookup barcode, search, history) bisa dilakukan
 * secara INSTAN dari data lokal tanpa request ke GAS.
 * 
 * Google Sheets tetap jadi single source of truth.
 * Data lokal hanya cache — di-sync ulang setiap buka app.
 */

import { Product, HistoryEntry } from "./types";

// ── Types ──────────────────────────────────────────────────────

export type MasterProduct = Product & {
  location: string;
};

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

export type SyncProgress = {
  status: SyncStatus;
  step: string;       // e.g. "Downloading Master Data..."
  percent: number;    // 0-100
  lastSyncTime: number | null;
  error?: string;
  stage?: "products" | "history" | "storage" | "complete";
};

// ── Constants ──────────────────────────────────────────────────

const DB_NAME = "StockOpnameCache";
const DB_VERSION = 2;
const STORE_QUEUE = "writeQueue";
const STORE_MASTER = "masterData";
const STORE_HISTORY = "historyData";
const STORE_META = "syncMeta";

// ── IndexedDB Initialization ───────────────────────────────────

let dbInstance: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_QUEUE)) db.createObjectStore(STORE_QUEUE, { keyPath: "id", autoIncrement: true });

      // Master Data store — keyed by location+sku+batch
      if (!db.objectStoreNames.contains(STORE_MASTER)) {
        const masterStore = db.createObjectStore(STORE_MASTER, { keyPath: "id" });
        masterStore.createIndex("location", "location", { unique: false });
        masterStore.createIndex("barcode", "barcode", { unique: false });
        masterStore.createIndex("sku", "sku", { unique: false });
      }

      // History store — keyed by rowId
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        const historyStore = db.createObjectStore(STORE_HISTORY, { keyPath: "rowId" });
        historyStore.createIndex("location", "location", { unique: false });
        historyStore.createIndex("operator", "operator", { unique: false });
        historyStore.createIndex("timestamp", "timestamp", { unique: false });
      }

      // Sync metadata store
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(new Error("Failed to open IndexedDB"));
    };
  });
}

// ── Generic helpers ────────────────────────────────────────────

function txStore(storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDb().then((db) => {
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  });
}

function getAll<T>(storeName: string): Promise<T[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const store = await txStore(storeName, "readonly");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
}

function clearStore(storeName: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const store = await txStore(storeName, "readwrite");
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
}

function putAll<T>(storeName: string, items: T[]): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDb();
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } catch (e) {
      reject(e);
    }
  });
}

function putOne<T>(storeName: string, item: T): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const store = await txStore(storeName, "readwrite");
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
}

function deleteOne(storeName: string, key: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const store = await txStore(storeName, "readwrite");
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (e) {
      reject(e);
    }
  });
}

// ── Sync Metadata ──────────────────────────────────────────────

export async function getLastSyncTime(): Promise<number | null> {
  try {
    const store = await txStore(STORE_META, "readonly");
    return new Promise((resolve) => {
      const request = store.get("lastSync");
      request.onsuccess = () => {
        resolve(request.result?.value ?? null);
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setLastSyncTime(ts: number): Promise<void> {
  await putOne(STORE_META, { key: "lastSync", value: ts });
}

// ── Check if local data exists ─────────────────────────────────

export async function hasLocalData(): Promise<boolean> {
  try {
    const store = await txStore(STORE_META, "readonly");
    return await new Promise<boolean>((resolve, reject) => {
      const request = store.get("fullMasterVersion");
      request.onsuccess = () => resolve(request.result?.value === 2);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return false;
  }
}

// ── Data Sync: Download from GAS → Save to IndexedDB ──────────

const API_URL = (typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_APPS_SCRIPT_URL || "" : "").trim();

const DOWNLOAD_TIMEOUT_MS = 60_000;

async function fetchFromGAS(
  action: string,
  data: Record<string, unknown> = {},
  onStatus?: (message: string) => void
): Promise<any> {
  const label = action === "getHistory" ? "Riwayat" : "Master Data";
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (isOffline()) throw new Error("Sedang offline. Sambungkan internet atau akhiri Uji offline untuk mengunduh data terbaru.");
    if (!API_URL) throw new Error("Alamat Apps Script belum dikonfigurasi.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    const slowNotice = setTimeout(() => onStatus?.(`Menunggu ${label} dari server… koneksi masih diproses (percobaan ${attempt}/2).`), 10_000);
    let retry = false;
    try {
      const response = await fetch(API_URL, {
        signal: controller.signal,
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action, ...data }),
      });
      if (!response.ok) {
        retry = response.status === 429 || response.status >= 500;
        throw new Error(`Server mengembalikan HTTP ${response.status} saat mengunduh ${label}.`);
      }
      return await response.json();
    } catch (error: any) {
      const timedOut = controller.signal.aborted || error?.name === "TimeoutError" || error?.name === "AbortError";
      const networkError = error instanceof TypeError;
      retry = retry || timedOut || networkError;
      if (attempt < 2 && retry && !isOffline()) {
        onStatus?.(`Unduhan ${label} belum selesai. Mencoba kembali (2/2)…`);
      } else {
        if (timedOut) throw new Error(`${label} belum selesai diunduh dalam 60 detik per percobaan. Server lambat; silakan coba lagi. Data perangkat tetap tersimpan.`);
        if (networkError) throw new Error(`Tidak dapat terhubung ke Apps Script untuk mengunduh ${label}. Periksa koneksi lalu coba lagi.`);
        if (error instanceof SyntaxError) throw new Error(`Respons ${label} bukan data JSON. Periksa akses deployment Apps Script.`);
        throw error;
      }
    } finally {
      clearTimeout(timeout);
      clearTimeout(slowNotice);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function syncAllDataInternal(
  onProgress?: (progress: SyncProgress) => void
): Promise<{ masterCount: number; historyCount: number }> {
  const progress: SyncProgress = {
    status: "syncing",
    step: "Memulai sinkronisasi...",
    percent: 0,
    lastSyncTime: await getLastSyncTime(),
  };

  const report = (step: string, percent: number) => {
    progress.step = step;
    progress.percent = percent;
    onProgress?.({ ...progress });
  };

  try {
    progress.stage = "products";
    report("Mengunduh produk beserta lokasi...", 10);
    const masterResult = await fetchFromGAS("getAllMasterData", {}, message => report(message, 10));
    if (!masterResult.success || !Array.isArray(masterResult.products)) {
      throw new Error(masterResult.message || "Perbarui deployment Apps Script: getAllMasterData belum tersedia.");
    }
    const masterProducts = masterResult.products.map((p: any) => ({
      ...p, location: String(p.location).trim().toUpperCase(),
      id: `${String(p.location).trim().toUpperCase()}__${String(p.sku).trim()}__${String(p.batch).trim()}`,
    }));
    const counts = new Map<string, number>();
    masterProducts.forEach((p: MasterProduct) => counts.set(p.location, (counts.get(p.location) || 0) + 1));
    const allLocations = [...counts].map(([locationCode, productCount]) => ({ locationCode, productCount }));

    // Step 2: Download all history
    progress.stage = "history";
    report("Mengunduh riwayat...", 60);
    const historyResult = await fetchFromGAS("getHistory", { 
      operator: "", 
      filter: undefined, 
      allOperators: true 
    }, message => report(message, 60));

    if (!historyResult.success || !Array.isArray(historyResult.history)) throw new Error(historyResult.message || "Gagal mengunduh riwayat");
    let historyEntries: HistoryEntry[] = [];
    if (historyResult.success && historyResult.history) {
      historyEntries = historyResult.history.map((e: any) => ({
        rowId: String(e.rowId ?? ""),
        sessionId: String(e.sessionId ?? ""),
        timestamp: String(e.timestamp ?? ""),
        operator: String(e.operator ?? ""),
        location: String(e.location ?? ""),
        productName: String(e.productName ?? ""),
        sku: String(e.sku ?? ""),
        batch: String(e.batch ?? ""),
        qty: Number(e.qty) || 0,
        edited: String(e.edited ?? ""),
        editTimestamp: String(e.editTimestamp ?? ""),
        formula: String(e.formula ?? ""),
      }));
    }

    progress.stage = "storage";
    report("Menyimpan di perangkat...", 80);
    const now = Date.now();
    // Replace the snapshot atomically; pending writes always win over downloaded data.
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_MASTER, STORE_HISTORY, STORE_META, STORE_QUEUE], "readwrite");
      const request = tx.objectStore(STORE_QUEUE).getAll();
      request.onsuccess = () => {
        tx.objectStore(STORE_MASTER).clear();
        tx.objectStore(STORE_HISTORY).clear();
        masterProducts.forEach((p: MasterProduct) => tx.objectStore(STORE_MASTER).put(p));
        historyEntries.forEach(e => tx.objectStore(STORE_HISTORY).put(e));
        tx.objectStore(STORE_META).put({ key: "allLocations", value: allLocations });
        tx.objectStore(STORE_META).put({ key: "lastSync", value: now });
        tx.objectStore(STORE_META).put({ key: "fullMasterVersion", value: 2 });
        (request.result as PendingWrite[]).forEach(job => applyPending(tx, job));
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });

    progress.stage = "complete";
    report("Sinkronisasi selesai", 100);
    progress.status = "synced";
    progress.lastSyncTime = now;
    onProgress?.({ ...progress });

    return { masterCount: masterProducts.length, historyCount: historyEntries.length };
  } catch (error: any) {
    progress.status = "error";
    progress.error = error?.message || "Gagal sinkronisasi";
    const labels = { products: "mengunduh produk", history: "mengunduh riwayat", storage: "menyimpan di perangkat", complete: "menyelesaikan sinkronisasi" };
    progress.step = `Gagal pada tahap ${labels[progress.stage || "products"]}`;
    onProgress?.({ ...progress });
    throw error;
  }
}

// ── Sync location-specific products (on-demand) ────────────────

const locationSyncCache = new Set<string>();

export async function syncLocationProducts(locationCode: string): Promise<void> {
  if (locationSyncCache.has(locationCode)) return;
  
  try {
    const result = await fetchFromGAS("getProducts", { locationCode });
    if (result.success && result.products) {
      const products: MasterProduct[] = result.products.map((p: any) => ({
        id: `${locationCode}__${String(p.sku || "").trim()}__${String(p.batch || "").trim()}`,
        productName: String(p.productName ?? ""),
        sku: String(p.sku ?? ""),
        batch: String(p.batch ?? ""),
        barcode: String(p.barcode ?? ""),
        location: locationCode,
      }));
      
      // Add location-specific entries (don't clear — we're adding alongside generic entries)
      await putAll(STORE_MASTER, products);
      locationSyncCache.add(locationCode);
    }
  } catch {
    // Non-critical — will fallback to API
  }
}

// ── Local Read Operations (INSTANT) ────────────────────────────

/** Lookup barcode in local data — returns matching product or null */
export async function lookupBarcodeLocal(barcode: string): Promise<Product | null> {
  try {
    const store = await txStore(STORE_MASTER, "readonly");
    const found = await new Promise<MasterProduct | undefined>((resolve, reject) => {
      const request = store.index("barcode").get(barcode.trim());
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (found) {
      return {
        productName: found.productName,
        sku: found.sku,
        batch: found.batch,
        barcode: found.barcode,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Get products for a specific location from local data */
export async function getProductsLocal(locationCode: string): Promise<Product[] | null> {
  try {
    const target = locationCode.trim().toUpperCase();
    const store = await txStore(STORE_MASTER, "readonly");
    const products = await new Promise<MasterProduct[]>((resolve, reject) => {
      const request = store.index("location").getAll(target);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!products.length && !await hasLocalData()) return null;
    return products.map((p) => ({
      productName: p.productName,
      sku: p.sku,
      batch: p.batch,
      barcode: p.barcode,
    }));
  } catch {
    return null;
  }
}

/** Get all history from local data */
export async function getHistoryLocal(): Promise<HistoryEntry[]> {
  try {
    return await getAll<HistoryEntry>(STORE_HISTORY);
  } catch {
    return [];
  }
}

/** Search products by name/sku/batch in local data */
export async function searchProductsLocal(query: string): Promise<Product[]> {
  try {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const all = await getAll<MasterProduct>(STORE_MASTER);
    const seen = new Set<string>();
    const results: Product[] = [];
    for (const p of all) {
      const key = `${p.sku}__${p.batch}`;
      if (seen.has(key)) continue;
      if (
        p.productName.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.batch.toLowerCase().includes(q)
      ) {
        seen.add(key);
        results.push({
          productName: p.productName,
          sku: p.sku,
          batch: p.batch,
          barcode: p.barcode,
        });
        if (results.length >= 10) break;
      }
    }
    return results;
  } catch {
    return [];
  }
}

/** Search products globally (with location info) in local data */
export async function searchProductsGlobalLocal(query: string): Promise<Array<{ location: string; productName: string; sku: string; batch: string; barcode: string }>> {
  try {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const all = await getAll<MasterProduct>(STORE_MASTER);
    const results: Array<{ location: string; productName: string; sku: string; batch: string; barcode: string }> = [];
    for (const p of all) {
      if (!p.location) continue; // skip entries without location
      if (
        p.productName.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.batch.toLowerCase().includes(q)
      ) {
        results.push({
          location: p.location,
          productName: p.productName,
          sku: p.sku,
          batch: p.batch,
          barcode: p.barcode || "",
        });
        if (results.length >= 30) break;
      }
    }
    return results;
  } catch {
    return [];
  }
}

/** Search locations in local data */
export async function searchLocationsLocal(query: string): Promise<Array<{ locationCode: string; productCount: number }>> {
  try {
    const stored = await new Promise<any>((resolve) => {
      txStore(STORE_META, "readonly").then((store) => {
        const req = store.get("allLocations");
        req.onsuccess = () => resolve(req.result?.value ?? []);
        req.onerror = () => resolve([]);
      }).catch(() => resolve([]));
    });

    if (!stored || !Array.isArray(stored)) return [];

    const q = query.trim().toLowerCase();
    if (!q) return stored;

    return stored
      .filter((loc: any) => loc.locationCode.toLowerCase().includes(q))
      .slice(0, 15);
  } catch {
    return [];
  }
}

/** Get all locations from local data */
export async function getAllLocationsLocal(): Promise<Array<{ locationCode: string; productCount: number }>> {
  try {
    const stored = await new Promise<any>((resolve) => {
      txStore(STORE_META, "readonly").then((store) => {
        const req = store.get("allLocations");
        req.onsuccess = () => resolve(req.result?.value ?? []);
        req.onerror = () => resolve([]);
      }).catch(() => resolve([]));
    });
    const locations: Array<{ locationCode: string; productCount: number }> = Array.isArray(stored) ? stored : [];
    const counts = new Map<string, number>();
    for (const product of await getAll<MasterProduct>(STORE_MASTER)) {
      if (product.location) counts.set(product.location, (counts.get(product.location) || 0) + 1);
    }
    for (const [locationCode, productCount] of counts) {
      const existing = locations.find(l => l.locationCode === locationCode);
      if (existing) existing.productCount = productCount;
      else locations.push({ locationCode, productCount });
    }
    return locations;
  } catch {
    return [];
  }
}

/** Get all unique products from local data */
export async function getAllProductsLocal(): Promise<Product[]> {
  try {
    const all = await getAll<MasterProduct>(STORE_MASTER);
    const seen = new Set<string>();
    const products: Product[] = [];
    for (const p of all) {
      const key = `${p.sku.trim()}__${p.batch.trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      products.push({
        productName: p.productName,
        sku: p.sku,
        batch: p.batch,
        barcode: p.barcode,
      });
    }
    return products;
  } catch {
    return [];
  }
}

// ── Local Write Operations (update cache after GAS write) ──────

/** Add a new history entry to local cache */
export async function addHistoryEntryLocal(entry: HistoryEntry): Promise<void> {
  try {
    await putOne(STORE_HISTORY, entry);
  } catch { /* non-critical */ }
}

/** Update a history entry in local cache */
export async function updateHistoryEntryLocal(rowId: string, updates: Partial<HistoryEntry>): Promise<void> {
  try {
    const all = await getAll<HistoryEntry>(STORE_HISTORY);
    const entry = all.find((e) => e.rowId === rowId);
    if (entry) {
      await putOne(STORE_HISTORY, { ...entry, ...updates });
    }
  } catch { /* non-critical */ }
}

/** Delete a history entry from local cache */
export async function deleteHistoryEntryLocal(rowId: string): Promise<void> {
  try {
    await deleteOne(STORE_HISTORY, rowId);
  } catch { /* non-critical */ }
}

/** Add a master product to local cache */
export async function addMasterProductLocal(product: MasterProduct): Promise<void> {
  try {
    await putOne(STORE_MASTER, {
      ...product,
      id: `${product.location}__${product.sku.trim()}__${product.batch.trim()}`,
    });
  } catch { /* non-critical */ }
}

/** Delete a master product from local cache */
export async function deleteMasterProductLocal(locationCode: string, sku: string, batch: string): Promise<void> {
  try {
    const id = `${locationCode}__${sku.trim()}__${batch.trim()}`;
    await deleteOne(STORE_MASTER, id);
  } catch { /* non-critical */ }
}

/**
 * Mirror a successful server-side move into the local master cache:
 * re-key the affected products from the old location to the new one.
 * items kosong/undefined = pindahkan seluruh produk lokasi asal.
 */
export async function moveMasterProductsLocal(
  fromLocation: string,
  toLocation: string,
  items?: Array<{ sku: string; batch: string }>
): Promise<void> {
  try {
    const all = await getAll<MasterProduct>(STORE_MASTER);
    const from = fromLocation.trim().toUpperCase();
    const to = toLocation.trim().toUpperCase();
    if (!from || !to || from === to) return;

    const updates: MasterProduct[] = [];
    for (const p of all) {
      if (String(p.location || "").trim().toUpperCase() !== from) continue;
      if (items && items.length > 0) {
        const match = items.some(
          (i) =>
            String(i.sku || "").trim() === String(p.sku || "").trim() &&
            String(i.batch || "").trim() === String(p.batch || "").trim()
        );
        if (!match) continue;
      }
      updates.push({
        ...p,
        location: to,
        id: `${to}__${String(p.sku).trim()}__${String(p.batch).trim()}`,
      } as MasterProduct);
    }
    if (updates.length === 0) return;

    for (const p of updates) {
      await deleteOne(STORE_MASTER, `${from}__${String(p.sku).trim()}__${String(p.batch).trim()}`);
    }
    await putAll(STORE_MASTER, updates);
    locationSyncCache.delete(from);
  } catch { /* non-critical */ }
}

// ── Clear all local data ───────────────────────────────────────

export async function clearLocalDb(): Promise<void> {
  try {
    await clearStore(STORE_MASTER);
    await clearStore(STORE_HISTORY);
    await clearStore(STORE_META);
    locationSyncCache.clear();
  } catch { /* non-critical */ }
}


export function isOffline(): boolean {
  return typeof navigator !== "undefined" && (!navigator.onLine || localStorage.getItem("testOffline") === "true");
}

export type PendingWrite = {
  id?: number;
  action: "saveStockOpname" | "updateEntry" | "addMasterProduct";
  data: Record<string, any>;
  entries: HistoryEntry[];
  previous?: HistoryEntry;
  previousMaster?: Product;
  error?: string;
};

function applyPending(tx: IDBTransaction, job: PendingWrite) {
  if (job.action === "addMasterProduct") {
    const p = job.data;
    tx.objectStore(STORE_MASTER).put({ ...p, location: p.locationCode, id: `${p.locationCode}__${p.sku.trim()}__${p.batch.trim()}` });
  }
  if (job.action === "updateEntry" && job.previous) {
    const old = job.previous;
    const entry = job.entries[0];
    if (entry && (old.location !== entry.location || old.sku !== entry.sku || old.batch !== entry.batch || old.productName !== entry.productName)) {
      const store = tx.objectStore(STORE_MASTER);
      const oldKey = `${old.location}__${old.sku.trim()}__${old.batch.trim()}`;
      if (job.previousMaster) {
        store.delete(oldKey);
        store.put({ ...job.previousMaster, location: entry.location, sku: entry.sku, batch: entry.batch,
          productName: entry.productName, id: `${entry.location}__${entry.sku.trim()}__${entry.batch.trim()}` });
      }
    }
  }
  job.entries.forEach(entry => tx.objectStore(STORE_HISTORY).put(entry));
  if (job.action === "saveStockOpname") {
    job.data.items.forEach((item: Product) => {
      const location = job.data.location;
      tx.objectStore(STORE_MASTER).put({ ...item, location, id: `${location}__${item.sku.trim()}__${item.batch.trim()}` });
    });
  }
}

export async function enqueueWrite(job: PendingWrite): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_QUEUE, STORE_HISTORY, STORE_MASTER], "readwrite");
    tx.objectStore(STORE_QUEUE).add(job);
    applyPending(tx, job);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error || new Error("Penyimpanan perangkat gagal"));
  });
  window.dispatchEvent(new Event("outbox-change"));
}

export async function getPendingWrites(): Promise<PendingWrite[]> { return getAll<PendingWrite>(STORE_QUEUE); }
export async function finishPendingWrite(id: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readwrite");
    tx.objectStore(STORE_QUEUE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
  window.dispatchEvent(new Event("outbox-change"));
}
export async function failPendingWrite(job: PendingWrite, error: string): Promise<void> {
  await putAll(STORE_QUEUE, [{ ...job, error }]);
  window.dispatchEvent(new Event("outbox-change"));
}

export async function syncAllData(onProgress?: (progress: SyncProgress) => void) {
  const run = () => syncAllDataInternal(onProgress);
  return withSyncLock(run);
}

let syncTail: Promise<unknown> = Promise.resolve();
export async function withSyncLock<T>(run: () => Promise<T>): Promise<T> {
  if (navigator.locks) return await navigator.locks.request("stock-opname-sync", run);
  const next = syncTail.then(run, run);
  syncTail = next.catch(() => {});
  return next;
}
