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
    <div className="max-w-md mx-auto min-h-dvh bg-[#F8FAFC] text-[#0F172A] pb-24 border-x border-slate-200 font-sans antialiased">
      {/* ============================================================== */}
      {/* 1. COMPACT TOP HEADER (~46px, Sticky - Deep Pistachio)        */}
      {/* ============================================================== */}
      <header className="sticky top-0 z-30 h-11 min-h-[46px] bg-[#2E5339] text-white border-b border-[#203B28] px-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs font-bold bg-white/15 border border-white/25 text-white px-2 py-0.5 rounded tracking-wide">
            PROFIL
          </span>
          <h1 className="text-sm font-bold text-white truncate">
            Operator & Sistem
          </h1>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-100 shrink-0">
          <span
            className={`w-2 h-2 rounded-full ${
              offline || testingOffline ? "bg-[#FBBF24]" : "bg-[#4ADE80]"
            }`}
          />
          <span>
            {testingOffline ? "Simulasi Offline" : offline ? "Offline" : "Online"}
          </span>
        </div>
      </header>

      <div className="p-3 space-y-3">
        {/* ============================================================== */}
        {/* 2. COMPACT OPERATOR IDENTITY PANEL                             */}
        {/* ============================================================== */}
        <section
          aria-label="Identitas operator"
          className="bg-white border border-slate-200 rounded p-3 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded bg-[#2E5339] text-white font-mono font-bold text-base flex items-center justify-center">
              {initial}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 truncate leading-tight">
                {user?.name || "Operator Gudang"}
              </h2>
              <p className="font-mono text-xs text-slate-500 truncate mt-0.5">
                {user?.email || "-"}
              </p>
            </div>
          </div>

          <span className="font-mono text-[11px] font-bold bg-[#EAF2EB] text-[#2E5339] border border-[#BDD7C4] px-2 py-0.5 rounded uppercase shrink-0">
            {user?.role || "Staff"}
          </span>
        </section>

        {/* ============================================================== */}
        {/* 3. TELEMETRY & KPI STRIP (3 Kolom Tabular)                     */}
        {/* ============================================================== */}
        <section
          aria-label="Statistik pekerjaan"
          className="bg-white border border-slate-200 rounded grid grid-cols-3 divide-x divide-slate-200 overflow-hidden"
        >
          <div className="py-2.5 px-2 text-center">
            <p className="font-mono text-base font-bold text-slate-900 tabular-nums tnum">
              {stats.discan}
            </p>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5">
              Rak Dikerjakan
            </p>
          </div>
          <div className="py-2.5 px-2 text-center">
            <p className="font-mono text-base font-bold text-slate-900 tabular-nums tnum">
              {stats.entries.toLocaleString("id-ID")}
            </p>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5">
              SKU Diinput
            </p>
          </div>
          <div className="py-2.5 px-2 text-center">
            <p className="font-mono text-base font-bold text-[#16A34A] tabular-nums tnum">
              {stats.items.toLocaleString("id-ID")}
            </p>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5">
              Total Pcs
            </p>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 4. SINKRONISASI DATA & MODE OFFLINE                            */}
        {/* ============================================================== */}
        <section
          aria-label="Pengaturan sinkronisasi"
          className="bg-white border border-slate-200 rounded p-3 space-y-2"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Data & Sinkronisasi Offline
            </h2>
            {isSyncing && (
              <span className="font-mono text-[11px] text-blue-600 font-semibold">
                Menyinkronkan…
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 leading-snug">
            Mode uji offline memakai database lokal perangkat (IndexedDB) dan menahan antrean kirim hingga dimatikan.
          </p>
          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <button
              type="button"
              disabled={!isReady}
              onClick={toggleOfflineTest}
              className={`h-9 px-3 rounded font-semibold text-xs transition-colors ${
                testingOffline
                  ? "bg-[#D97706] text-white hover:bg-amber-700"
                  : "bg-[#2E5339] text-white hover:bg-[#3D6E4C]"
              } disabled:opacity-40`}
            >
              {testingOffline ? "Akhiri Uji Offline" : "Uji Mode Offline"}
            </button>

            <button
              type="button"
              disabled={offline || isSyncing}
              onClick={() => void forceSync()}
              className="h-9 px-3 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 font-semibold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors"
            >
              <RefreshIcon className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              <span>{isSyncing ? "Mengunduh…" : "Sync Data"}</span>
            </button>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 5. PROGRESS PER AREA GUDANG (Dense List)                       */}
        {/* ============================================================== */}
        {locationGroups.length > 0 && (
          <section
            aria-label="Progress per area gudang"
            className="bg-white border border-slate-200 rounded overflow-hidden"
          >
            <div className="px-3 py-2 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Cakupan per Area Gudang
              </h2>
              <span className="font-mono text-[11px] text-slate-500 tnum">
                {locationGroups.length} Area
              </span>
            </div>

            <div className="divide-y divide-slate-200">
              {locationGroups.map((group) => {
                const pct =
                  group.total > 0
                    ? Math.round((group.scanned / group.total) * 100)
                    : 0;
                const barColor =
                  pct === 100
                    ? "bg-[#16A34A]"
                    : pct > 0
                    ? "bg-blue-600"
                    : "bg-slate-300";

                return (
                  <div key={group.name} className="px-3 py-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-bold bg-[#EAF2EB] text-[#2E5339] border border-[#BDD7C4] px-1.5 py-0.5 rounded uppercase tnum">
                          [{group.name}]
                        </span>
                        <span className="font-mono text-xs text-slate-600 tabular-nums tnum">
                          {group.scanned}/{group.total} Rak
                        </span>
                      </div>

                      <span
                        className={`font-mono text-xs font-bold tabular-nums tnum ${
                          pct === 100
                            ? "text-[#16A34A]"
                            : pct > 0
                            ? "text-slate-900"
                            : "text-slate-400"
                        }`}
                      >
                        {pct}%
                      </span>
                    </div>

                    <div
                      className="w-full h-1.5 bg-slate-100 rounded overflow-hidden"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Progress area ${group.name}: ${pct} persen`}
                    >
                      <div
                        className={`h-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between font-mono text-[11px] text-slate-500 tabular-nums tnum">
                      <span>
                        Entri: <strong className="text-slate-800">{group.inputCount}</strong>
                      </span>
                      <span>
                        Total:{" "}
                        <strong className="text-slate-800">
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
        <div className="bg-white border border-slate-200 rounded px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <InfoIcon className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">BLP Stock Opname</p>
              <p className="font-mono text-[11px] text-slate-500 truncate">
                v2.5.0 · Industrial Compact UI
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowLogoutModal(true)}
            className="h-8 px-3 bg-red-50 hover:bg-red-100 border border-red-200 text-[#DC2626] rounded font-semibold text-xs flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <LogoutIcon className="w-3.5 h-3.5" aria-hidden="true" />
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
