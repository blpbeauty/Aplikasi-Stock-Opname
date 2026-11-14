"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useDataSync } from "@/components/DataSyncProvider";
import BottomNav from "@/components/BottomNav";
import ConfirmModal from "@/components/ConfirmModal";
import { getHistoryApi, getAllLocationsApi } from "@/lib/api";
import { InfoIcon, LogoutIcon, RefreshIcon } from "@/components/icons";
import { HistoryEntry } from "@/lib/types";
import { getCache, setCache } from "@/lib/cache";

type LocationResult = { locationCode: string; productCount: number };

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const {
    isReady,
    offline,
    testingOffline,
    toggleOfflineTest,
    forceSync,
    syncProgress,
  } = useDataSync();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [allLocations, setAllLocations] = useState<LocationResult[]>([]);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    if (!user?.email || !isReady) return;
    const ck = `history:${user.email}:all`;
    const cached = getCache<HistoryEntry[]>(ck);
    if (cached) setHistory(cached.data);
    getHistoryApi(user.email, undefined, false, user?.name)
      .then((res) => {
        if (res.success && res.history) {
          setHistory(res.history);
          setCache(ck, res.history);
        }
      })
      .catch(() => {});

    const cachedLoc = getCache<LocationResult[]>("allLocations");
    if (cachedLoc) setAllLocations(cachedLoc.data);
    getAllLocationsApi()
      .then((res) => {
        if (res.success && res.locations) {
          setAllLocations(res.locations);
          setCache("allLocations", res.locations);
        }
      })
      .catch(() => {});
  }, [user, isReady]);

  const stats = useMemo(() => {
    const locations = new Set(history.map((e) => e.location));
    const totalItems = history.reduce((sum, e) => sum + e.qty, 0);
    const totalEntries = history.length;
    return {
      discan: locations.size,
      items: totalItems,
      entries: totalEntries,
    };
  }, [history]);

  // Location group progress (CEN/PARAS, CEN/PAYU, etc.)
  const locationGroups = useMemo(() => {
    const groupMap = new Map<
      string,
      { total: number; scanned: number; inputCount: number; totalQty: number }
    >();

    allLocations.forEach((loc) => {
      const parts = loc.locationCode.split("/");
      const prefix = parts.length >= 2 ? parts.slice(0, 2).join("/") : parts[0];
      const existing = groupMap.get(prefix);
      if (!existing) {
        groupMap.set(prefix, { total: 1, scanned: 0, inputCount: 0, totalQty: 0 });
      } else {
        existing.total += 1;
      }
    });

    const scannedPerGroup = new Map<string, Set<string>>();
    history.forEach((e) => {
      const parts = e.location.split("/");
      const prefix = parts.length >= 2 ? parts.slice(0, 2).join("/") : parts[0];

      if (!scannedPerGroup.has(prefix)) scannedPerGroup.set(prefix, new Set());
      scannedPerGroup.get(prefix)!.add(e.location);

      const group = groupMap.get(prefix);
      if (group) {
        group.inputCount += 1;
        group.totalQty += e.qty;
      } else {
        groupMap.set(prefix, {
          total: 0,
          scanned: 0,
          inputCount: 1,
          totalQty: e.qty,
        });
      }
    });

    scannedPerGroup.forEach((locations, prefix) => {
      const group = groupMap.get(prefix);
      if (group) group.scanned = locations.size;
    });

    return Array.from(groupMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [history, allLocations]);

  const initial = user?.name?.charAt(0)?.toUpperCase() || "U";
  const isSyncing = syncProgress.status === "syncing";

  return (
    <div className="max-w-md mx-auto min-h-dvh bg-gradient-to-b from-[#D7F4F4] via-[#ECF9F9] to-[#F4FCFC] text-[#0D3B40] pb-24 sm:border-x sm:border-[#8ADBD9]/65 font-sans antialiased">
      {/* ============================================================== */}
      {/* 1. AQUA PASTEL STICKY HEADER                                   */}
      {/* ============================================================== */}
      <header className="sticky top-0 z-30 min-h-[54px] bg-gradient-to-r from-[#D5F4F3]/95 via-[#E4F8F8]/95 to-[#EEFAFA]/95 backdrop-blur-md border-b border-[#8ADBD9]/65 px-3.5 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-[#0D3B40] tracking-tight truncate">
            Profil Operator
          </h1>
          <p className="text-xs text-[#487277] truncate">
            Akun &amp; Sinkronisasi
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-white/85 border border-[#8ADBD9]/75 px-2.5 py-1.5 rounded-full text-xs font-medium text-[#0D3B40] shrink-0">
          <span
            className={`w-2 h-2 rounded-full ${
              offline || testingOffline ? "bg-[#F59E0B]" : "bg-[#16A34A]"
            }`}
          />
          <span>
            {testingOffline ? "Simulasi Offline" : offline ? "Offline" : "Online"}
          </span>
        </div>
      </header>

      <div className="p-3 space-y-2.5">
        {/* ============================================================== */}
        {/* 2. OPERATOR IDENTITY CARD (Aqua Hero Tint)                     */}
        {/* ============================================================== */}
        <section
          aria-label="Identitas operator"
          className="bg-gradient-to-br from-[#CCF2F1] via-[#E1F8F8] to-[#FFFFFF] border border-[#7CD4D3]/80 shadow-card rounded-2xl p-3.5 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-[#0E838C] to-[#14B8A6] text-white font-mono font-bold text-base flex items-center justify-center shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)]">
              {initial}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[#0D3B40] truncate leading-snug">
                {user?.name || "Operator Gudang"}
              </h2>
              <p className="font-mono text-xs text-[#487277] truncate mt-0.5">
                {user?.email || "-"}
              </p>
            </div>
          </div>

          <span className="font-mono text-xs font-semibold bg-[#D5F4F3] text-[#0B666E] border border-[#82D6D5]/75 px-2.5 py-1 rounded-lg uppercase shrink-0">
            {user?.role || "Staff"}
          </span>
        </section>

        {/* ============================================================== */}
        {/* 3. KPI STRIP (3 Kolom Tabular)                                 */}
        {/* ============================================================== */}
        <section
          aria-label="Statistik pekerjaan"
          className="bg-white border border-[#9BE0DF]/75 shadow-subtle rounded-2xl grid grid-cols-3 divide-x divide-[#9BE0DF]/40 overflow-hidden"
        >
          <div className="py-3 px-2 text-center">
            <p className="font-mono text-base font-bold text-[#0D3B40] tabular-nums tnum">
              {stats.discan}
            </p>
            <p className="text-xs font-medium text-[#487277] mt-0.5">
              Rak Selesai
            </p>
          </div>
          <div className="py-3 px-2 text-center">
            <p className="font-mono text-base font-bold text-[#0D3B40] tabular-nums tnum">
              {stats.entries.toLocaleString("id-ID")}
            </p>
            <p className="text-xs font-medium text-[#487277] mt-0.5">
              SKU Diinput
            </p>
          </div>
          <div className="py-3 px-2 text-center">
            <p className="font-mono text-base font-bold text-[#16A34A] tabular-nums tnum">
              {stats.items.toLocaleString("id-ID")}
            </p>
            <p className="text-xs font-medium text-[#487277] mt-0.5">
              Total Pcs
            </p>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 4. SINKRONISASI DATA & MODE OFFLINE                            */}
        {/* ============================================================== */}
        <section
          aria-label="Pengaturan sinkronisasi"
          className="bg-white border border-[#9BE0DF]/75 shadow-subtle rounded-2xl p-3.5 space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B666E]">
              Data &amp; Sinkronisasi Offline
            </h2>
            {isSyncing && (
              <span className="font-mono text-xs text-[#0E838C] font-semibold">
                Menyinkronkan…
              </span>
            )}
          </div>
          <p className="text-xs text-[#487277] leading-relaxed">
            Mode uji offline memakai database lokal perangkat (IndexedDB) dan menahan antrean kirim hingga dimatikan.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <button
              type="button"
              disabled={!isReady}
              onClick={toggleOfflineTest}
              className={`min-h-[44px] px-3 rounded-xl font-semibold text-xs shadow-subtle transition-all active:scale-[0.98] ${
                testingOffline
                  ? "bg-[#D97706] text-white hover:bg-amber-700"
                  : "bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)]"
              } disabled:opacity-40`}
            >
              {testingOffline ? "Akhiri Uji Offline" : "Uji Mode Offline"}
            </button>

            <button
              type="button"
              disabled={offline || isSyncing}
              onClick={() => void forceSync()}
              className="min-h-[44px] px-3 rounded-xl border border-[#8ADBD9]/80 bg-[#EEFBFB] hover:bg-[#D5F4F3] text-[#0B666E] font-semibold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 transition-all active:scale-[0.98]"
            >
              <RefreshIcon className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
              <span>{isSyncing ? "Mengunduh…" : "Sync Data"}</span>
            </button>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 5. PROGRESS PER AREA GUDANG                                    */}
        {/* ============================================================== */}
        {locationGroups.length > 0 && (
          <section
            aria-label="Progress per area gudang"
            className="bg-white border border-[#9BE0DF]/75 shadow-subtle rounded-2xl overflow-hidden"
          >
            <div className="px-3.5 py-2.5 bg-gradient-to-r from-[#E4F8F8] to-[#F3FCFC] border-b border-[#9BE0DF]/50 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[#0B666E]">
                Cakupan per Area Gudang
              </h2>
              <span className="font-mono text-xs text-[#487277] tnum">
                {locationGroups.length} Area
              </span>
            </div>

            <div className="divide-y divide-[#9BE0DF]/40">
              {locationGroups.map((group) => {
                const pct =
                  group.total > 0
                    ? Math.round((group.scanned / group.total) * 100)
                    : 0;
                const barColor =
                  pct === 100
                    ? "bg-[#16A34A]"
                    : pct > 0
                    ? "bg-gradient-to-r from-[#0E838C] via-[#14B8A6] to-[#2DD4BF]"
                    : "bg-[#B8E6E5]";

                return (
                  <div key={group.name} className="px-3.5 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-semibold bg-[#D5F4F3] text-[#0B666E] border border-[#82D6D5]/75 px-2 py-0.5 rounded-lg uppercase tnum">
                          {group.name}
                        </span>
                        <span className="font-mono text-xs text-[#487277] tabular-nums tnum">
                          {group.scanned}/{group.total} Rak
                        </span>
                      </div>

                      <span
                        className={`font-mono text-xs font-bold tabular-nums tnum ${
                          pct === 100
                            ? "text-[#16A34A]"
                            : pct > 0
                            ? "text-[#0D3B40]"
                            : "text-[#6B9498]"
                        }`}
                      >
                        {pct}%
                      </span>
                    </div>

                    <div
                      className="w-full h-2.5 bg-[#D4EFEF] border border-[#9BE0DF]/60 rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Progress area ${group.name}: ${pct} persen`}
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between font-mono text-xs text-[#487277] tabular-nums tnum">
                      <span>
                        Entri: <strong className="text-[#0D3B40]">{group.inputCount}</strong>
                      </span>
                      <span>
                        Total:{" "}
                        <strong className="text-[#0D3B40]">
                          {group.totalQty.toLocaleString("id-ID")} Pcs
                        </strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ============================================================== */}
        {/* 6. INFO SISTEM & LOGOUT                                        */}
        {/* ============================================================== */}
        <div className="bg-white border border-[#9BE0DF]/75 shadow-subtle rounded-2xl px-3.5 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <InfoIcon className="w-5 h-5 text-[#0E838C] shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#0D3B40]">BLP Stock Opname</p>
              <p className="font-mono text-xs text-[#487277] truncate mt-0.5">
                v2.5.0 · Compact HP View
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowLogoutModal(true)}
            className="min-h-[44px] px-4 bg-[#FEF2F2] hover:bg-red-100/70 border border-[#DC2626]/20 text-[#DC2626] rounded-xl font-semibold text-xs flex items-center gap-1.5 shrink-0 transition-all active:scale-[0.98]"
          >
            <LogoutIcon className="w-4 h-4" aria-hidden="true" />
            <span>Keluar</span>
          </button>
        </div>
      </div>

      {/* Konfirmasi logout */}
      <ConfirmModal
        isOpen={showLogoutModal}
        title="Keluar dari Akun?"
        message="Apakah Anda yakin ingin keluar dari aplikasi Stock Opname?"
        confirmText="Ya, Keluar"
        cancelText="Batal"
        isDanger
        onConfirm={logout}
        onClose={() => setShowLogoutModal(false)}
      />

      <BottomNav activePage="profile" />
    </div>
  );
}
