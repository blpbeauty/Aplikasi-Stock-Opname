"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import ScannerModal from "@/components/ScannerModal";
import { Dialog } from "@/components/ui";
import Autocomplete from "@/components/Autocomplete";
import {
  getProductsApi,
  getHistoryApi,
  getAllProductsApi,
  getAllLocationsApi,
  searchLocationsApi,
} from "@/lib/api";
import { useDataSync } from "@/components/DataSyncProvider";
import {
  MapPinIcon,
  CameraIcon,
  ClockIcon,
  ChevronRightIcon,
  TrashIcon,
} from "@/components/icons";
import ConfirmModal from "@/components/ConfirmModal";
import { InputDraft, listDrafts, removeDraft, clearAllDrafts } from "@/lib/drafts";
import { HistoryEntry } from "@/lib/types";
import { getCache, setCache } from "@/lib/cache";
import { formatRelativeTime } from "@/lib/format";
import toast from "react-hot-toast";

type LocationResult = {
  locationCode: string;
  productCount: number;
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

  const allLocationsRef = useRef<LocationResult[] | null>(null);

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
    getAllProductsApi()
      .then((res) => {
        if (res.success && res.products) {
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
    <div className="max-w-md mx-auto min-h-dvh bg-gradient-to-b from-[#D7F4F4] via-[#ECF9F9] to-[#F4FCFC] text-[#0D3B40] pb-24 sm:border-x sm:border-[#8ADBD9]/65 font-sans antialiased">
      {/* ── 1. Aqua Pastel Sticky Header ── */}
      <header className="sticky top-0 z-30 min-h-[54px] bg-gradient-to-r from-[#D5F4F3]/95 via-[#E4F8F8]/95 to-[#EEFAFA]/95 backdrop-blur-md border-b border-[#8ADBD9]/65 px-3.5 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0 flex flex-col justify-center leading-tight">
          <h1 className="text-sm font-bold text-[#0D3B40] tracking-tight truncate">
            BLP Stock Opname
          </h1>
          <span className="text-xs font-medium text-[#487277] truncate">
            PARAS &amp; PAYU
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="font-mono text-xs bg-[#C7EEED] text-[#0B666E] border border-[#7ED4D3]/80 px-2.5 py-1 rounded-full font-semibold tabular-nums tnum">
            {stats.scannedCount}/{stats.total} Rak
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium bg-white/85 border border-[#8EDCDC]/75 text-[#0D3B40] px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-[#16A34A] shrink-0" />
            <span className="truncate max-w-[72px]">
              {user?.name?.split(" ")[0] || "Operator"}
            </span>
          </div>
        </div>
      </header>

      <div className="px-3.5 pt-3 space-y-3">
        {/* ── 2. Progres Cakupan Gudang (Paling Atas — Aqua Pastel Hero Card) ── */}
        <section
          aria-label="Progres opname"
          className="bg-gradient-to-br from-[#CCF2F1] via-[#E1F8F8] to-[#FFFFFF] border border-[#7CD4D3]/80 shadow-card rounded-2xl p-3.5 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B666E]">
                Progres Cakupan Gudang
              </h2>
              <p className="text-xs text-[#487277] mt-0.5 truncate">
                Target penghitungan seluruh rak aktif
              </p>
            </div>
            <span className="shrink-0 inline-flex items-baseline gap-1 font-mono text-xs font-bold text-[#0D3B40] bg-white/85 border border-[#8ADBD9]/75 px-2.5 py-1 rounded-xl tabular-nums tnum shadow-subtle">
              {stats.scannedCount}/{stats.total}
              <span className="text-[#0E838C]">({stats.progress}%)</span>
            </span>
          </div>

          <div className="w-full h-2.5 bg-[#D4EFEF] border border-[#9BE0DF]/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#0E838C] via-[#14B8A6] to-[#2DD4BF] rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, stats.progress))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs pt-0.5">
            <span className="text-[#487277]">
              Belum dihitung:{" "}
              <strong className="font-mono font-bold text-[#DC2626] tnum">
                {stats.pending} lokasi
              </strong>
            </span>
            {stats.pending > 0 && (
              <button
                type="button"
                onClick={() => setShowPendingModal(true)}
                className="min-h-[44px] px-3 -mr-1.5 rounded-xl font-semibold text-xs text-[#0B666E] bg-white/80 border border-[#8ADBD9]/65 hover:bg-white transition-colors"
              >
                Lihat Daftar →
              </button>
            )}
          </div>
        </section>

        {/* ── 3. Pilih / Scan Kode Rak (Tengah) ── */}
        <section
          aria-label="Buka lokasi"
          className="relative z-20 bg-white border border-[#9BE0DF]/75 shadow-card rounded-2xl p-3.5 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B666E] flex items-center gap-1.5">
              <MapPinIcon className="w-4 h-4 text-[#0E838C]" />
              Pilih / Scan Kode Rak
            </h2>
            <span className="font-mono text-xs bg-[#EEFBFB] border border-[#9CE0DF]/75 text-[#487277] px-2.5 py-0.5 rounded-full tabular-nums tnum">
              Pending: <strong className="text-[#DC2626]">{stats.pending}</strong>
            </span>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="scan-location-input"
              className="block text-xs font-semibold text-[#0D3B40]"
            >
              Cari atau pindai lokasi
            </label>
            <div className="flex gap-2 items-center">
              <Autocomplete<LocationResult>
                id="scan-location-input"
                value={locationCode}
                onValueChange={setLocationCode}
                resolve={resolveLocations}
                getKey={(l) => l.locationCode}
                renderItem={(l) => (
                  <div className="w-full min-w-0 flex items-center justify-between py-0.5">
                    <span className="font-mono text-sm font-semibold text-[#0D3B40] uppercase tnum">
                      {l.locationCode}
                    </span>
                    <span className="font-mono text-xs text-[#487277] tnum">
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
                className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white flex items-center justify-center shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)] active:scale-[0.97] transition-all"
                aria-label="Pindai barcode lokasi"
                title="Pindai barcode lokasi"
              >
                <CameraIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => openLocation(locationCode)}
              disabled={!locationCode.trim() || loading}
              className="flex-1 min-h-[44px] bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white rounded-xl font-semibold text-sm shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)] disabled:from-[#D5EDED] disabled:to-[#D5EDED] disabled:text-[#5B8E92] disabled:shadow-none active:scale-[0.98] transition-all duration-150"
            >
              {loading ? "Membuka…" : "Buka Lokasi"}
            </button>
            <button
              type="button"
              className="min-h-[44px] px-3.5 border border-[#8ADBD9]/80 bg-[#D5F4F3] hover:bg-[#C2ECEB] text-[#0B666E] rounded-xl font-semibold text-xs whitespace-nowrap active:scale-[0.98] transition-all duration-150"
              onClick={() => {
                setNewLocation(locationCode.trim().toUpperCase());
                setShowNewLocation(true);
              }}
            >
              + Rak Baru
            </button>
          </div>
        </section>

        {/* ── 4. Draft Hitungan (Jika Ada) ── */}
        {drafts.length > 0 && (
          <section
            className="bg-white border border-[#9BE0DF]/75 border-l-4 border-l-[#D97706] shadow-subtle rounded-2xl overflow-hidden"
            aria-label="Draft hitungan"
          >
            <div className="px-3.5 py-2 bg-[#FEF7E6] border-b border-[#F3DCAB]/70 flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-[#0D3B40]">
                Draft Belum Disimpan ({drafts.length})
              </h2>
              <button
                type="button"
                onClick={() => setConfirmResetDrafts(true)}
                className="min-h-[44px] px-3 rounded-xl bg-[#FEF2F2] border border-[#DC2626]/20 text-xs font-semibold text-[#DC2626] hover:bg-red-100/70 flex items-center gap-1.5 active:scale-[0.98] transition-transform"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                <span>Reset Semua</span>
              </button>
            </div>
            <div className="divide-y divide-[#9BE0DF]/40">
              {drafts.slice(0, 5).map((draft) => (
                <div
                  key={draft.location}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-[#EEFBFB]"
                >
                  <button
                    type="button"
                    className="flex-1 min-w-0 min-h-[44px] text-left flex flex-col justify-center"
                    onClick={() =>
                      router.push(`/input?location=${encodeURIComponent(draft.location)}`)
                    }
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold bg-[#D5F4F3] text-[#0B666E] border border-[#82D6D5]/75 px-2 py-0.5 rounded-lg tnum">
                        {draft.location}
                      </span>
                      <span className="font-mono text-xs text-[#487277] tnum">
                        {Object.values(draft.counted).filter(Boolean).length} dihitung
                      </span>
                    </div>
                    <span className="block text-xs text-[#487277] mt-1">
                      Diperbarui {formatRelativeTime(new Date(draft.updatedAt).toISOString())}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftToDelete(draft.location)}
                    title={`Hapus draft ${draft.location}`}
                    aria-label={`Hapus draft lokasi ${draft.location}`}
                    className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl text-[#487277] hover:text-[#DC2626] hover:bg-[#FEF2F2] active:scale-[0.96] transition-all"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 5. Terakhir Dikerjakan (Bawah) ── */}
        <section
          aria-label="Terakhir dikerjakan"
          className="bg-white border border-[#9BE0DF]/75 shadow-subtle rounded-2xl overflow-hidden"
        >
          <div className="px-3.5 py-2 bg-gradient-to-r from-[#E4F8F8] to-[#F3FCFC] border-b border-[#9BE0DF]/50 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B666E] flex items-center gap-1.5">
              <ClockIcon className="w-4 h-4 text-[#0E838C]" /> Terakhir Dikerjakan
            </h2>
            <button
              type="button"
              onClick={() => router.push("/history")}
              className="min-h-[44px] px-2 -mr-2 rounded-xl text-xs font-semibold text-[#0B666E] hover:bg-[#D5F4F3]/70 transition-colors"
            >
              Semua Riwayat →
            </button>
          </div>

          {recentScans.length === 0 ? (
            <p className="text-xs text-[#487277] text-center py-5">
              Belum ada aktivitas opname tercatat
            </p>
          ) : (
            <ul className="divide-y divide-[#9BE0DF]/40">
              {recentScans.map((item, idx) => (
                <li key={`${item.location}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => openLocation(item.location)}
                    className="w-full min-h-[52px] px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-[#EEFBFB] active:bg-[#D5F4F3]/70 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-[#16A34A] shrink-0" />
                      <span className="font-mono text-sm font-semibold text-[#0D3B40] uppercase tnum">
                        {item.location}
                      </span>
                      <span className="text-[#487277]/45">•</span>
                      <span className="font-mono text-xs text-[#487277] tnum">
                        {item.count} SKU
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-[#487277]">
                        {formatRelativeTime(item.time)}
                      </span>
                      <ChevronRightIcon className="w-4 h-4 text-[#487277]" />
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

      {/* Modal Daftar Pending */}
      <Dialog
        isOpen={showPendingModal}
        onClose={() => setShowPendingModal(false)}
        title={`Lokasi Belum Dicatat (${pendingLocations.length})`}
      >
        <div className="max-h-[60dvh] overflow-y-auto divide-y divide-[#9BE0DF]/40">
          {pendingLocations.map((loc) => (
            <button
              key={loc.locationCode}
              type="button"
              onClick={() => {
                setShowPendingModal(false);
                openLocation(loc.locationCode);
              }}
              className="w-full min-h-[48px] py-2.5 px-2 flex items-center justify-between gap-2 text-left hover:bg-[#EEFBFB] rounded-xl transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-sm font-semibold text-[#0D3B40] uppercase tnum">
                  {loc.locationCode}
                </span>
                <span className="font-mono text-xs text-[#487277] tnum">
                  ({loc.productCount} produk)
                </span>
              </div>
              <span className="text-xs font-semibold text-[#0E838C] whitespace-nowrap">
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
          <p className="text-[#487277] leading-relaxed">
            Lokasi{" "}
            <strong className="font-mono text-[#0D3B40] font-semibold">
              &quot;{newLocation}&quot;
            </strong>{" "}
            belum terdaftar di Master Data. Lanjutkan untuk menginput produk ke lokasi ini?
          </p>
          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setShowNewLocation(false)}
              className="flex-1 min-h-[44px] bg-[#EEFBFB] border border-[#9CE0DF]/80 hover:bg-[#D5F4F3] rounded-xl font-semibold text-sm text-[#0D3B40] active:scale-[0.98] transition-all"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewLocation(false);
                router.push(`/input?location=${encodeURIComponent(newLocation)}`);
              }}
              className="flex-1 min-h-[44px] bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white rounded-xl font-semibold text-sm shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)] active:scale-[0.98] transition-all"
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
