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
};

// ── Constants ──────────────────────────────────────────────────

const DB_NAME = "StockOpnameCache";
const DB_VERSION = 1;
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
    const master = await getAll<MasterProduct>(STORE_MASTER);
    return master.length > 0;
  } catch {
    return false;
  }
}

// ── Data Sync: Download from GAS → Save to IndexedDB ──────────

const API_URL = (typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_APPS_SCRIPT_URL || "" : "").trim();

async function fetchFromGAS(action: string, data: Record<string, unknown> = {}): Promise<any> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action, ...data }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function syncAllData(
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
    onProgress?.(progress);
  };

  try {
    // Step 1: Download all master data (products with locations)
    report("Mengunduh Master Data...", 10);
    const masterResult = await fetchFromGAS("getAllProducts");

    let masterProducts: MasterProduct[] = [];
    if (masterResult.success && masterResult.products) {
      // getAllProducts returns unique products without location
      // We need searchProductsGlobal or a bulk read — but let's use
      // the existing getProducts per location approach via a new bulk endpoint
      // For now, store what we get from getAllProducts
      masterProducts = masterResult.products.map((p: any) => ({
        id: `${String(p.sku || "").trim()}__${String(p.batch || "").trim()}`,
        productName: String(p.productName ?? ""),
        sku: String(p.sku ?? ""),
        batch: String(p.batch ?? ""),
        barcode: String(p.barcode ?? ""),
        location: "", // getAllProducts doesn't include location
      }));
    }

    report("Mengunduh data lokasi...", 30);
    // Also get all locations with their products for location-based lookup
    const locResult = await fetchFromGAS("getAllLocations");
    let allLocations: Array<{ locationCode: string; productCount: number }> = [];
    if (locResult.success && locResult.locations) {
      allLocations = locResult.locations;
    }

    // For each location, fetch products to build location-specific master data
    // But this would be too many requests. Instead, use searchProductsGlobal with a broad query
    // OR we create a new GAS endpoint. 
    // Best approach: use a single broad search to get all products with locations
    report("Mengunduh produk per lokasi...", 40);
    
    // Use searchProductsGlobal with common prefixes to get location-mapped products
    // Better: fetch all master data in one call via a new lightweight approach
    // We'll use the existing Master Data sheet structure
    const globalResult = await fetchFromGAS("searchProductsGlobal", { query: "" });
    // searchProductsGlobal requires min 2 chars — we need to add a "getAllMasterData" action
    // For now, let's work with what we have: store products without location from getAllProducts
    // and also try to get location-mapped data

    // Actually, let's create a smarter approach: 
    // We already have getAllProducts (unique sku+batch) and getAllLocations
    // For the barcode lookup, getAllProducts is sufficient (barcode→product mapping)
    // For getProducts(location), we need location-specific data
    // We'll fetch per-location in background as needed
    
    // Store master products (for barcode lookup + product search)
    report("Menyimpan Master Data...", 50);
    await clearStore(STORE_MASTER);
    if (masterProducts.length > 0) {
      await putAll(STORE_MASTER, masterProducts);
    }

    // Store location list in meta
    await putOne(STORE_META, { key: "allLocations", value: allLocations });

    // Step 2: Download all history
    report("Mengunduh Riwayat...", 60);
    const historyResult = await fetchFromGAS("getHistory", { 
      operator: "", 
      filter: undefined, 
      allOperators: true 
    });

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

    report("Menyimpan Riwayat...", 80);
    await clearStore(STORE_HISTORY);
    if (historyEntries.length > 0) {
      await putAll(STORE_HISTORY, historyEntries);
    }

    // Step 3: Mark sync complete
    const now = Date.now();
    await setLastSyncTime(now);

    report("Sinkronisasi selesai!", 100);
    progress.status = "synced";
    progress.lastSyncTime = now;
    onProgress?.(progress);

    return { masterCount: masterProducts.length, historyCount: historyEntries.length };
  } catch (error: any) {
    progress.status = "error";
    progress.error = error?.message || "Gagal sinkronisasi";
    progress.step = "Gagal sinkronisasi data";
    onProgress?.(progress);
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
    const all = await getAll<MasterProduct>(STORE_MASTER);
    const target = barcode.trim();
    const found = all.find((p) => (p.barcode || "").trim() === target);
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
    const all = await getAll<MasterProduct>(STORE_MASTER);
    const target = locationCode.trim().toUpperCase();
    const products = all.filter((p) => p.location.trim().toUpperCase() === target);
    if (products.length === 0) return null; // location not synced yet
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
    return Array.isArray(stored) ? stored : [];
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
