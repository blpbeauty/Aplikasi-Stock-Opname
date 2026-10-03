"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import ScannerModal from "@/components/ScannerModal";
import MoveSheet from "@/components/MoveSheet";
import { Dialog, EmptyState } from "@/components/ui";
import Autocomplete from "@/components/Autocomplete";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  getProductsApi,
  getHistoryApi,
  getAllProductsApi,
  getAllLocationsApi,
  searchLocationsApi,
  searchProductsGlobalApi,
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
  TrashIcon,
} from "@/components/icons";
import ConfirmModal from "@/components/ConfirmModal";
import { InputDraft, listDrafts, removeDraft, clearAllDrafts } from "@/lib/drafts";
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
  const { lastSyncTime, isReady } = useDataSync();

  const [locationCode, setLocationCode] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [drafts, setDrafts] = useState<InputDraft[]>([]);
  const [confirmResetDrafts, setConfirmResetDrafts] = useState(false);
  const [draftToDelete, setDraftToDelete] = useState<string | null>(null);
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
  const productSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Quick move product state
  const [moveItem, setMoveItem] = useState<GlobalProductItem | null>(null);

  const allLocationsRef = useRef<LocationResult[] | null>(null);
  const allProductsRef = useRef<Product[] | null>(null);

  const calculateStats = useCallback(
    (locations: LocationResult[], history: HistoryEntry[]) => {
      const scannedLocations = new Set(history.map((h) => h.location));
      const total = locations.length;
      const scannedCount = locations.filter((location) => scannedLocations.has(location.locationCode)).length;
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
    if (!isReady) return;
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
  }, [isReady, lastSyncTime]);

  useEffect(() => {
    if (isReady) loadDashboardData();
  }, [loadDashboardData, lastSyncTime, isReady]);

  const resolveLocations = useCallback(async (query: string) => {
    const q = query.trim();
    if (allLocationsRef.current) {
      const filtered = allLocationsRef.current
        .filter((l) => l.locationCode.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 10);
      return filtered;
    }
    try {
      const result = await searchLocationsApi(q);
      return result.success && result.locations ? result.locations.slice(0, 10) : [];
    } catch {
      return [];
    }
  }, []);

  const openLocation = async (locCode: string) => {
    const code = locCode.trim().toUpperCase();
    if (!code) {
      toast.error("Masukkan kode lokasi");
      return;
    }
    setLoading(true);
    try {
      const result = await getProductsApi(code);
      if (result.success && result.products && result.products.length === 0) {
        setNewLocation(code);
        setShowNewLocation(true);
        setLoading(false);
      } else if (result.success && result.products) {
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

  const handleProductSearchDebounced = useCallback(
    (query: string) => {
      if (productSearchTimerRef.current) clearTimeout(productSearchTimerRef.current);
      productSearchTimerRef.current = setTimeout(() => handleProductSearch(query), 300);
    },
    [handleProductSearch]
  );

  const handleProductBarcodeScan = (barcode: string) => {
    setShowProductScanner(false);
    setProductQuery(barcode);
    handleProductSearch(barcode);
  };

  const openQuickMove = (item: GlobalProductItem) => {
    setMoveItem(item);
  };

  const handleResetAllDrafts = () => {
    if (!user?.email) return;
    clearAllDrafts(user.email);
    setDrafts([]);
    window.dispatchEvent(new Event("storage"));
    toast.success("Semua draft hitungan telah direset");
    setConfirmResetDrafts(false);
  };

  const handleDeleteSingleDraft = () => {
    if (!user?.email || !draftToDelete) return;
    removeDraft(user.email, draftToDelete);
    setDrafts(listDrafts(user.email));
    window.dispatchEvent(new Event("storage"));
    toast.success(`Draft lokasi ${draftToDelete} dihapus`);
    setDraftToDelete(null);
  };

  useEffect(() => {
    const refresh = () => setDrafts(user?.email ? listDrafts(user.email) : []);
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [user?.email, isReady]);

  return (
    <div className="mobile-container pb-32">
      {/* ── Compact Header ── */}
      <header className="history-hero-compact">
        <div className="flex items-center justify-between gap-2">
          <h1>Scan Lokasi<span>.</span></h1>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-paper/10 border border-paper/15 text-meta font-bold text-ivory">
            <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
            <span>{user?.name?.split(" ")[0] || "Operator"}</span>
          </div>
        </div>
        <div className="compact-stats" aria-label="Ringkasan cakupan lokasi">
          <span><strong>{stats.total}</strong> lokasi</span>
          <span>·</span>
          <span><strong>{stats.scannedCount}</strong> selesai</span>
          <span>·</span>
          <span><strong className="stat-accent">{stats.pending}</strong> pending</span>
        </div>
      </header>

      <div className="px-3.5 sm:px-4 pt-3.5 space-y-4">
        {/* Drafts */}
        {drafts.length > 0 && (
          <section className="rounded-2xl border border-primary/25 bg-primary-pale p-3 space-y-2.5" aria-label="Draft hitungan">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-meta font-bold text-text-primary">Hitungan belum disimpan ({drafts.length}):</h2>
              <button
                type="button"
                onClick={() => setConfirmResetDrafts(true)}
                className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 min-h-touch text-meta font-bold text-danger hover:underline px-3 rounded-input bg-danger-bg/70 border border-danger/25 transition active:scale-95"
              >
                <TrashIcon className="w-4 h-4" />
                <span>Reset Semua</span>
              </button>
            </div>
            <div className="space-y-1.5">
              {drafts.slice(0, 5).map((draft) => (
                <div
                  key={draft.location}
                  className="flex items-center gap-2 rounded-xl border border-border bg-paper p-1.5 pr-1.5 transition hover:border-primary/40"
                >
                  <button
                    type="button"
                    className="flex-1 min-w-0 min-h-touch text-left px-2 py-1 text-meta"
                    onClick={() => router.push(`/input?location=${encodeURIComponent(draft.location)}`)}
                  >
                    <span className="block text-meta text-text-secondary">Lanjutkan draft</span>
                    <span className="block font-mono text-base2 font-bold text-text-primary whitespace-nowrap">{draft.location}</span>
                    <span className="block text-meta text-text-secondary">
                      {Object.values(draft.counted).filter(Boolean).length} produk · {formatRelativeTime(new Date(draft.updatedAt).toISOString())}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftToDelete(draft.location)}
                    title={`Hapus draft ${draft.location}`}
                    aria-label={`Hapus draft lokasi ${draft.location}`}
                    className="tap shrink-0 flex items-center justify-center rounded-input text-text-secondary hover:text-danger hover:bg-danger-bg transition"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Buka Lokasi Card ── */}
        <section aria-label="Buka lokasi" className="relative z-30 bg-paper border border-border rounded-2xl p-3.5 shadow-card space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-meta font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
              <MapPinIcon className="w-3.5 h-3.5 text-primary" />
              Pilih / Pindai Lokasi
            </h2>
          </div>

          <div className="flex gap-2 items-center">
            <Autocomplete<LocationResult>
              id="scan-location-input"
              label="Cari atau pindai lokasi"
              value={locationCode}
              onValueChange={setLocationCode}
              resolve={resolveLocations}
              getKey={(l) => l.locationCode}
              renderItem={(l) => (
                <div className="w-full min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPinIcon className="w-4 h-4 text-text-secondary shrink-0" />
                    <span className="font-mono text-base2 font-bold text-text-primary uppercase whitespace-nowrap">
                      {l.locationCode}
                    </span>
                  </div>
                  <span className="block pl-6 text-meta text-text-secondary">{l.productCount} produk</span>
                </div>
              )}
              onSelect={(l) => openLocation(l.locationCode)}
              placeholder="Contoh: A01-B02"
              uppercase
              minChars={1}
              emptyText="Lokasi tidak ditemukan di Master Data"
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => setShowLocationScanner(true)}
              className="w-11 h-11 shrink-0 rounded-xl bg-primary text-ivory flex items-center justify-center active:scale-95 transition"
              aria-label="Pindai barcode lokasi"
              title="Pindai barcode lokasi"
            >
              <CameraIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => openLocation(locationCode)}
              disabled={!locationCode.trim() || loading}
              className="flex-1 min-h-touch py-2.5 bg-primary text-ivory rounded-xl font-bold text-base2 disabled:opacity-[.55] disabled:cursor-not-allowed disabled:active:scale-100 active:scale-[0.98] transition"
            >
              Buka Lokasi
            </button>
            <button
              type="button"
              className="min-h-touch py-2.5 px-4 border border-border bg-surface-warm text-text-primary rounded-xl font-bold text-base2 whitespace-nowrap hover:bg-primary-pale transition"
              onClick={() => {
                setNewLocation(locationCode.trim().toUpperCase());
                setShowNewLocation(true);
              }}
            >
              + Baru
            </button>
          </div>

          {loading && (
            <p className="flex items-center justify-center gap-2 text-meta text-text-secondary pt-1" role="status">
              <LoadingSpinner /> Membuka lokasi…
            </p>
          )}
        </section>

        {/* ── Progress Opname Card ── */}
        <section aria-label="Progres opname" className="bg-paper border border-border rounded-2xl p-3.5 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-meta font-bold text-text-primary">Cakupan Lokasi Opname</h2>
              <p className="text-meta text-text-secondary">
                {stats.scannedCount} dari {stats.total} lokasi tercatat
              </p>
            </div>
            <div className="px-2.5 py-1 bg-primary-pale border border-primary/20 rounded-lg text-primary font-black text-meta">
              {stats.progress}%
            </div>
          </div>

          <div className="w-full h-2.5 bg-surface-warm rounded-full overflow-hidden border border-border-subtle p-0.5">
            <div
              className="h-full w-full origin-left bg-primary rounded-full transition-transform duration-500"
              style={{ transform: `scaleX(${Math.max(stats.progress, stats.progress > 0 ? 4 : 0) / 100})` }}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 text-meta pt-2 border-t border-border-subtle">
            <span className="text-text-secondary">
              Pending: <strong className="text-danger font-bold">{stats.pending} lokasi</strong>
            </span>
            {stats.pending > 0 && (
              <button
                type="button"
                onClick={() => setShowPendingModal(true)}
                className="inline-flex items-center whitespace-nowrap min-h-touch px-1 text-primary font-bold hover:underline"
              >
                Lihat daftar pending →
              </button>
            )}
          </div>
        </section>

        {/* ── Terakhir Dikerjakan ── */}
        <section aria-label="Terakhir dikerjakan" className="bg-paper border border-border rounded-2xl p-3.5 shadow-card">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <h2 className="text-meta font-bold text-text-primary flex items-center gap-1.5">
              <ClockIcon className="w-4 h-4 text-text-secondary" /> Terakhir Dikerjakan
            </h2>
            <button
              onClick={() => router.push("/history")}
              className="inline-flex shrink-0 items-center whitespace-nowrap min-h-touch px-1 text-meta font-bold text-primary hover:underline"
            >
              Lihat semua →
            </button>
          </div>

          {recentScans.length === 0 ? (
            <p className="text-meta text-text-secondary text-center py-3">Belum ada aktivitas opname</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {recentScans.map((item, idx) => (
                <li key={`${item.location}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => openLocation(item.location)}
                    className="w-full min-h-touch py-2.5 flex items-center justify-between text-left hover:bg-primary-pale/30 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-surface-warm text-primary flex items-center justify-center shrink-0">
                        <MapPinIcon className="w-4 h-4" />
                      </span>
                      <div>
                        <span className="block font-mono text-base2 font-bold text-text-primary uppercase">
                          {item.location}
                        </span>
                        <span className="block text-meta text-text-secondary">
                          {item.count} item · {formatRelativeTime(item.time)}
                        </span>
                      </div>
                    </div>
                    <ChevronRightIcon className="w-4 h-4 text-text-secondary shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Cari Posisi Produk ── */}
        <section aria-label="Cari posisi produk" className="bg-paper border border-border rounded-2xl p-3.5 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-meta font-bold text-text-primary flex items-center gap-1.5">
              <SearchIcon className="w-4 h-4 text-primary" /> Cari Posisi Produk
            </h2>
          </div>

          <div className="flex gap-2 items-center">
            <input
              id="scan-product-input"
              type="text"
              value={productQuery}
              onChange={(e) => {
                setProductQuery(e.target.value);
                handleProductSearchDebounced(e.target.value);
              }}
              placeholder="Ketik nama produk, SKU, barcode…"
              className="flex-1 min-h-touch py-2 px-3 bg-surface-warm border border-border rounded-xl text-base2 font-semibold text-text-primary focus:bg-paper focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => setShowProductScanner(true)}
              className="w-11 h-11 shrink-0 rounded-xl bg-surface-warm border border-border text-primary flex items-center justify-center active:scale-95 transition"
              aria-label="Pindai barcode produk"
              title="Pindai barcode produk"
            >
              <CameraIcon className="w-4 h-4" />
            </button>
          </div>

          {productSearchLoading && (
            <p className="mt-2 flex items-center justify-center gap-2 text-meta text-text-secondary" role="status">
              <LoadingSpinner /> Mencari produk…
            </p>
          )}

          {productResults.length > 0 && (
            <ul className="mt-2.5 divide-y divide-border-subtle max-h-56 overflow-y-auto">
              {productResults.map((item, idx) => (
                <li key={`${item.sku}-${item.batch}-${idx}`} className="py-2.5 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-base2 font-bold text-text-primary truncate">{item.productName}</p>
                    <p className="text-meta text-text-secondary mt-0.5">
                      SKU: <strong className="text-text-primary">{item.sku}</strong> | Batch: {item.batch || "—"}
                    </p>
                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-primary-pale text-primary text-meta font-bold font-mono whitespace-nowrap">
                      <MapPinIcon className="w-3.5 h-3.5" /> {item.location}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => openLocation(item.location)}
                      className="min-h-touch px-3 bg-surface-warm border border-border rounded-lg text-meta font-bold text-text-primary hover:bg-primary-pale"
                    >
                      Buka
                    </button>
                    <button
                      type="button"
                      onClick={() => openQuickMove(item)}
                      className="min-h-touch px-3 bg-primary text-ivory rounded-lg text-meta font-bold hover:bg-primary-light"
                    >
                      Pindah
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── Modals & Sheets ── */}
      <ScannerModal
        isOpen={showLocationScanner}
        onClose={() => setShowLocationScanner(false)}
        onScan={handleLocationScan}
        title="Pindai Barcode Lokasi"
      />

      <ScannerModal
        isOpen={showProductScanner}
        onClose={() => setShowProductScanner(false)}
        onScan={handleProductBarcodeScan}
        title="Pindai Barcode Produk"
      />

      {moveItem && (
        <MoveSheet
          isOpen={!!moveItem}
          onClose={() => setMoveItem(null)}
          fromLocation={moveItem.location}
          items={[
            {
              sku: moveItem.sku,
              batch: moveItem.batch,
              productName: moveItem.productName,
            },
          ]}
          onMoved={() => {
            if (productQuery.trim().length >= 2) {
              handleProductSearch(productQuery);
            }
          }}
        />
      )}

      {/* Modal Daftar Pending */}
      <Dialog
        isOpen={showPendingModal}
        onClose={() => setShowPendingModal(false)}
        title={`Lokasi Belum Dicatat (${pendingLocations.length})`}
      >
        <div className="max-h-[60dvh] overflow-y-auto divide-y divide-border-subtle">
          {pendingLocations.map((loc) => (
            <button
              key={loc.locationCode}
              type="button"
              onClick={() => {
                setShowPendingModal(false);
                openLocation(loc.locationCode);
              }}
              className="w-full min-h-touch py-2.5 px-1 flex items-center justify-between gap-2 text-left hover:bg-primary-pale/30 transition"
            >
              <div>
                <span className="block font-mono text-base2 font-bold text-text-primary uppercase">{loc.locationCode}</span>
                <span className="block text-meta text-text-secondary">{loc.productCount} produk terdaftar</span>
              </div>
              <span className="text-meta font-bold text-primary whitespace-nowrap">Buka →</span>
            </button>
          ))}
        </div>
      </Dialog>

      {/* Modal Lokasi Baru */}
      <Dialog
        isOpen={showNewLocation}
        onClose={() => setShowNewLocation(false)}
        title="Buka Lokasi Baru?"
      >
        <div className="space-y-3 text-base2">
          <p className="text-text-secondary">
            Lokasi <strong className="text-text-primary font-bold">&quot;{newLocation}&quot;</strong> belum terdaftar di Master Data. Anda tetap dapat melanjutkan untuk menginput produk ke lokasi ini.
          </p>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowNewLocation(false)}
              className="flex-1 min-h-touch py-2.5 bg-surface-warm border border-border rounded-xl font-bold text-text-primary"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewLocation(false);
                router.push(`/input?location=${encodeURIComponent(newLocation)}`);
              }}
              className="flex-1 min-h-touch py-2.5 bg-primary text-ivory rounded-xl font-bold"
            >
              Lanjutkan
            </button>
          </div>
        </div>
      </Dialog>

      {/* Modal Konfirmasi Reset Semua Draft */}
      <ConfirmModal
        isOpen={confirmResetDrafts}
        title="Reset Semua Draft Hitungan?"
        message="Semua draft hitungan yang belum disimpan di perangkat ini akan dihapus secara permanen. Anda dapat memulai perhitungan baru dari awal."
        confirmText="Ya, Reset Semua"
        cancelText="Batal"
        isDanger
        onConfirm={handleResetAllDrafts}
        onClose={() => setConfirmResetDrafts(false)}
      />

      {/* Modal Konfirmasi Hapus Satu Draft */}
      <ConfirmModal
        isOpen={Boolean(draftToDelete)}
        title={`Hapus Draft ${draftToDelete || ""}?`}
        message={`Draft hitungan untuk lokasi "${draftToDelete || ""}" yang belum disimpan akan dihapus.`}
        confirmText="Hapus Draft"
        cancelText="Batal"
        isDanger
        onConfirm={handleDeleteSingleDraft}
        onClose={() => setDraftToDelete(null)}
      />

      <BottomNav activePage="scan" />
    </div>
  );
}
