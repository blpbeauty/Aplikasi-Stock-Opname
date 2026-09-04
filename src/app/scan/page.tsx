"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import ScannerModal from "@/components/ScannerModal";
import MoveSheet from "@/components/MoveSheet";
import { Dialog, EmptyState, SyncStatusBadge } from "@/components/ui";
import Autocomplete from "@/components/Autocomplete";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  getProductsApi,
  getHistoryApi,
  getAllProductsApi,
  getAllLocationsApi,
  searchLocationsApi,
  searchProductsGlobalApi,
  warmupCacheApi,
} from "@/lib/api";
import { useDataSync } from "@/components/DataSyncProvider";
import {
  MapPinIcon,
  CameraIcon,
  SearchIcon,
  BuildingIcon,
  CheckIcon,
  HourglassIcon,
  ClockIcon,
  ChevronRightIcon,
} from "@/components/icons";
import { Product, HistoryEntry } from "@/lib/types";
import { getCache, setCache } from "@/lib/cache";
import { formatRelativeTime } from "@/lib/format";
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
  const { lastSyncTime } = useDataSync();

  const [locationCode, setLocationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [showLocationScanner, setShowLocationScanner] = useState(false);

  // Statistics state
  const [stats, setStats] = useState({
    total: 0,
    scannedCount: 0,
    pending: 0,
    progress: 0,
  });
  const [pendingLocations, setPendingLocations] = useState<LocationResult[]>([]);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [locationsLoaded, setLocationsLoaded] = useState(false);

  // Recent scans
  const [recentScans, setRecentScans] = useState<
    Array<{ location: string; time: string; count: number }>
  >([]);

  // Product Finder state
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<GlobalProductItem[]>([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [showProductScanner, setShowProductScanner] = useState(false);

  // Quick move product state
  const [moveItem, setMoveItem] = useState<GlobalProductItem | null>(null);

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
      setPendingLocations(locations.filter((l) => !scannedLocations.has(l.locationCode)));
      setLocationsLoaded(true);

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
        user?.email ? getHistoryApi(user.email, undefined, false, user?.name) : Promise.resolve({ success: false, history: [] }),
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
      setLocationsLoaded(true);
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

  const resolveLocations = useCallback(async (query: string) => {
    const q = query.trim();
    if (allLocationsRef.current) {
      const filtered = allLocationsRef.current
        .filter((l) => l.locationCode.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 10);
      if (filtered.length > 0) return filtered;
    }
    try {
      const result = await searchLocationsApi(q);
      return result.success && result.locations ? result.locations.slice(0, 10) : [];
    } catch {
      return [];
    }
  }, []);

  const openLocation = async (locCode: string) => {
    const code = locCode.trim();
    if (!code) {
      toast.error("Masukkan kode lokasi");
      return;
    }
    setLoading(true);
    try {
      const result = await getProductsApi(code);
      if (result.success && result.products) {
        setCache(`products:${code}`, result.products);
        router.push(`/input?location=${encodeURIComponent(code)}`);
      } else {
        toast.error(result.message || "Lokasi tidak ditemukan");
        setLoading(false);
      }
    } catch {
      toast.error("Terjadi kesalahan saat membuka lokasi");
      setLoading(false);
    }
  };

  const handleLocationScan = (barcode: string) => {
    setShowLocationScanner(false);
    setLocationCode(barcode);
    openLocation(barcode);
  };

  // Product Finder
  const handleProductSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setProductResults([]);
      return;
    }
    setProductSearchLoading(true);
    try {
      const result = await searchProductsGlobalApi(q);
      setProductResults(result.success && result.products ? result.products : []);
    } catch (error) {
      console.error("Product search error:", error);
      setProductResults([]);
    } finally {
      setProductSearchLoading(false);
    }
  }, []);

  const handleProductBarcodeScan = (barcode: string) => {
    setShowProductScanner(false);
    setProductQuery(barcode);
    handleProductSearch(barcode);
  };

  const openQuickMove = (item: GlobalProductItem) => {
    setMoveItem(item);
  };

  const lastSyncLabel = useMemo(() => {
    if (!lastSyncTime) return null;
    return `Sinkron ${formatRelativeTime(new Date(lastSyncTime).toISOString())}`;
  }, [lastSyncTime]);

  return (
    <div className="mobile-container pb-32">
      {/* ── Header + status sinkronisasi ── */}
      <header className="bg-paper px-4 sm:px-6 pt-5 pb-4 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-text-primary leading-tight">
              Stock Opname
            </h1>
            <p className="text-meta text-text-secondary mt-0.5">
              Halo, {user?.name?.split(" ")[0] || "Operator"} — cari atau pindai lokasi untuk mulai menghitung.
            </p>
          </div>
          <SyncStatusBadge />
        </div>
      </header>

      <div className="px-4 sm:px-6 pt-4 space-y-6">
        {/* ── Tindakan utama: cari / pindai lokasi ── */}
        <section aria-label="Buka lokasi">
          <div className="flex gap-2 items-end">
            <Autocomplete<LocationResult>
              id="scan-location-input"
              label="Cari atau pindai lokasi"
              value={locationCode}
              onValueChange={setLocationCode}
              resolve={resolveLocations}
              getKey={(l) => l.locationCode}
              renderItem={(l) => (
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <MapPinIcon className="w-4 h-4 text-text-secondary shrink-0" />
                    <span className="font-bold text-text-primary uppercase">{l.locationCode}</span>
                  </span>
                  <span className="text-meta text-text-secondary shrink-0">{l.productCount} produk</span>
                </span>
              )}
              onSelect={(l) => openLocation(l.locationCode)}
              placeholder="Contoh: A-01-03"
              uppercase
              minChars={1}
              emptyText="Lokasi tidak ditemukan di Master Data"
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => setShowLocationScanner(true)}
              className="tap w-12 h-12 shrink-0 rounded-input bg-primary text-ivory flex items-center justify-center active:scale-95 transition"
              aria-label="Pindai barcode lokasi dengan kamera"
              title="Pindai barcode lokasi"
            >
              <CameraIcon className="w-5 h-5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => openLocation(locationCode)}
            disabled={!locationCode.trim() || loading}
            className="mt-2 w-full min-h-touch bg-primary text-ivory rounded-input font-bold text-meta disabled:opacity-40 active:scale-[0.98] transition"
          >
            Buka Lokasi
          </button>

          {loading && (
            <p className="mt-2 flex items-center justify-center gap-2 text-meta text-text-secondary" role="status">
              <LoadingSpinner /> Membuka lokasi…
            </p>
          )}
        </section>

        {/* ── Progres opname (label jujur: rentang data riwayat) ── */}
        <section aria-label="Progres opname" className="rail rail-espresso">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-bold text-text-primary">Progres Opname</h2>
            <span className="text-2xl font-bold text-text-primary tnum">{stats.progress}%</span>
          </div>
          <p className="text-meta text-text-secondary mt-0.5">
            {stats.scannedCount} dari {stats.total} lokasi pernah dihitung
            {stats.total > 0 && " — seluruh riwayat tersimpan, bukan hanya hari ini"}
          </p>
          <div
            className="mt-2 w-full h-3 bg-surface-warm rounded-full overflow-hidden border border-border-subtle"
            role="progressbar"
            aria-valuenow={stats.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progres opname ${stats.progress} persen`}
          >
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.max(stats.progress, stats.progress > 0 ? 4 : 0)}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-paper rounded-card border border-border p-3 text-center">
              <BuildingIcon className="w-4 h-4 mx-auto text-text-secondary" aria-hidden="true" />
              <p className="text-lg font-bold text-text-primary tnum mt-1">{stats.total}</p>
              <p className="text-meta text-text-secondary">Total Lokasi</p>
            </div>
            <div className="bg-paper rounded-card border border-border p-3 text-center">
              <CheckIcon className="w-4 h-4 mx-auto text-success" aria-hidden="true" />
              <p className="text-lg font-bold text-text-primary tnum mt-1">{stats.scannedCount}</p>
              <p className="text-meta text-text-secondary">Selesai</p>
            </div>
            <button
              type="button"
              onClick={() => setShowPendingModal(true)}
              disabled={stats.pending === 0}
              className="bg-paper rounded-card border border-border p-3 text-center transition active:scale-95 disabled:active:scale-100 disabled:opacity-60"
              aria-label={`Lihat daftar ${stats.pending} lokasi yang belum dihitung`}
            >
              <HourglassIcon className="w-4 h-4 mx-auto text-danger" aria-hidden="true" />
              <p className="text-lg font-bold text-danger tnum mt-1">{stats.pending}</p>
              <p className="text-meta text-text-secondary">
                {stats.pending > 0 ? "Belum dihitung" : "Belum dihitung"}
              </p>
            </button>
          </div>
        </section>

        {/* ── Terakhir dikerjakan ── */}
        <section aria-label="Terakhir dikerjakan">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-1.5">
              <ClockIcon className="w-5 h-5 text-text-secondary" aria-hidden="true" /> Terakhir Dikerjakan
            </h2>
            <button
              onClick={() => router.push("/history")}
              className="text-meta font-bold text-primary hover:underline min-h-touch"
            >
              Lihat semua
            </button>
          </div>

          {recentScans.length === 0 ? (
            <EmptyState
              icon={<ClockIcon className="w-6 h-6" />}
              title="Belum ada aktivitas opname"
              description="Mulai dengan mencari atau memindai lokasi di atas."
            />
          ) : (
            <ul className="bg-paper rounded-card border border-border divide-y divide-border-subtle overflow-hidden">
              {recentScans.map((item, idx) => (
                <li key={`${item.location}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => openLocation(item.location)}
                    className="w-full min-h-touch px-4 py-3 flex items-center justify-between text-left hover:bg-primary-pale/40 transition"
                    aria-label={`Buka lokasi ${item.location}`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-label bg-surface-warm text-primary flex items-center justify-center shrink-0">
                        <MapPinIcon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-meta font-bold text-text-primary uppercase break-all">
                          {item.location}
                        </span>
                        <span className="block text-meta text-text-secondary tnum">
                          {item.count} item dihitung
                        </span>
                      </span>
                    </span>
                    <span className="text-meta text-text-secondary shrink-0 ml-2 flex items-center gap-1">
                      {formatRelativeTime(item.time)}
                      <ChevronRightIcon className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Cari & pindah produk ── */}
        <section aria-label="Cari posisi produk" className="rail rail-ochre">
          <h2 className="text-lg font-bold text-text-primary">Cari Posisi Produk</h2>
          <p className="text-meta text-text-secondary mt-0.5 mb-2">
            Cari di seluruh gudang berdasarkan nama, SKU, atau barcode.
          </p>

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label htmlFor="scan-product-input" className="sr-only">
                Cari produk
              </label>
              <input
                id="scan-product-input"
                type="text"
                value={productQuery}
                onChange={(e) => {
                  setProductQuery(e.target.value);
                  handleProductSearch(e.target.value);
                }}
                placeholder="Nama produk, SKU, atau barcode…"
                className="w-full min-h-touch px-3 bg-surface-warm border border-border rounded-input text-base2 font-semibold text-text-primary focus:bg-paper"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowProductScanner(true)}
              className="tap w-12 h-12 shrink-0 rounded-input bg-surface-warm border border-border text-primary flex items-center justify-center active:scale-95 transition"
              aria-label="Pindai barcode produk dengan kamera"
              title="Pindai barcode produk"
            >
              <CameraIcon className="w-5 h-5" />
            </button>
          </div>

          {productSearchLoading && (
            <p className="mt-2 flex items-center justify-center gap-2 text-meta text-text-secondary" role="status">
              <LoadingSpinner /> Mencari produk…
            </p>
          )}

          {productResults.length > 0 && (
            <ul className="mt-3 divide-y divide-border-subtle max-h-72 overflow-y-auto">
              {productResults.map((item, idx) => (
                <li key={`${item.sku}-${item.batch}-${idx}`} className="py-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-meta font-bold text-text-primary leading-snug line-clamp-2">
                      {item.productName}
                    </p>
                    <p className="text-meta text-text-secondary mt-0.5 tnum">
                      SKU <strong className="text-text-primary">{item.sku}</strong>
                      {item.batch ? ` · Batch ${item.batch}` : ""}
                    </p>
                    <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 bg-primary-pale text-primary rounded-label font-bold text-meta tnum">
                      <MapPinIcon className="w-3.5 h-3.5" aria-hidden="true" /> {item.location}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openLocation(item.location)}
                      className="min-h-touch px-3 bg-surface-warm hover:bg-primary-pale text-text-primary rounded-label text-meta font-bold border border-border"
                      aria-label={`Buka lokasi ${item.location}`}
                    >
                      Buka
                    </button>
                    <button
                      type="button"
                      onClick={() => openQuickMove(item)}
                      className="min-h-touch px-3 bg-primary text-ivory rounded-label text-meta font-bold"
                      aria-label={`Pindah ${item.productName} ke lokasi lain`}
                    >
                      Pindah
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {productQuery.trim().length >= 2 && !productSearchLoading && productResults.length === 0 && (
            <EmptyState
              icon={<SearchIcon className="w-6 h-6" />}
              title="Produk tidak ditemukan"
              description="Coba kata kunci lain, atau pindai barcode produknya."
            />
          )}
        </section>

        {lastSyncLabel && (
          <p className="text-meta text-text-secondary text-center pb-2">
            Data tersimpan di perangkat · {lastSyncLabel}
          </p>
        )}
      </div>

      {/* ── Quick move sheet (produk dari pencarian) ── */}
      <MoveSheet
        isOpen={!!moveItem}
        onClose={() => setMoveItem(null)}
        fromLocation={moveItem?.location || ""}
        items={
          moveItem
            ? [{ sku: moveItem.sku, batch: moveItem.batch, productName: moveItem.productName }]
            : []
        }
      />

      {/* ── Scanner modal (lokasi) ── */}
      <ScannerModal
        isOpen={showLocationScanner}
        onClose={() => setShowLocationScanner(false)}
        onScan={handleLocationScan}
        title="Pindai Barcode Lokasi"
      />

      {/* ── Scanner modal (produk) ── */}
      <ScannerModal
        isOpen={showProductScanner}
        onClose={() => setShowProductScanner(false)}
        onScan={handleProductBarcodeScan}
        title="Pindai Barcode Produk"
      />

      {/* ── Lokasi belum dihitung ── */}
      <Dialog
        isOpen={showPendingModal}
        onClose={() => setShowPendingModal(false)}
        title="Lokasi Belum Dihitung"
        description={`${pendingLocations.length} lokasi tersisa dari ${stats.total}`}
        footer={
          <button
            type="button"
            onClick={() => setShowPendingModal(false)}
            className="w-full min-h-touch bg-surface-warm rounded-input text-meta font-bold text-text-primary"
          >
            Tutup
          </button>
        }
      >
        {pendingLocations.length === 0 ? (
          <EmptyState
            icon={<CheckIcon className="w-6 h-6" />}
            title="Semua lokasi sudah dihitung"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {pendingLocations.map((loc) => (
              <li key={loc.locationCode} className="flex items-center justify-between gap-2 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-9 h-9 rounded-label bg-danger-bg text-danger flex items-center justify-center shrink-0">
                    <MapPinIcon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-meta font-bold text-text-primary uppercase break-all leading-snug">
                      {loc.locationCode}
                    </p>
                    <p className="text-meta text-text-secondary tnum">{loc.productCount} produk terdaftar</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowPendingModal(false);
                    openLocation(loc.locationCode);
                  }}
                  className="shrink-0 min-h-touch px-4 bg-primary text-ivory rounded-label text-meta font-bold active:scale-95 transition"
                >
                  Buka
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      <BottomNav activePage="scan" />
    </div>
  );
}
