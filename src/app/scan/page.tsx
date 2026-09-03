"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import BarcodeScanner from "@/components/BarcodeScanner";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  getProductsApi,
  getHistoryApi,
  searchProductsApi,
  searchLocationsApi,
  warmupCacheApi,
  getAllProductsApi,
  getAllLocationsApi,
  searchProductsGlobalApi,
  moveProductsApi,
} from "@/lib/api";
import { useDataSync } from "@/components/DataSyncProvider";
import { Product, HistoryEntry } from "@/lib/types";
import { getCache, setCache } from "@/lib/cache";
import toast from "react-hot-toast";

type LocationResult = {
  locationCode: string;
  productCount: number;
};

type GlobalProductItem = {
  location: string;
  productName: string;
  sku: string;
  batch: string;
  barcode: string;
};

export default function ScanDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const { isReady, syncProgress, lastSyncTime, forceSync } = useDataSync();

  const [locationCode, setLocationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [showLocationScanner, setShowLocationScanner] = useState(false);

  // Search locations state
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTimer, setSearchTimer] = useState<NodeJS.Timeout | null>(null);

  // Statistics state
  const [stats, setStats] = useState({
    total: 0,
    scannedCount: 0,
    pending: 0,
    progress: 0,
  });

  // Recent scans
  const [recentScans, setRecentScans] = useState<
    Array<{ location: string; time: string; count: number }>
  >([]);

  // Product Finder state
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<GlobalProductItem[]>([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [productSearchTimer, setProductSearchTimer] = useState<NodeJS.Timeout | null>(null);
  const [showProductScanner, setShowProductScanner] = useState(false);

  // Quick move product state
  const [moveItem, setMoveItem] = useState<GlobalProductItem | null>(null);
  const [quickMoveTarget, setQuickMoveTarget] = useState("");
  const [quickMoving, setQuickMoving] = useState(false);
  const [quickMoveSuggestions, setQuickMoveSuggestions] = useState<LocationResult[]>([]);
  const [showQuickMoveSuggestions, setShowQuickMoveSuggestions] = useState(false);
  const [quickMoveTimer, setQuickMoveTimer] = useState<NodeJS.Timeout | null>(null);

  const allLocationsRef = useRef<LocationResult[] | null>(null);
  const allProductsRef = useRef<Product[] | null>(null);

  const calculateStats = useCallback(
    (locations: LocationResult[], history: HistoryEntry[]) => {
      const scannedLocations = new Set(history.map((h) => h.location));
      const total = locations.length;
      const scannedCount = scannedLocations.size;
      const pending = Math.max(0, total - scannedCount);
      const progress = total > 0 ? Math.round((scannedCount / total) * 100) : 0;

      setStats({ total, scannedCount, pending, progress });

      const locationMap = new Map<string, { time: string; count: number }>();
      history.forEach((h) => {
        const existing = locationMap.get(h.location);
        if (!existing) {
          locationMap.set(h.location, { time: h.timestamp, count: 1 });
        } else {
          existing.count += 1;
        }
      });

      const recents = Array.from(locationMap.entries())
        .map(([location, data]) => ({ location, time: data.time, count: data.count }))
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, 5);

      setRecentScans(recents);
    },
    []
  );

  const loadDashboardData = useCallback(async () => {
    const cachedLocations = getCache<LocationResult[]>("allLocations");
    const cachedHistory = getCache<HistoryEntry[]>(`history:${user?.email}:all`);

    if (cachedLocations) allLocationsRef.current = cachedLocations.data;

    if (cachedLocations && cachedHistory) {
      calculateStats(cachedLocations.data, cachedHistory.data);
    }

    try {
      const [locationsRes, historyRes] = await Promise.all([
        getAllLocationsApi(),
        user?.email ? getHistoryApi(user.email) : Promise.resolve({ success: false, history: [] }),
      ]);

      let locData = cachedLocations?.data || [];
      let histData = cachedHistory?.data || [];

      if (locationsRes.success && locationsRes.locations) {
        locData = locationsRes.locations;
        allLocationsRef.current = locData;
        setCache("allLocations", locData);
      }

      if (historyRes.success && historyRes.history) {
        histData = historyRes.history;
        if (user?.email) {
          setCache(`history:${user.email}:all`, histData);
        }
      }

      calculateStats(locData, histData);
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    }
  }, [user, calculateStats]);

  useEffect(() => {
    warmupCacheApi().catch(() => {});
    const cached = getCache<Product[]>("allProducts");
    if (cached) allProductsRef.current = cached.data;
    getAllProductsApi()
      .then((res) => {
        if (res.success && res.products) {
          allProductsRef.current = res.products;
          setCache("allProducts", res.products);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleLocationSearch = (query: string) => {
    setLocationCode(query);
    if (searchTimer) clearTimeout(searchTimer);

    if (query.trim().length === 0) {
      setLocationResults([]);
      setShowResults(false);
      return;
    }

    if (allLocationsRef.current) {
      const q = query.trim().toLowerCase();
      const filtered = allLocationsRef.current
        .filter((l) => l.locationCode.toLowerCase().includes(q))
        .slice(0, 10);
      setLocationResults(filtered);
      setShowResults(true);
      return;
    }

    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await searchLocationsApi(query.trim());
        if (result.success && result.locations) {
          setLocationResults(result.locations);
          setShowResults(true);
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setSearchLoading(false);
      }
    }, 150);
    setSearchTimer(timer);
  };

  const handleSelectLocation = (loc: LocationResult) => {
    setLocationCode(loc.locationCode);
    setShowResults(false);
    openLocation(loc.locationCode);
  };

  const handleLocationScan = (barcode: string) => {
    setShowLocationScanner(false);
    setLocationCode(barcode);
    openLocation(barcode);
  };

  const handleManualSearch = () => {
    if (!locationCode.trim()) {
      toast.error("Masukkan kode lokasi");
      return;
    }
    openLocation(locationCode.trim());
  };

  const openLocation = async (locCode: string) => {
    setLoading(true);
    try {
      const result = await getProductsApi(locCode);
      if (result.success && result.products) {
        setCache(`products:${locCode}`, result.products);
        router.push(`/input?location=${encodeURIComponent(locCode)}`);
      } else {
        toast.error(result.message || "Lokasi tidak ditemukan");
        setLoading(false);
      }
    } catch {
      toast.error("Terjadi kesalahan saat membuka lokasi");
      setLoading(false);
    }
  };

  // Product Finder
  const handleProductSearch = (query: string) => {
    setProductQuery(query);
    if (productSearchTimer) clearTimeout(productSearchTimer);

    if (query.trim().length < 2) {
      setProductResults([]);
      return;
    }

    setProductSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await searchProductsGlobalApi(query.trim());
        if (result.success && result.products) {
          setProductResults(result.products);
        } else {
          setProductResults([]);
        }
      } catch (error) {
        console.error("Product search error:", error);
      } finally {
        setProductSearchLoading(false);
      }
    }, 200);
    setProductSearchTimer(timer);
  };

  const handleProductBarcodeScan = (barcode: string) => {
    setShowProductScanner(false);
    setProductQuery(barcode);
    handleProductSearch(barcode);
  };

  const openQuickMove = (item: GlobalProductItem) => {
    setMoveItem(item);
    setQuickMoveTarget("");
    setQuickMoveSuggestions([]);
    setShowQuickMoveSuggestions(false);
  };

  const handleQuickMoveTargetSearch = (query: string) => {
    setQuickMoveTarget(query);
    if (quickMoveTimer) clearTimeout(quickMoveTimer);

    if (!query.trim()) {
      setQuickMoveSuggestions([]);
      setShowQuickMoveSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await searchLocationsApi(query.trim());
        if (result.success && result.locations) {
          setQuickMoveSuggestions(
            result.locations.filter(
              (l) => l.locationCode.toUpperCase() !== moveItem?.location.toUpperCase()
            )
          );
          setShowQuickMoveSuggestions(true);
        }
      } catch {}
    }, 250);
    setQuickMoveTimer(timer);
  };

  const executeQuickMove = async () => {
    if (!moveItem || !quickMoveTarget.trim()) return;
    const target = quickMoveTarget.trim().toUpperCase();
    if (target === moveItem.location.toUpperCase()) {
      toast.error("Lokasi tujuan tidak boleh sama");
      return;
    }
    setQuickMoving(true);
    try {
      const result = await moveProductsApi(moveItem.location, target, [
        { sku: moveItem.sku, batch: moveItem.batch },
      ]);
      if (result.success) {
        toast.success(result.message || "Produk berhasil dipindah");
        setMoveItem(null);
        if (productQuery.trim().length >= 2) {
          const refreshed = await searchProductsGlobalApi(productQuery.trim());
          if (refreshed.success && refreshed.products) {
            setProductResults(refreshed.products);
          }
        }
      } else {
        toast.error(result.message || "Gagal memindah");
      }
    } catch {
      toast.error("Gagal memindah produk");
    } finally {
      setQuickMoving(false);
    }
  };

  const formatRelativeTime = (ts: string) => {
    try {
      const date = new Date(ts);
      if (isNaN(date.getTime())) {
        const m = ts.match(/(\d{1,2})\s+(\w+)\s+(\d{4})\s+(\d{1,2}):(\d{2})/);
        if (!m) return ts;
        const months: Record<string, number> = {
          Jan: 0, Feb: 1, Mar: 2, Apr: 3, Mei: 4, May: 4, Jun: 5, Jul: 6,
          Agu: 7, Aug: 7, Sep: 8, Okt: 9, Oct: 9, Nov: 10, Des: 11, Dec: 11,
        };
        const d = new Date(+m[3], months[m[2]] ?? 0, +m[1], +m[4], +m[5]);
        if (isNaN(d.getTime())) return ts;
        return formatRelativeFromDate(d);
      }
      return formatRelativeFromDate(date);
    } catch {
      return ts;
    }
  };

  const formatRelativeFromDate = (date: Date) => {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return "Baru saja";
    if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} hari lalu`;
    return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  };

  return (
    <div className="mobile-container pb-28">
      {/* ── Top Header ── */}
      <div className="bg-white px-5 pt-5 pb-4 border-b border-border shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              BLP Stock Opname
            </span>
            <h1 className="text-base font-bold text-text-primary mt-0.5 leading-tight">
              Halo, {user?.name?.split(" ")[0] || "Operator"} 👋
            </h1>
          </div>

          {/* Sync status badge */}
          <button
            type="button"
            onClick={() => {
              forceSync();
              toast.success("Memulai sinkronisasi...");
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-pale rounded-full border border-primary/20 hover:bg-primary/20 transition active:scale-95"
            title={
              lastSyncTime
                ? `Terakhir sync: ${new Date(lastSyncTime).toLocaleTimeString("id-ID")}`
                : "Sinkronisasi"
            }
          >
            <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
            <span className="text-[10px] font-bold text-primary">
              {syncProgress.status === "syncing" ? "SYNC..." : "OFFLINE READY"}
            </span>
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* ── Search Bar Lokasi ── */}
        <div className="relative">
          <label className="block text-xs font-bold text-text-primary mb-1.5">
            Cari / Scan Lokasi Gudang
          </label>
          <div className="relative flex items-center">
            <svg
              className="absolute left-3.5 w-4 h-4 text-text-secondary pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={locationCode}
              onChange={(e) => handleLocationSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
              className="w-full pl-10 pr-14 py-3 bg-white border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary shadow-card text-xs uppercase font-bold text-text-primary"
              placeholder="Contoh: A01-B02-C03"
              disabled={loading}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowLocationScanner(true)}
              className="absolute right-1.5 w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white shadow-md active:scale-95 transition"
              title="Buka Kamera Barcode"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
                <path d="M7 12h10" />
                <path d="M7 9h2M11 9h2M15 9h2M7 15h2M11 15h2M15 15h2" />
              </svg>
            </button>
          </div>

          {/* Search Results Dropdown */}
          {showResults && locationResults.length > 0 && (
            <div className="mt-2 bg-white border border-border rounded-2xl shadow-xl overflow-hidden max-h-56 overflow-y-auto z-20 relative">
              {locationResults.map((loc, index) => (
                <button
                  key={loc.locationCode}
                  onClick={() => handleSelectLocation(loc)}
                  className={`w-full flex items-center justify-between px-4 py-3 hover:bg-primary-pale transition text-left active:bg-primary/10 ${
                    index < locationResults.length - 1 ? "border-b border-border-subtle" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-primary-pale text-primary flex items-center justify-center flex-shrink-0 font-bold text-xs">
                      📍
                    </div>
                    <div>
                      <p className="font-bold text-text-primary text-xs">{loc.locationCode}</p>
                      <p className="text-[10px] text-text-secondary">{loc.productCount} produk terdaftar</p>
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {showResults && locationResults.length === 0 && !searchLoading && locationCode.trim().length >= 1 && (
            <div className="mt-2 bg-white border border-border rounded-2xl p-3 text-center shadow-card">
              <p className="text-xs text-text-secondary">Lokasi tidak ditemukan di Master Data</p>
            </div>
          )}
        </div>

        {/* Loading indicator */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-3 bg-white rounded-2xl border border-border shadow-xs">
            <LoadingSpinner />
            <span className="text-xs text-text-secondary font-medium">Membuka lokasi...</span>
          </div>
        )}

        {/* ── Progress Card (Spacious & Clean) ── */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-card border border-border">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-text-primary tracking-tight leading-snug">
                Progress Opname Gudang
              </h2>
              <p className="text-[11px] text-text-secondary mt-0.5 font-medium">
                {stats.scannedCount} dari {stats.total} lokasi selesai
              </p>
            </div>
            <div className="flex items-baseline gap-0.5 bg-primary-pale px-3 py-1.5 rounded-xl border border-primary/15 flex-shrink-0">
              <span className="text-lg font-black text-primary tracking-tight">{stats.progress}</span>
              <span className="text-xs font-bold text-primary">%</span>
            </div>
          </div>

          <div className="w-full h-3 bg-surface-warm rounded-full overflow-hidden border border-border-subtle p-0.5">
            <div
              className="h-full bg-gradient-to-r from-primary to-accent-yellow rounded-full transition-all duration-700"
              style={{ width: `${Math.max(stats.progress, stats.progress > 0 ? 4 : 0)}%` }}
            />
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-white rounded-2xl p-3.5 shadow-card border border-border text-center">
            <div className="w-7 h-7 mx-auto mb-1 rounded-xl bg-primary-pale text-primary flex items-center justify-center text-xs">
              🏢
            </div>
            <p className="text-base font-black text-text-primary">{stats.total}</p>
            <p className="text-[10px] text-text-secondary font-bold">Total Lokasi</p>
          </div>

          <div className="bg-white rounded-2xl p-3.5 shadow-card border border-border text-center">
            <div className="w-7 h-7 mx-auto mb-1 rounded-xl bg-accent-green/10 text-accent-green flex items-center justify-center text-xs">
              ✓
            </div>
            <p className="text-base font-black text-primary">{stats.scannedCount}</p>
            <p className="text-[10px] text-text-secondary font-bold">Selesai</p>
          </div>

          <div className="bg-white rounded-2xl p-3.5 shadow-card border border-border text-center">
            <div className="w-7 h-7 mx-auto mb-1 rounded-xl bg-accent-red/10 text-accent-red flex items-center justify-center text-xs">
              ⏳
            </div>
            <p className="text-base font-black text-accent-red">{stats.pending}</p>
            <p className="text-[10px] text-text-secondary font-bold">Pending</p>
          </div>
        </div>

        {/* ── Cari & Pindah Produk ── */}
        <div className="bg-white rounded-2xl p-4 shadow-card border border-border">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5">
              <span>🔍</span> Cari Posisi Produk
            </h3>
            <span className="text-[10px] text-text-secondary">Cari di seluruh gudang</span>
          </div>

          <div className="relative flex items-center">
            <input
              type="text"
              value={productQuery}
              onChange={(e) => handleProductSearch(e.target.value)}
              placeholder="Ketik nama produk, SKU, atau barcode..."
              className="w-full pl-3 pr-11 py-2.5 bg-surface-warm border border-border rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white text-text-primary"
            />
            <button
              type="button"
              onClick={() => setShowProductScanner(true)}
              className="absolute right-1.5 w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center text-xs shadow-xs"
              title="Scan Barcode Produk"
            >
              📷
            </button>
          </div>

          {/* Product Results */}
          {productSearchLoading && (
            <div className="flex items-center justify-center py-3 text-xs text-text-secondary gap-1.5">
              <LoadingSpinner />
              <span>Mencari produk...</span>
            </div>
          )}

          {productResults.length > 0 && (
            <div className="mt-3 divide-y divide-border-subtle max-h-52 overflow-y-auto">
              {productResults.map((item, idx) => (
                <div key={`${item.sku}-${item.batch}-${idx}`} className="py-2.5 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-text-primary truncate">{item.productName}</p>
                    <p className="text-[10px] text-text-secondary mt-0.5">
                      SKU: <strong className="text-text-primary">{item.sku}</strong> | Batch: {item.batch || "-"}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="inline-block px-2 py-0.5 bg-primary-pale text-primary rounded-md font-bold text-[10px]">
                        📍 {item.location}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => openLocation(item.location)}
                      className="px-2.5 py-1 bg-surface-warm hover:bg-primary-pale text-text-primary rounded-lg text-[10px] font-bold border border-border"
                    >
                      Buka
                    </button>
                    <button
                      type="button"
                      onClick={() => openQuickMove(item)}
                      className="px-2.5 py-1 bg-primary text-white rounded-lg text-[10px] font-bold shadow-xs hover:bg-primary-light"
                    >
                      Pindah
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {productQuery.trim().length >= 2 && !productSearchLoading && productResults.length === 0 && (
            <p className="text-center text-xs text-text-secondary py-3">Produk tidak ditemukan</p>
          )}
        </div>

        {/* ── Quick Move Modal (Bottom Sheet) ── */}
        {moveItem && (
          <div
            className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setMoveItem(null)}
          >
            <div
              className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl p-5 shadow-2xl border border-border space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto sm:hidden" />
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-text-primary text-sm">Pindah Lokasi Produk</h3>
                <button
                  onClick={() => setMoveItem(null)}
                  className="w-7 h-7 rounded-full bg-surface-warm flex items-center justify-center text-xs text-text-secondary"
                >
                  ✕
                </button>
              </div>

              <div className="bg-surface-warm p-3 rounded-xl border border-border-subtle text-xs space-y-1">
                <p className="font-bold text-text-primary">{moveItem.productName}</p>
                <p className="text-text-secondary text-[11px]">
                  SKU: {moveItem.sku} | Batch: {moveItem.batch}
                </p>
                <p className="text-text-secondary text-[11px]">
                  Lokasi Saat Ini: <strong className="text-primary">{moveItem.location}</strong>
                </p>
              </div>

              <div className="relative">
                <label className="block text-xs font-bold text-text-primary mb-1">
                  Pindah ke Lokasi Tujuan:
                </label>
                <input
                  type="text"
                  value={quickMoveTarget}
                  onChange={(e) => handleQuickMoveTargetSearch(e.target.value)}
                  placeholder="Ketik lokasi tujuan..."
                  className="w-full bg-surface-warm border border-border rounded-xl px-3 py-2.5 text-xs font-bold uppercase focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
                {showQuickMoveSuggestions && quickMoveSuggestions.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg max-h-36 overflow-y-auto">
                    {quickMoveSuggestions.map((loc) => (
                      <button
                        key={loc.locationCode}
                        type="button"
                        onClick={() => {
                          setQuickMoveTarget(loc.locationCode);
                          setShowQuickMoveSuggestions(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-primary-pale border-b border-border last:border-b-0 flex justify-between"
                      >
                        <span className="font-bold text-text-primary">{loc.locationCode}</span>
                        <span className="text-[10px] text-text-secondary">({loc.productCount} produk)</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMoveItem(null)}
                  className="flex-1 py-2.5 bg-surface-warm rounded-xl text-xs font-bold text-text-primary"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={executeQuickMove}
                  disabled={quickMoving || !quickMoveTarget.trim()}
                  className="flex-1 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary-light disabled:opacity-50 shadow-md flex items-center justify-center gap-1"
                >
                  {quickMoving ? <LoadingSpinner /> : "Konfirmasi Pindah"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Riwayat Scan Hari Ini ── */}
        <div className="bg-white rounded-2xl p-4 shadow-card border border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5">
              <span>🕒</span> Riwayat Terakhir
            </h3>
            <button
              onClick={() => router.push("/history")}
              className="text-[11px] font-bold text-primary hover:underline"
            >
              Lihat Semua →
            </button>
          </div>

          {recentScans.length === 0 ? (
            <p className="text-center text-xs text-text-secondary py-3">Belum ada aktivitas opname</p>
          ) : (
            <div className="divide-y divide-border-subtle">
              {recentScans.map((item, idx) => (
                <div
                  key={`${item.location}-${idx}`}
                  className="py-2.5 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-surface-warm text-primary flex items-center justify-center text-xs font-bold">
                      📍
                    </div>
                    <div>
                      <p className="text-xs font-bold text-text-primary">{item.location}</p>
                      <p className="text-[10px] text-text-secondary">{item.count} produk dihitung</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-text-secondary font-medium">
                    {formatRelativeTime(item.time)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Barcode Scanner Modal (Lokasi) */}
      {showLocationScanner && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-4 shadow-2xl border border-border">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="font-bold text-text-primary text-sm">Scan Barcode Lokasi</h3>
              <button
                onClick={() => setShowLocationScanner(false)}
                className="w-8 h-8 rounded-full bg-surface-warm flex items-center justify-center text-text-secondary text-xs"
              >
                ✕
              </button>
            </div>
            <BarcodeScanner onScan={handleLocationScan} active={showLocationScanner} />
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal (Produk Finder) */}
      {showProductScanner && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-4 shadow-2xl border border-border">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="font-bold text-text-primary text-sm">Scan Barcode Produk</h3>
              <button
                onClick={() => setShowProductScanner(false)}
                className="w-8 h-8 rounded-full bg-surface-warm flex items-center justify-center text-text-secondary text-xs"
              >
                ✕
              </button>
            </div>
            <BarcodeScanner onScan={handleProductBarcodeScan} active={showProductScanner} />
          </div>
        </div>
      )}

      <BottomNav activePage="scan" />
    </div>
  );
}
