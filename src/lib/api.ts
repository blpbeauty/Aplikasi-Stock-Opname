import { User, Product, HistoryEntry } from "./types";
import {
  lookupBarcodeLocal,
  getProductsLocal,
  getHistoryLocal,
  searchProductsLocal,
  searchLocationsLocal,
  getAllLocationsLocal,
  getAllProductsLocal,
  searchProductsGlobalLocal,
  addHistoryEntryLocal,
  updateHistoryEntryLocal,
  deleteHistoryEntryLocal,
  addMasterProductLocal,
  deleteMasterProductLocal,
  moveMasterProductsLocal,
  syncLocationProducts,
  hasLocalData,
} from "./localDb";

const API_URL = (process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || "").trim();

// Track active AbortControllers per action type for request cancellation
const activeControllers: Record<string, AbortController> = {};

// In-flight dedup: prevent identical concurrent requests
const inflightRequests: Record<string, Promise<any> | undefined> = {};

// ─── In-memory response cache (fast, no serialization) ──────────────
interface MemEntry { data: any; ts: number }
const memCache = new Map<string, MemEntry>();

// TTL per action (ms) — only read-like actions are cached
const CACHE_TTL: Record<string, number> = {
  searchLocations: 120_000,  // 2 min
  searchProducts:  120_000,  // 2 min
  lookupBarcode:  120_000,   // 2 min
  getProducts:     60_000,   // 1 min
  getHistory:      60_000,   // 1 min (was 15s — too aggressive)
  warmupCache:    300_000,   // 5 min
  getAllLocations: 300_000,   // 5 min — bulk data, rarely changes
  getAllProducts:  300_000,   // 5 min — bulk data, rarely changes
};

function getMemCache(key: string, ttl: number): any | null {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttl) { memCache.delete(key); return null; }
  return entry.data;
}

function setMemCache(key: string, data: any): void {
  memCache.set(key, { data, ts: Date.now() });
  // Prune old entries when map grows large
  if (memCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of memCache) {
      if (now - v.ts > 300_000) memCache.delete(k);
    }
  }
}

/** Invalidate in-memory cache entries by action prefix */
export function invalidateMemCache(prefix?: string): void {
  if (!prefix) { memCache.clear(); return; }
  for (const k of memCache.keys()) {
    if (k.startsWith(prefix + ":")) memCache.delete(k);
  }
}

export const apiCall = async (
  action: string,
  data: Record<string, unknown> = {},
  options?: { cancelPrevious?: boolean; skipMemCache?: boolean }
): Promise<any> => {
  if (!API_URL) {
    console.error("NEXT_PUBLIC_APPS_SCRIPT_URL is not configured. Please set it in your .env.local file.");
    throw new Error("API URL belum dikonfigurasi. Silakan set NEXT_PUBLIC_APPS_SCRIPT_URL di file .env.local");
  }

  const dedupKey = action + ":" + JSON.stringify(data);
  const ttl = CACHE_TTL[action];

  // Return cached result instantly for read-like actions
  if (ttl && !options?.skipMemCache) {
    const cached = getMemCache(dedupKey, ttl);
    if (cached) return cached;
  }

  // Cancel previous request of same action type if requested
  if (options?.cancelPrevious && activeControllers[action]) {
    activeControllers[action].abort();
    delete activeControllers[action];
    delete inflightRequests[action];
  }

  // Dedup: if same action is already in-flight, return same promise
  if (inflightRequests[dedupKey]) {
    return inflightRequests[dedupKey];
  }

  const controller = new AbortController();
  if (options?.cancelPrevious) {
    activeControllers[action] = controller;
  }

  const request = (async () => {
    try {
      // Timeout: GAS cold starts can be 3-10s. Abort after 15s.
      const timeoutId = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
        },
        body: JSON.stringify({ action, ...data }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // Store successful results in memory cache
      if (ttl && result?.success !== false) {
        setMemCache(dedupKey, result);
      }

      return result;
    } catch (error: any) {
      if (error?.name === "AbortError") {
        return { success: false, message: "Request timeout" };
      }
      console.error("API call error:", error);
      throw error;
    } finally {
      delete inflightRequests[dedupKey];
      if (activeControllers[action] === controller) {
        delete activeControllers[action];
      }
    }
  })();

  inflightRequests[dedupKey] = request;
  return request;
};

export const loginApi = async (
  email: string,
  password: string
): Promise<{ success: boolean; user?: User; message?: string }> => {
  return apiCall("login", { email, password });
};

export const getProductsApi = async (
  locationCode: string
): Promise<{ success: boolean; products?: Product[]; message?: string }> => {
  // Try local IndexedDB first (instant)
  try {
    const localProducts = await getProductsLocal(locationCode);
    if (localProducts && localProducts.length > 0) {
      // Also trigger background sync for this location
      syncLocationProducts(locationCode).catch(() => {});
      return { success: true, products: localProducts };
    }
  } catch { /* fallback to API */ }
  // Fallback to GAS API + cache location products locally
  const result = await apiCall("getProducts", { locationCode });
  if (result.success && result.products) {
    syncLocationProducts(locationCode).catch(() => {});
  }
  return result;
};

export const saveStockOpnameApi = async (
  sessionId: string,
  operator: string,
  location: string,
  timestamp: string,
  items: Array<{
    productName: string;
    sku: string;
    batch: string;
    qty: number;
    isNew?: boolean;
    barcode?: string;
    formula?: string;
  }>
): Promise<{ success: boolean; message?: string }> => {
  invalidateMemCache("getHistory");
  invalidateMemCache("getProducts");
  return apiCall("saveStockOpname", {
    sessionId,
    operator,
    location,
    timestamp,
    items,
  });
};

export const getHistoryApi = async (
  operator: string,
  filter?: string,
  allOperators?: boolean,
  operatorName?: string
): Promise<{ success: boolean; history?: HistoryEntry[]; message?: string }> => {
  // Try local IndexedDB first (instant)
  try {
    const hasData = await hasLocalData();
    if (hasData) {
      const localHistory = await getHistoryLocal();
      if (localHistory.length > 0) {
        if (allOperators) {
          return { success: true, history: localHistory };
        }
        // Personal scope: mirror the server (GAS stores the operator's first
        // name; optimistic local entries store the email). Without this filter
        // every page would silently count other operators' entries.
        const firstName = (operatorName || "").trim().split(/\s+/)[0]?.toLowerCase();
        const rows = localHistory.filter((e) => {
          const op = String(e.operator || "").trim().toLowerCase();
          return op === operator.trim().toLowerCase() || (!!firstName && op === firstName);
        });
        return { success: true, history: rows };
      }
    }
  } catch { /* fallback to API */ }
  return apiCall("getHistory", { operator, filter, allOperators: !!allOperators });
};

export const updateEntryApi = async (
  rowId: string,
  sessionId: string,
  newQty: number,
  editTimestamp: string,
  extra?: { productName?: string; sku?: string; batch?: string; formula?: string; location?: string }
): Promise<{ success: boolean; message?: string }> => {
  invalidateMemCache("getHistory");
  if (extra?.location) {
    invalidateMemCache("getProducts");
    invalidateMemCache("getAllLocations");
    invalidateMemCache("getAllProducts");
  }
  const result = await apiCall("updateEntry", {
    rowId,
    sessionId,
    newQty,
    editTimestamp,
    ...extra,
  });
  if (result.success) {
    await updateHistoryEntryLocal(rowId, {
      qty: newQty,
      edited: "Yes",
      editTimestamp,
      ...(extra?.productName !== undefined ? { productName: extra.productName } : {}),
      ...(extra?.sku !== undefined ? { sku: extra.sku } : {}),
      ...(extra?.batch !== undefined ? { batch: extra.batch } : {}),
      ...(extra?.formula !== undefined ? { formula: extra.formula } : {}),
      ...(extra?.location !== undefined ? { location: extra.location } : {}),
    });
  }
  return result;
};

export const deleteProductApi = async (
  locationCode: string,
  sku: string,
  batch: string
): Promise<{ success: boolean; message?: string }> => {
  invalidateMemCache("getProducts");
  invalidateMemCache("getHistory");
  const result = await apiCall("deleteProduct", { locationCode, sku, batch });
  if (result.success) {
    await deleteMasterProductLocal(locationCode, sku, batch);
  }
  return result;
};

export const addMasterProductApi = async (
  locationCode: string,
  productName: string,
  sku: string,
  batch: string,
  barcode?: string
): Promise<{ success: boolean; message?: string }> => {
  invalidateMemCache("getProducts");
  invalidateMemCache("getAllProducts");
  const result = await apiCall("addMasterProduct", { locationCode, productName, sku, batch, barcode: barcode || "" });
  if (result.success) {
    await addMasterProductLocal({
      location: locationCode,
      productName,
      sku,
      batch,
      barcode: barcode || "",
    });
  }
  return result;
};

export const lookupBarcodeApi = async (
  barcode: string
): Promise<{ success: boolean; product?: Product; message?: string }> => {
  // Try local IndexedDB first (instant)
  try {
    const localProduct = await lookupBarcodeLocal(barcode);
    if (localProduct) {
      return { success: true, product: localProduct };
    }
  } catch { /* fallback to API */ }
  return apiCall("lookupBarcode", { barcode });
};

export const searchProductsApi = async (
  query: string
): Promise<{ success: boolean; products?: Product[] }> => {
  // Try local IndexedDB first (instant)
  try {
    const localResults = await searchProductsLocal(query);
    if (localResults.length > 0) {
      return { success: true, products: localResults };
    }
  } catch { /* fallback to API */ }
  return apiCall("searchProducts", { query }, { cancelPrevious: true });
};

export const deleteEntryApi = async (
  rowId: string
): Promise<{ success: boolean; message?: string }> => {
  invalidateMemCache("getHistory");
  const result = await apiCall("deleteEntry", { rowId });
  if (result.success) {
    await deleteHistoryEntryLocal(rowId);
  }
  return result;
};

export const searchLocationsApi = async (
  query: string
): Promise<{ success: boolean; locations?: Array<{ locationCode: string; productCount: number }> }> => {
  // Try local IndexedDB first (instant)
  try {
    const localResults = await searchLocationsLocal(query);
    if (localResults.length > 0) {
      return { success: true, locations: localResults };
    }
  } catch { /* fallback to API */ }
  return apiCall("searchLocations", { query }, { cancelPrevious: true });
};

export const warmupCacheApi = async (
  payload: { locationQuery?: string; productQuery?: string } = {}
): Promise<{ success: boolean; warmed?: { locations: number; products: number }; message?: string }> => {
  return apiCall("warmupCache", payload);
};

// ─── Preload helpers: fire-and-forget data fetching for adjacent pages ───
let preloadedPages: Record<string, boolean> = {};

/** Preload history data so tab switch is instant */
export function preloadHistory(operator: string, filter?: string, operatorName?: string): void {
  const key = `preload:history:${operator}:${filter || "all"}`;
  if (preloadedPages[key]) return;
  preloadedPages[key] = true;
  getHistoryApi(operator, filter, undefined, operatorName).catch(() => {});
  // Reset flag after TTL so it can be preloaded again
  setTimeout(() => { delete preloadedPages[key]; }, 15_000);
}

/** Preload products for a location so input page is instant */
export function preloadProducts(locationCode: string): void {
  const key = `preload:products:${locationCode}`;
  if (preloadedPages[key]) return;
  preloadedPages[key] = true;
  getProductsApi(locationCode).catch(() => {});
  setTimeout(() => { delete preloadedPages[key]; }, 30_000);
}

// ─── Bulk data for client-side search (instant UX) ──────────────────

export const getAllLocationsApi = async (): Promise<{
  success: boolean;
  locations?: Array<{ locationCode: string; productCount: number }>;
}> => {
  // Try local IndexedDB first (instant)
  try {
    const localLocations = await getAllLocationsLocal();
    if (localLocations.length > 0) {
      return { success: true, locations: localLocations };
    }
  } catch { /* fallback to API */ }
  return apiCall("getAllLocations");
};

export const getAllProductsApi = async (): Promise<{
  success: boolean;
  products?: Product[];
}> => {
  // Try local IndexedDB first (instant)
  try {
    const localProducts = await getAllProductsLocal();
    if (localProducts.length > 0) {
      return { success: true, products: localProducts };
    }
  } catch { /* fallback to API */ }
  return apiCall("getAllProducts");
};

export const searchProductsGlobalApi = async (
  query: string
): Promise<{ success: boolean; products?: Array<{ location: string; productName: string; sku: string; batch: string; barcode: string }> }> => {
  // Try local IndexedDB first (instant)
  try {
    const localResults = await searchProductsGlobalLocal(query);
    if (localResults.length > 0) {
      return { success: true, products: localResults };
    }
  } catch { /* fallback to API */ }
  return apiCall("searchProductsGlobal", { query }, { cancelPrevious: true });
};

export const moveProductsApi = async (
  fromLocation: string,
  toLocation: string,
  items?: Array<{ sku: string; batch: string }>
): Promise<{ success: boolean; message?: string; moved?: number; skipped?: number }> => {
  invalidateMemCache("getProducts");
  invalidateMemCache("getAllProducts");
  invalidateMemCache("getAllLocations");
  const result = await apiCall("moveProducts", { fromLocation, toLocation, items: items || [] });
  if (result.success) {
    // Mirror ke cache master lokal agar hasil baca offline tidak basi
    await moveMasterProductsLocal(fromLocation, toLocation, items);
  }
  return result;
};
