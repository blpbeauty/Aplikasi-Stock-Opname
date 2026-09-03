"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import ConfirmModal from "@/components/ConfirmModal";
import { getHistoryApi, getAllLocationsApi } from "@/lib/api";
import { HistoryEntry } from "@/lib/types";
import { getCache, setCache } from "@/lib/cache";

type LocationResult = { locationCode: string; productCount: number };

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [allLocations, setAllLocations] = useState<LocationResult[]>([]);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    const ck = `history:${user.email}:all`;
    const cached = getCache<HistoryEntry[]>(ck);
    if (cached) setHistory(cached.data);
    getHistoryApi(user.email)
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
  }, [user]);

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
        groupMap.set(prefix, { total: 0, scanned: 0, inputCount: 1, totalQty: e.qty });
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

  return (
    <div className="mobile-container pb-28">
      {/* ── Profile Header ── */}
      <div className="bg-white pt-8 pb-6 px-5 text-center border-b border-border shadow-xs">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary text-white flex items-center justify-center mb-3 shadow-md">
          <span className="text-2xl font-black">{initial}</span>
        </div>
        <h1 className="text-base font-bold text-text-primary tracking-tight">
          {user?.name || "Operator Gudang"}
        </h1>
        <div className="flex items-center justify-center gap-1.5 mt-1 text-xs text-text-secondary font-medium">
          <span className="inline-block px-2.5 py-0.5 bg-primary-pale text-primary rounded-full font-bold text-[10px]">
            {user?.role || "Staff Gudang"}
          </span>
          <span>·</span>
          <span>{user?.email || "-"}</span>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* ── Stats Row ── */}
        <div className="bg-white rounded-2xl shadow-card border border-border grid grid-cols-3 divide-x divide-border-subtle overflow-hidden">
          <div className="py-3.5 px-2 text-center">
            <p className="text-base font-black text-primary">{stats.discan}</p>
            <p className="text-[10px] text-text-secondary font-bold mt-0.5">Lokasi Discan</p>
          </div>
          <div className="py-3.5 px-2 text-center">
            <p className="text-base font-black text-text-primary">
              {stats.entries.toLocaleString()}
            </p>
            <p className="text-[10px] text-text-secondary font-bold mt-0.5">Produk Diinput</p>
          </div>
          <div className="py-3.5 px-2 text-center">
            <p className="text-base font-black text-accent-yellow">
              {stats.items.toLocaleString()}
            </p>
            <p className="text-[10px] text-text-secondary font-bold mt-0.5">Total Pcs</p>
          </div>
        </div>

        {/* ── Location Group Progress ── */}
        {locationGroups.length > 0 && (
          <div className="space-y-2.5">
            <h2 className="text-xs font-bold text-text-primary px-1 uppercase tracking-wider">
              Progress per Area Gudang
            </h2>
            {locationGroups.map((group) => {
              const pct = group.total > 0 ? Math.round((group.scanned / group.total) * 100) : 0;
              return (
                <div
                  key={group.name}
                  className="bg-white rounded-2xl shadow-card border border-border p-3.5"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary-pale text-primary flex items-center justify-center text-xs font-bold">
                        📍
                      </div>
                      <div>
                        <p className="text-xs font-bold text-text-primary">{group.name}</p>
                        <p className="text-[10px] text-text-secondary">
                          {group.scanned} / {group.total} lokasi selesai
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-sm font-black ${
                        pct === 100
                          ? "text-accent-green"
                          : pct > 0
                          ? "text-primary"
                          : "text-text-secondary"
                      }`}
                    >
                      {pct}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-surface-warm rounded-full overflow-hidden border border-border-subtle">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        pct === 100 ? "bg-accent-green" : "bg-primary"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-2 text-[10px] text-text-secondary">
                    <span>
                      Diinput: <strong className="text-text-primary">{group.inputCount}</strong>
                    </span>
                    <span>
                      Total Item: <strong className="text-text-primary">{group.totalQty}</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Info Card ── */}
        <div className="bg-white rounded-2xl shadow-card border border-border p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary-pale text-primary flex items-center justify-center text-sm font-bold">
            ℹ️
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-text-primary">BLP Stock Opname Mobile</p>
            <p className="text-[10px] text-text-secondary">Versi 2.0.0 · Dark Brown &amp; Warm Ivory Edition</p>
          </div>
        </div>

        {/* ── Logout Button ── */}
        <button
          type="button"
          onClick={() => setShowLogoutModal(true)}
          className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 text-accent-red rounded-2xl font-bold text-xs hover:bg-red-100 transition active:scale-[0.98] border border-red-200"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          Keluar dari Akun
        </button>
      </div>

      {/* ── Logout Confirmation Modal ── */}
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
