"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import ScannerModal from "@/components/ScannerModal";
import MoveSheet from "@/components/MoveSheet";
import { Dialog } from "@/components/ui";
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
      const scannedCount = locations.filter((location) =>
        scannedLocations.has(location.locationCode)
      ).length;
      const pending = Math.max(0, total - scannedCount);
      const progress = total > 0 ? Math.round((scannedCount / total) * 100) : 0;

      setStats({ total, scannedCount, pending, progress });
      setPendingLocations(locations.filter((l) => !scannedLocations.has(l.locationCode)));

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
        user?.email
          ? getHistoryApi(user.email, undefined, false, user?.name)
          : Promise.resolve({ success: false, history: [] }),
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
    <div className="max-w-md mx-auto min-h-dvh bg-[#F8FAFC] text-[#0F172A] pb-24 border-x border-slate-200 font-sans antialiased">
      {/* ── 1. Compact Industrial Top Header (~48px, Sticky - Deep Teal) ── */}
      <header className="sticky top-0 z-30 h-12 min-h-[48px] bg-[#0D5C63] text-white border-b border-[#083B40] px-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex flex-col justify-center leading-tight">
          <h1 className="font-mono text-xs font-bold text-white tracking-wider uppercase truncate">
            SO WH CENTRAL
          </h1>
          <span className="font-mono text-[10px] font-semibold text-teal-200/90 tracking-wide uppercase truncate">
            PARAS &amp; PAYU
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="font-mono text-xs text-teal-100 tabular-nums tnum">
            <strong className="font-bold text-white">{stats.scannedCount}</strong>/
            {stats.total}{" "}
            <span className="font-sans text-[11px] text-teal-200/80">Rak</span>
          </div>
          <span className="text-white/25">|</span>
          <div className="flex items-center gap-1.5 text-xs font-medium text-teal-100">
            <span className="w-2 h-2 rounded-full bg-[#4ADE80]" />
            <span className="truncate max-w-[80px]">
              {user?.name?.split(" ")[0] || "Operator"}
            </span>
          </div>
        </div>
      </header>

      <div className="p-3 space-y-3">
        {/* ── 2. Buka / Pindai Lokasi (High-Contrast Utilitarian Panel) ── */}
        <section
          aria-label="Buka lokasi"
          className="relative z-20 bg-white border border-slate-200 rounded p-3 space-y-2"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <MapPinIcon className="w-3.5 h-3.5 text-slate-700" />
              Pilih / Scan Kode Rak
            </h2>
            <span className="font-mono text-[11px] text-slate-500 tabular-nums tnum">
              Pending: <strong className="text-[#DC2626]">{stats.pending}</strong>
            </span>
          </div>

          <div className="flex gap-1.5 items-center">
            <Autocomplete<LocationResult>
              id="scan-location-input"
              label="Cari atau pindai lokasi"
              value={locationCode}
              onValueChange={setLocationCode}
              resolve={resolveLocations}
              getKey={(l) => l.locationCode}
              renderItem={(l) => (
                <div className="w-full min-w-0 flex items-center justify-between py-0.5">
                  <span className="font-mono text-sm font-bold text-slate-900 uppercase tnum">
                    {l.locationCode}
                  </span>
                  <span className="font-mono text-xs text-slate-500 tnum">
                    {l.productCount} SKU
                  </span>
                </div>
              )}
              onSelect={(l) => openLocation(l.locationCode)}
              placeholder="Ketik kode rak (mis. A01-B02)…"
              uppercase
              minChars={1}
              emptyText="Lokasi belum ada di Master Data"
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => setShowLocationScanner(true)}
              className="w-10 h-10 shrink-0 rounded bg-[#0D5C63] hover:bg-[#14727A] text-white flex items-center justify-center active:bg-[#083B40] transition"
              aria-label="Pindai barcode lokasi"
              title="Pindai barcode lokasi"
            >
              <CameraIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => openLocation(locationCode)}
              disabled={!locationCode.trim() || loading}
              className="flex-1 h-9 bg-[#0D5C63] hover:bg-[#14727A] active:bg-[#083B40] text-white rounded font-semibold text-xs disabled:bg-slate-200 disabled:text-slate-400 transition"
            >
              {loading ? "Membuka…" : "Buka Lokasi"}
            </button>
            <button
              type="button"
              className="h-9 px-3 border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded font-semibold text-xs whitespace-nowrap transition"
              onClick={() => {
                setNewLocation(locationCode.trim().toUpperCase());
                setShowNewLocation(true);
              }}
            >
              + Rak Baru
            </button>
          </div>
        </section>

        {/* ── 3. Draft Hitungan (Jika Ada) ── */}
        {drafts.length > 0 && (
          <section
            className="bg-white border border-slate-200 border-l-4 border-l-[#D97706] rounded overflow-hidden"
            aria-label="Draft hitungan"
          >
            <div className="px-3 py-2 bg-amber-50/60 border-b border-slate-200 flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-slate-900">
                Draft Belum Disimpan ({drafts.length})
              </h2>
              <button
                type="button"
                onClick={() => setConfirmResetDrafts(true)}
                className="h-6 px-2 rounded bg-red-50 border border-red-200 text-[11px] font-semibold text-[#DC2626] hover:bg-red-100 flex items-center gap-1"
              >
                <TrashIcon className="w-3 h-3" />
                <span>Reset Semua</span>
              </button>
            </div>
            <div className="divide-y divide-slate-200">
              {drafts.slice(0, 5).map((draft) => (
                <div
                  key={draft.location}
                  className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-50"
                >
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left"
                    onClick={() =>
                      router.push(`/input?location=${encodeURIComponent(draft.location)}`)
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold bg-[#E6F3F4] text-[#0D5C63] border border-[#A8D3D6] px-1.5 py-0.5 rounded tnum">
                        {draft.location}
                      </span>
                      <span className="font-mono text-xs text-slate-600 tnum">
                        {Object.values(draft.counted).filter(Boolean).length} dihitung
                      </span>
                    </div>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      Diperbarui {formatRelativeTime(new Date(draft.updatedAt).toISOString())}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftToDelete(draft.location)}
                    title={`Hapus draft ${draft.location}`}
                    aria-label={`Hapus draft lokasi ${draft.location}`}
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded text-slate-400 hover:text-[#DC2626] hover:bg-red-50 transition"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 4. Cakupan Lokasi Opname (Compact Strip) ── */}
        <section
          aria-label="Progres opname"
          className="bg-white border border-slate-200 rounded p-3 space-y-2"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800">Progres Cakupan Gudang</span>
            <span className="font-mono font-bold text-slate-900 tabular-nums tnum">
              {stats.scannedCount}/{stats.total} ({stats.progress}%)
            </span>
          </div>

          <div className="w-full h-2 bg-slate-100 rounded overflow-hidden">
            <div
              className="h-full bg-[#16A34A] transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, stats.progress))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-slate-600">
              Belum dihitung:{" "}
              <strong className="font-mono font-bold text-[#DC2626] tnum">
                {stats.pending} lokasi
              </strong>
            </span>
            {stats.pending > 0 && (
              <button
                type="button"
                onClick={() => setShowPendingModal(true)}
                className="font-semibold text-blue-600 hover:underline"
              >
                Lihat Daftar →
              </button>
            )}
          </div>
        </section>

        {/* ── 5. Cari Posisi Produk (Global SKU / Barcode Finder) ── */}
        <section
          aria-label="Cari posisi produk"
          className="bg-white border border-slate-200 rounded overflow-hidden"
        >
          <div className="p-3 space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <SearchIcon className="w-3.5 h-3.5 text-slate-700" /> Cari Posisi Barang
            </h2>

            <div className="relative flex items-center">
              <input
                id="scan-product-input"
                type="text"
                value={productQuery}
                onChange={(e) => {
                  setProductQuery(e.target.value);
                  handleProductSearchDebounced(e.target.value);
                }}
                placeholder="Ketik nama barang, SKU, barcode…"
                className="w-full h-9 pl-3 pr-10 bg-slate-50 border border-slate-300 rounded text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-[#0D5C63]"
              />
              <button
                type="button"
                onClick={() => setShowProductScanner(true)}
                className="absolute right-1 w-7 h-7 rounded bg-slate-200/80 hover:bg-slate-300 text-slate-700 flex items-center justify-center"
                aria-label="Pindai barcode produk"
                title="Pindai barcode produk"
              >
                <CameraIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {productSearchLoading && (
            <p
              className="px-3 pb-3 flex items-center gap-2 text-xs text-slate-500"
              role="status"
            >
              <LoadingSpinner /> Mencari…
            </p>
          )}

          {productResults.length > 0 && (
            <ul className="divide-y divide-slate-200 border-t border-slate-200 max-h-60 overflow-y-auto">
              {productResults.map((item, idx) => (
                <li
                  key={`${item.sku}-${item.batch}-${idx}`}
                  className="px-3 py-2 flex items-center justify-between gap-2 bg-white hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] font-bold bg-[#E6F3F4] text-[#0D5C63] border border-[#A8D3D6] px-1 rounded shrink-0 tnum">
                        [{item.location}]
                      </span>
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {item.productName}
                      </p>
                    </div>
                    <p className="font-mono text-xs text-slate-500 mt-0.5 tnum">
                      {item.sku} • Batch: {item.batch || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openLocation(item.location)}
                      className="h-7 px-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-xs font-semibold text-slate-800"
                    >
                      Buka
                    </button>
                    <button
                      type="button"
                      onClick={() => openQuickMove(item)}
                      className="h-7 px-2.5 bg-[#0D5C63] hover:bg-[#14727A] text-white rounded text-xs font-semibold"
                    >
                      Pindah
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── 6. Terakhir Dikerjakan (Dense Recent List) ── */}
        <section
          aria-label="Terakhir dikerjakan"
          className="bg-white border border-slate-200 rounded overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <ClockIcon className="w-3.5 h-3.5 text-slate-600" /> Terakhir Dikerjakan
            </h2>
            <button
              type="button"
              onClick={() => router.push("/history")}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Semua Riwayat →
            </button>
          </div>

          {recentScans.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">
              Belum ada aktivitas opname tercatat
            </p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {recentScans.map((item, idx) => (
                <li key={`${item.location}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => openLocation(item.location)}
                    className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-[#16A34A] shrink-0" />
                      <span className="font-mono text-sm font-bold text-slate-900 uppercase tnum">
                        {item.location}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="font-mono text-xs text-slate-600 tnum">
                        {item.count} SKU
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-slate-500">
                        {formatRelativeTime(item.time)}
                      </span>
                      <ChevronRightIcon className="w-4 h-4 text-slate-400" />
                    </div>
                  </button>
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
        <div className="max-h-[60dvh] overflow-y-auto divide-y divide-slate-200">
          {pendingLocations.map((loc) => (
            <button
              key={loc.locationCode}
              type="button"
              onClick={() => {
                setShowPendingModal(false);
                openLocation(loc.locationCode);
              }}
              className="w-full py-2 px-1 flex items-center justify-between gap-2 text-left hover:bg-slate-50 transition"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-slate-900 uppercase tnum">
                  {loc.locationCode}
                </span>
                <span className="font-mono text-xs text-slate-500 tnum">
                  ({loc.productCount} produk)
                </span>
              </div>
              <span className="text-xs font-semibold text-blue-600 whitespace-nowrap">
                Buka →
              </span>
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
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            Lokasi{" "}
            <strong className="font-mono text-slate-900 font-bold">
              &quot;{newLocation}&quot;
            </strong>{" "}
            belum terdaftar di Master Data. Lanjutkan untuk menginput produk ke lokasi ini?
          </p>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowNewLocation(false)}
              className="flex-1 h-10 bg-slate-100 border border-slate-300 rounded font-semibold text-slate-800"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewLocation(false);
                router.push(`/input?location=${encodeURIComponent(newLocation)}`);
              }}
              className="flex-1 h-10 bg-[#0D5C63] hover:bg-[#14727A] text-white rounded font-semibold transition"
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
        message="Semua draft hitungan yang belum disimpan di perangkat ini akan dihapus secara permanen."
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
