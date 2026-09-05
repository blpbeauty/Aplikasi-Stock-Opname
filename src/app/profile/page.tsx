"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import ConfirmModal from "@/components/ConfirmModal";
import { getHistoryApi, getAllLocationsApi } from "@/lib/api";
import { MapPinIcon, InfoIcon, LogoutIcon } from "@/components/icons";
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
    <div className="mobile-container pb-32">
      {/* ── Identitas operator ── */}
      <header className="bg-paper pt-7 pb-5 px-5 border-b border-border">
        <div className="flex items-center gap-4 max-w-md mx-auto sm:mx-0">
          <div className="w-16 h-16 shrink-0 rounded-card bg-primary text-ivory flex items-center justify-center">
            <span className="text-2xl font-bold">{initial}</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-text-primary leading-snug break-words">
              {user?.name || "Operator Gudang"}
            </h1>
            <p className="text-meta text-text-secondary break-all">{user?.email || "-"}</p>
            <span className="mt-1 inline-block px-2.5 py-0.5 bg-primary-pale text-primary rounded-label font-bold text-meta">
              {user?.role || "Staff Gudang"}
            </span>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-6 pt-4 space-y-5">
        {/* ── Statistik operator ── */}
        <section aria-label="Statistik pekerjaan" className="bg-paper rounded-card border border-border grid grid-cols-3 divide-x divide-border-subtle overflow-hidden">
          <div className="py-4 px-2 text-center">
            <p className="text-xl font-bold text-text-primary tnum">{stats.discan}</p>
            <p className="text-meta text-text-secondary mt-0.5">Lokasi Dikerjakan</p>
          </div>
          <div className="py-4 px-2 text-center">
            <p className="text-xl font-bold text-text-primary tnum">
              {stats.entries.toLocaleString("id-ID")}
            </p>
            <p className="text-meta text-text-secondary mt-0.5">Produk Diinput</p>
          </div>
          <div className="py-4 px-2 text-center">
            <p className="text-xl font-bold text-amber-text tnum">
              {stats.items.toLocaleString("id-ID")}
            </p>
            <p className="text-meta text-text-secondary mt-0.5">Total Pcs</p>
          </div>
        </section>

        {/* ── Progress per area gudang ── */}
        {locationGroups.length > 0 && (
          <section aria-label="Progress per area gudang">
            <h2 className="text-base2 font-bold text-text-primary mb-2">Progress per Area Gudang</h2>
            <p className="text-meta text-text-secondary mb-2 -mt-1">
              Dihitung dari seluruh riwayat tersimpan Anda.
            </p>
            <div className="space-y-3">
              {locationGroups.map((group) => {
                const pct = group.total > 0 ? Math.round((group.scanned / group.total) * 100) : 0;
                return (
                  <div key={group.name} className="bg-paper rounded-card border border-border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-input bg-primary-pale text-primary flex items-center justify-center shrink-0">
                          <MapPinIcon className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-meta font-bold text-text-primary uppercase tnum">{group.name}</p>
                          <p className="text-meta text-text-secondary tnum">
                            {group.scanned} dari {group.total} lokasi pernah dihitung
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-base2 font-bold tnum ${
                          pct === 100 ? "text-success" : pct > 0 ? "text-text-primary" : "text-text-secondary"
                        }`}
                      >
                        {pct}%
                      </span>
                    </div>

                    <div
                      className="w-full h-2.5 bg-surface-warm rounded-full overflow-hidden border border-border-subtle"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Progress area ${group.name}: ${pct} persen`}
                    >
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                          pct === 100 ? "bg-success" : "bg-primary"
                        }`}
                        style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between mt-2 text-meta text-text-secondary tnum">
                      <span>
                        Entri: <strong className="text-text-primary">{group.inputCount}</strong>
                      </span>
                      <span>
                        Total item: <strong className="text-text-primary">{group.totalQty}</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Info aplikasi ── */}
        <div className="bg-paper rounded-card border border-border p-4 flex items-center gap-3">
          <span className="w-9 h-9 rounded-input bg-primary-pale text-primary flex items-center justify-center shrink-0">
            <InfoIcon className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-meta font-bold text-text-primary">BLP Stock Opname</p>
            <p className="text-meta text-text-secondary">Versi 2.3.0 · Cokelat Ivory</p>
          </div>
        </div>

        {/* ── Logout: tindakan berbahaya, dipisah di bawah ── */}
        <button
          type="button"
          onClick={() => setShowLogoutModal(true)}
          className="w-full flex items-center justify-center gap-2 min-h-touch bg-danger-bg text-danger rounded-input font-bold text-meta border border-danger/30 transition active:scale-[0.98]"
        >
          <LogoutIcon className="w-4 h-4" aria-hidden="true" />
          Keluar dari Akun
        </button>
      </div>

      {/* ── Konfirmasi logout ── */}
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
