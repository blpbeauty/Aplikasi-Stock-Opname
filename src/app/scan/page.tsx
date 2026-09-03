"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useDataSync } from "@/components/DataSyncProvider";
import BarcodeScanner from "@/components/BarcodeScanner";
import BottomNav from "@/components/BottomNav";
import {
  getProductsApi,
  searchLocationsApi,
  warmupCacheApi,
  preloadHistory,
  preloadProducts,
  getAllLocationsApi,
  getHistoryApi,
  searchProductsGlobalApi,
  moveProductsApi,
} from "@/lib/api";
import { getCache, setCache } from "@/lib/cache";
import toast from "react-hot-toast";
import LoadingSpinner from "@/components/LoadingSpinner";
import { HistoryEntry } from "@/lib/types";

type LocationResult = {
  locationCode: string;
  productCount: number;
};

export default function ScanPage() {
  const { user } = useAuth();
  const { syncProgress, forceSync, lastSyncTime } = useDataSync();
  const router = useRouter();
  const [locationCode, setLocationCode] = useState("");
  const [showLocationScanner, setShowLocationScanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchLocationApiDisabled, setSearchLocationApiDisabled] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warmedRef = useRef(false);
  const allLocationsRef = useRef<LocationResult[] | null>(null);
  const [recentHistory, setRecentHistory] = useState<HistoryEntry[]>([]);
  const [totalLocations, setTotalLocations] = useState(0);

  // Product search + move state
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<
    Array<{ location: string; productName: string; sku: string; batch: string; barcode: string }>
  >([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [showProductResults, setShowProductResults] = useState(false);
  const productSearchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Quick move
  const [moveItem, setMoveItem] = useState<{
    location: string;
    sku: string;
    batch: string;
    productName: string;
  } | null>(null);
  const [quickMoveTarget, setQuickMoveTarget] = useState("");
  const [quickMoveSuggestions, setQuickMoveSuggestions] = useState<LocationResult[]>([]);
  const [showQuickMoveSuggestions, setShowQuickMoveSuggestions] = useState(false);
  const [quickMoving, setQuickMoving] = useState(false);
  const quickMoveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const quickMoveRef = useRef<HTMLDivElement>(null);

  const normalizeLocationCode = (value: string) => value.toUpperCase().replace(/\s+/g, "").trim();

  // Compute dashboard stats from data
  const stats = useMemo(() => {
    const uniqueLocations = new Set(recentHistory.map((e) => e.location));
    const scannedCount = uniqueLocations.size;
    const total = Math.max(totalLocations, scannedCount);
    const pending = Math.max(0, total - scannedCount);
    const progress = total > 0 ? Math.round((scannedCount / total) * 100) : 0;

    // Recent scans: group by location, get latest timestamp & item count
    const locationMap = new Map<string, { items: number; timestamp: string; operator: string }>();
    recentHistory.forEach((e) => {
      const existing = locationMap.get(e.location);
      if (!existing) {
        locationMap.set(e.location, { items: 1, timestamp: e.timestamp, operator: e.operator });
      } else {
        existing.items += 1;
        if (new Date(e.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
          existing.timestamp = e.timestamp;
        }
      }
    });

    const recentScans = Array.from(locationMap.entries())
      .map(([loc, data]) => ({ location: loc, ...data }))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);

    return { total, scannedCount, pending, progress, recentScans };
  }, [recentHistory, totalLocations]);

  useEffect(() => {
    if (warmedRef.current) return;
    warmedRef.current = true;

    const loadAllLocations = async () => {
      const cached = getCache<LocationResult[]>("allLocations");
      if (cached && cached.age < 300) {
        allLocationsRef.current = cached.data;
        setTotalLocations(cached.data.length);
      }
      try {
        const result = await getAllLocationsApi();
        if (result.success && result.locations) {
          allLocationsRef.current = result.locations;
          setCache("allLocations", result.locations);
          setTotalLocations(result.locations.length);
        }
      } catch {}
    };
    loadAllLocations();

    // Load recent history for dashboard
    if (user?.email) {
      const cachedHist = getCache<HistoryEntry[]>(`history:${user.email}:all`);
      if (cachedHist) setRecentHistory(cachedHist.data);

      const lastSave = Number(localStorage.getItem("lastSaveTs") || "0");
      const sinceSave = Date.now() - lastSave;
      const refreshDelay = sinceSave < 15_000 ? Math.max(15_000 - sinceSave, 0) : 0;

      setTimeout(() => {
        getHistoryApi(user!.email, undefined)
          .then((res) => {
            if (res.success && res.history) {
              setRecentHistory(res.history);
              setCache(`history:${user!.email}:all`, res.history);
            }
          })
          .catch(() => {});
      }, refreshDelay);
    }

    warmupCacheApi().catch(() => {});
    if (user?.email) preloadHistory(user.email);
    router.prefetch("/input");
  }, [user, router]);

  const handleScan = async (code: string) => {
    if (isSearching) return;
    setIsSearching(true);
    const normalized = normalizeLocationCode(code);
    setLocationCode(normalized);
    setShowLocationScanner(false);
    await searchLocation(normalized);
    setIsSearching(false);
  };

  const handleManualSearch = async () => {
    if (!locationCode.trim()) {
      toast.error("Masukkan kode lokasi");
      return;
    }
    await searchLocation(normalizeLocationCode(locationCode));
  };

  const searchLocation = async (code: string) => {
    if (allLocationsRef.current) {
      const exists = allLocationsRef.current.some(
        (loc) => loc.locationCode.toLowerCase() === code.toLowerCase()
      );
      if (exists) {
        toast.success("Lokasi ditemukan!");
        getProductsApi(code)
          .then((result) => {
            if (result.success && result.products) {
              setCache(`products:${code}`, result.products);
            }
          })
          .catch(() => {});
        router.push(`/input?location=${encodeURIComponent(code)}`);
        return;
      }
    }

    setLoading(true);
    try {
      const result = await getProductsApi(code);
      if (result.success && result.products && result.products.length > 0) {
        setCache(`products:${code}`, result.products);
        toast.success("Lokasi ditemukan!");
        router.push(`/input?location=${encodeURIComponent(code)}`);
      } else {
        toast.error(result.message || "Lokasi tidak ditemukan");
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Koneksi ke server bermasalah. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const handleLocationSearch = (value: string) => {
    const normalized = normalizeLocationCode(value);
    setLocationCode(normalized);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (normalized.length < 1) {
      setLocationResults([]);
      setShowResults(false);
      return;
    }

    if (allLocationsRef.current) {
      const q = normalized.toLowerCase();
      const filtered = allLocationsRef.current
        .filter((loc) => loc.locationCode.toLowerCase().includes(q))
        .slice(0, 15);
      setLocationResults(filtered);
      setShowResults(filtered.length > 0);
      return;
    }

    if (searchLocationApiDisabled) {
      setLocationResults([]);
      setShowResults(false);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const result = await searchLocationsApi(normalized);
        if (result.success && result.locations) {
          setLocationResults(result.locations);
          setShowResults(result.locations.length > 0);
        } else {
          const msg = String((result as any)?.message || "").toLowerCase();
          if (msg.includes("unknown action") || msg.includes("searchlocations")) {
            setSearchLocationApiDisabled(true);
            setShowResults(false);
          }
        }
      } catch (error) {
        console.error("Location search error:", error);
        setShowResults(false);
      } finally {
        setSearchLoading(false);
      }
    }, 80);
  };

  const handleSelectLocation = (loc: LocationResult) => {
    setLocationCode(loc.locationCode);
    setShowResults(false);
    setLocationResults([]);
    preloadProducts(loc.locationCode);
    searchLocation(loc.locationCode);
  };

  const handleProductSearch = (value: string) => {
    setProductQuery(value);
    if (productSearchTimerRef.current) clearTimeout(productSearchTimerRef.current);
    if (value.trim().length < 2) {
      setProductResults([]);
      setShowProductResults(false);
      return;
    }
    productSearchTimerRef.current = setTimeout(async () => {
      setProductSearchLoading(true);
      try {
        const result = await searchProductsGlobalApi(value.trim());
        if (result.success && result.products) {
          setProductResults(result.products);
          setShowProductResults(result.products.length > 0);
        }
      } catch {
        setShowProductResults(false);
      } finally {
        setProductSearchLoading(false);
      }
    }, 250);
  };

  const openQuickMove = (item: {
    location: string;
    sku: string;
    batch: string;
    productName: string;
  }) => {
    setMoveItem(item);
    setQuickMoveTarget("");
    setQuickMoveSuggestions([]);
    setShowQuickMoveSuggestions(false);
  };

  const handleQuickMoveLocSearch = (value: string) => {
    const v = value.toUpperCase().trim();
    setQuickMoveTarget(v);
    if (quickMoveTimerRef.current) clearTimeout(quickMoveTimerRef.current);
    if (!v) {
      setQuickMoveSuggestions([]);
      setShowQuickMoveSuggestions(false);
      return;
    }

    if (allLocationsRef.current) {
      const q = v.toLowerCase();
      const filtered = allLocationsRef.current
        .filter(
          (l) =>
            l.locationCode.toLowerCase().includes(q) &&
            l.locationCode.toUpperCase() !== moveItem?.location.toUpperCase()
        )
        .slice(0, 10);
      setQuickMoveSuggestions(filtered);
      setShowQuickMoveSuggestions(filtered.length > 0);
      return;
    }

    quickMoveTimerRef.current = setTimeout(async () => {
      try {
        const result = await searchLocationsApi(v);
        if (result.success && result.locations) {
          setQuickMoveSuggestions(
            result.locations.filter(
              (l) => l.locationCode.toUpperCase() !== moveItem?.location.toUpperCase()
            )
          );
          setShowQuickMoveSuggestions(true);
        }
      } catch {}
    }, 200);
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
      <div className="bg-white px-5 pt-6 pb-4 border-b border-border shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              BLP Stock Opname
            </span>
            <h1 className="text-lg font-bold text-text-primary mt-0.5">
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
            <span className="text-[11px] font-bold text-primary">
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
              className="w-full pl-10 pr-14 py-3.5 bg-white border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary shadow-card text-sm uppercase font-semibold text-text-primary"
              placeholder="Contoh: A01-B02-C03"
              disabled={loading}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowLocationScanner(true)}
              className="absolute right-2 w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-md active:scale-95 transition"
              title="Buka Kamera Barcode"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

        {/* ── Progress Card ── */}
        <div className="bg-white rounded-2xl p-4.5 shadow-card border border-border">
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <h2 className="text-sm font-bold text-text-primary">Progress Opname Gudang</h2>
              <p className="text-[11px] text-text-secondary">
                {stats.scannedCount} dari {stats.total} lokasi selesai
              </p>
            </div>
            <span className="text-2xl font-black text-primary tracking-tight">
              {stats.progress}%
            </span>
          </div>

          <div className="w-full h-3 bg-surface-warm rounded-full overflow-hidden border border-border-subtle">
            <div
              className="h-full bg-gradient-to-r from-primary to-accent-yellow rounded-full transition-all duration-700"
              style={{ width: `${stats.progress}%` }}
            />
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-white rounded-2xl p-3.5 shadow-card border border-border text-center">
            <div className="w-8 h-8 mx-auto mb-1.5 rounded-xl bg-primary-pale text-primary flex items-center justify-center text-sm">
              🏢
            </div>
            <p className="text-lg font-black text-text-primary">{stats.total}</p>
            <p className="text-[10px] text-text-secondary font-semibold">Total Lokasi</p>
          </div>

          <div className="bg-white rounded-2xl p-3.5 shadow-card border border-border text-center">
            <div className="w-8 h-8 mx-auto mb-1.5 rounded-xl bg-accent-green/10 text-accent-green flex items-center justify-center text-sm">
              ✓
            </div>
            <p className="text-lg font-black text-primary">{stats.scannedCount}</p>
            <p className="text-[10px] text-text-secondary font-semibold">Selesai</p>
          </div>

          <div className="bg-white rounded-2xl p-3.5 shadow-card border border-border text-center">
            <div className="w-8 h-8 mx-auto mb-1.5 rounded-xl bg-accent-red/10 text-accent-red flex items-center justify-center text-sm">
              ⏳
            </div>
            <p className="text-lg font-black text-accent-red">{stats.pending}</p>
            <p className="text-[10px] text-text-secondary font-semibold">Pending</p>
          </div>
        </div>

        {/* ── Cari & Pindah Produk ── */}
        <div className="bg-white rounded-2xl p-4 shadow-card border border-border">
          <h2 className="text-xs font-bold text-text-primary mb-2 flex items-center gap-1.5">
            <span className="text-accent-yellow">📦</span> Cari &amp; Pindah Produk Antar Lokasi
          </h2>
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none"
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
              value={productQuery}
              onChange={(e) => handleProductSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-surface-warm border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white text-text-primary font-medium"
              placeholder="Ketik nama produk, SKU, atau batch..."
              autoComplete="off"
            />
            {productSearchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Product search results */}
          {showProductResults && productResults.length > 0 && (
            <div className="mt-2.5 max-h-56 overflow-y-auto rounded-xl border border-border divide-y divide-border-subtle bg-white">
              {productResults.map((p, idx) => (
                <div
                  key={`${p.location}-${p.sku}-${p.batch}-${idx}`}
                  className="flex items-center justify-between p-2.5 hover:bg-primary-pale/30 transition"
                >
                  <div className="flex-1 min-w-0 mr-2">
                    <p className="text-xs font-bold text-text-primary truncate">{p.productName}</p>
                    <p className="text-[10px] text-text-secondary">
                      SKU: {p.sku}{p.batch ? ` · Batch: ${p.batch}` : ""}
                    </p>
                    <p className="text-[10px] text-primary font-bold mt-0.5">📍 {p.location}</p>
                  </div>
                  <button
                    onClick={() =>
                      openQuickMove({
                        location: p.location,
                        sku: p.sku,
                        batch: p.batch,
                        productName: p.productName,
                      })
                    }
                    className="flex-shrink-0 px-3 py-1.5 bg-primary text-white text-[11px] font-bold rounded-lg hover:bg-primary-light active:scale-95 transition shadow-xs"
                  >
                    Pindah
                  </button>
                </div>
              ))}
            </div>
          )}

          {showProductResults &&
            productResults.length === 0 &&
            !productSearchLoading &&
            productQuery.trim().length >= 2 && (
              <p className="mt-2 text-[11px] text-text-secondary text-center py-2">
                Produk tidak ditemukan
              </p>
            )}
        </div>

        {/* ── Scan Terakhir (Tabel Mobile Ringkas) ── */}
        {stats.recentScans.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-card border border-border">
            <h2 className="text-xs font-bold text-text-primary mb-2.5 flex items-center justify-between">
              <span>Scan Lokasi Terakhir</span>
              <span className="text-[10px] text-text-secondary font-normal">Terbaru</span>
            </h2>
            <div className="overflow-hidden rounded-xl border border-border-subtle">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-warm border-b border-border">
                    <th className="text-left px-3 py-2 font-bold text-text-secondary text-[10px] uppercase">
                      Lokasi
                    </th>
                    <th className="text-right px-3 py-2 font-bold text-text-secondary text-[10px] uppercase w-16">
                      Item
                    </th>
                    <th className="text-right px-3 py-2 font-bold text-text-secondary text-[10px] uppercase w-20">
                      Waktu
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {stats.recentScans.map((scan) => (
                    <tr key={scan.location} className="hover:bg-primary-pale/20 transition">
                      <td className="px-3 py-2.5 font-bold text-text-primary text-xs">
                        {scan.location}
                      </td>
                      <td className="px-3 py-2.5 text-right font-black text-primary">
                        {scan.items}
                      </td>
                      <td className="px-3 py-2.5 text-right text-text-secondary text-[10px]">
                        {formatRelativeTime(scan.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Location Scanner Modal ── */}
      {showLocationScanner && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-4 shadow-2xl border border-border">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="font-bold text-text-primary text-sm">Scan Barcode Lokasi</h3>
              <button
                onClick={() => setShowLocationScanner(false)}
                className="w-8 h-8 rounded-full bg-surface-warm hover:bg-gray-200 flex items-center justify-center text-text-secondary text-xs transition active:scale-95"
              >
                ✕
              </button>
            </div>
            <BarcodeScanner onScan={handleScan} active={showLocationScanner} />
          </div>
        </div>
      )}

      {/* ── Quick Move Modal (Bottom Sheet on Mobile) ── */}
      {moveItem && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setMoveItem(null)}
        >
          <div
            ref={quickMoveRef}
            className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl p-5 shadow-2xl border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-3 sm:hidden" />

            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-text-primary">Pindah Lokasi Produk</h3>
              <button
                onClick={() => setMoveItem(null)}
                className="w-7 h-7 rounded-full bg-surface-warm flex items-center justify-center text-text-secondary text-xs"
              >
                ✕
              </button>
            </div>

            <div className="bg-surface-warm rounded-2xl p-3 mb-3.5 border border-border-subtle">
              <p className="text-xs font-bold text-text-primary">{moveItem.productName}</p>
              <p className="text-[10px] text-text-secondary mt-0.5">
                SKU: {moveItem.sku} {moveItem.batch ? `· Batch: ${moveItem.batch}` : ""}
              </p>
              <p className="text-xs text-primary font-bold mt-1">📍 Asal: {moveItem.location}</p>
            </div>

            <label className="block text-xs font-bold text-text-primary mb-1">
              Lokasi Tujuan:
            </label>
            <div className="relative">
              <input
                type="text"
                value={quickMoveTarget}
                onChange={(e) => handleQuickMoveLocSearch(e.target.value)}
                onFocus={() => {
                  if (quickMoveSuggestions.length > 0) setShowQuickMoveSuggestions(true);
                }}
                className="w-full px-3.5 py-2.5 bg-surface-warm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary uppercase text-sm font-bold"
                placeholder="Ketik lokasi tujuan..."
                autoComplete="off"
              />
              {showQuickMoveSuggestions && quickMoveSuggestions.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg max-h-40 overflow-y-auto">
                  {quickMoveSuggestions.map((loc) => (
                    <button
                      key={loc.locationCode}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setQuickMoveTarget(loc.locationCode);
                        setShowQuickMoveSuggestions(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-primary-pale border-b border-border last:border-b-0 text-xs flex justify-between"
                    >
                      <span className="font-bold text-text-primary">{loc.locationCode}</span>
                      <span className="text-[10px] text-text-secondary">({loc.productCount} produk)</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2.5 mt-5">
              <button
                onClick={() => setMoveItem(null)}
                className="flex-1 py-3 bg-surface-warm text-text-primary text-xs font-bold rounded-xl hover:bg-gray-200 transition"
              >
                Batal
              </button>
              <button
                onClick={executeQuickMove}
                disabled={!quickMoveTarget.trim() || quickMoving}
                className="flex-1 py-3 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-light disabled:opacity-50 transition flex items-center justify-center gap-1.5 shadow-md"
              >
                {quickMoving ? <LoadingSpinner /> : "Pindahkan"}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav activePage="scan" />
    </div>
  );
}
