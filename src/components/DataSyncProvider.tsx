"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./AuthProvider";
import {
  syncAllData,
  hasLocalData,
  getLastSyncTime,
  clearLocalDb,
  SyncProgress,
} from "@/lib/localDb";

// ── Context Type ───────────────────────────────────────────────

type DataSyncContextType = {
  /** Whether the initial sync has completed (data is ready to use) */
  isReady: boolean;
  /** Current sync progress */
  syncProgress: SyncProgress;
  /** Force a re-sync from Google Sheets */
  forceSync: () => Promise<void>;
  /** Last successful sync time */
  lastSyncTime: number | null;
};

const DataSyncContext = createContext<DataSyncContextType>({
  isReady: false,
  syncProgress: { status: "idle", step: "", percent: 0, lastSyncTime: null },
  forceSync: async () => {},
  lastSyncTime: null,
});

export const useDataSync = () => useContext(DataSyncContext);

// ── Provider Component ─────────────────────────────────────────

export default function DataSyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    status: "idle",
    step: "",
    percent: 0,
    lastSyncTime: null,
  });
  const syncingRef = useRef(false);
  const initializedRef = useRef(false);

  const doSync = useCallback(async (isBackground: boolean = false) => {
    if (syncingRef.current) return;
    syncingRef.current = true;

    try {
      if (!isBackground) {
        setSyncProgress({
          status: "syncing",
          step: "Memulai sinkronisasi...",
          percent: 0,
          lastSyncTime: lastSyncTime,
        });
      }

      const result = await syncAllData((progress) => {
        if (!isBackground) {
          setSyncProgress(progress);
        }
      });

      const now = Date.now();
      setLastSyncTime(now);
      setIsReady(true);

      if (!isBackground) {
        setSyncProgress({
          status: "synced",
          step: `${result.masterCount} produk, ${result.historyCount} riwayat`,
          percent: 100,
          lastSyncTime: now,
        });
      }
    } catch (error: any) {
      console.error("Sync error:", error);
      // If we have local data, still allow usage
      const hasData = await hasLocalData();
      if (hasData) {
        setIsReady(true);
        if (!isBackground) {
          setSyncProgress({
            status: "error",
            step: "Gagal sync, menggunakan data terakhir",
            percent: 100,
            lastSyncTime: lastSyncTime,
            error: error?.message,
          });
        }
      } else {
        if (!isBackground) {
          setSyncProgress({
            status: "error",
            step: "Gagal mengunduh data. Periksa koneksi internet.",
            percent: 0,
            lastSyncTime: null,
            error: error?.message,
          });
        }
      }
    } finally {
      syncingRef.current = false;
    }
  }, [lastSyncTime]);

  const forceSync = useCallback(async () => {
    await clearLocalDb();
    setIsReady(false);
    await doSync(false);
  }, [doSync]);

  // Initialize on user login
  useEffect(() => {
    if (!user || initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      // Check if we have local data already
      const hasData = await hasLocalData();
      const lastSync = await getLastSyncTime();
      setLastSyncTime(lastSync);

      if (hasData && lastSync) {
        // We have local data — show it immediately, sync in background
        setIsReady(true);
        setSyncProgress({
          status: "synced",
          step: "Data tersedia dari cache lokal",
          percent: 100,
          lastSyncTime: lastSync,
        });

        // Background sync to get latest data
        doSync(true);
      } else {
        // No local data — must sync first (show loading UI)
        await doSync(false);
      }
    };

    init();
  }, [user, doSync]);

  // Reset when user logs out
  useEffect(() => {
    if (!user) {
      initializedRef.current = false;
      setIsReady(false);
      setLastSyncTime(null);
      setSyncProgress({ status: "idle", step: "", percent: 0, lastSyncTime: null });
    }
  }, [user]);

  return (
    <DataSyncContext.Provider value={{ isReady, syncProgress, forceSync, lastSyncTime }}>
      {/* Sync Loading Overlay — only shown during first-time sync when no local data */}
      {user && !isReady && syncProgress.status === "syncing" && (
        <div className="fixed inset-0 z-[9999] bg-primary-bg flex items-center justify-center px-6">
          <div className="w-full max-w-sm text-center">
            <div className="location-band text-left mb-6" aria-hidden="true">
              <p className="location-band-code">STOCK OPNAME</p>
              <p className="location-band-sub">Menyiapkan data gudang</p>
            </div>

            <h2 className="text-lg font-bold text-text-primary mb-1.5">
              Mengunduh data
            </h2>
            <p className="text-meta text-text-secondary mb-5">
              {syncProgress.step}
            </p>

            <div
              className="w-full h-2.5 bg-surface-warm rounded-full overflow-hidden mb-2"
              role="progressbar"
              aria-valuenow={syncProgress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progres sinkronisasi"
            >
              <div
                className="h-full bg-ochre rounded-full transition-all duration-500 ease-out"
                style={{ width: `${syncProgress.percent}%` }}
              />
            </div>
            <p className="text-meta text-text-secondary tnum">
              {syncProgress.percent}% — hanya sekali saat pertama buka
            </p>
          </div>
        </div>
      )}

      {/* Error overlay — only when no local data and sync failed */}
      {user && !isReady && syncProgress.status === "error" && (
        <div className="fixed inset-0 z-[9999] bg-primary-bg flex items-center justify-center px-6">
          <div className="w-full max-w-sm text-center">
            <div className="rail rail-danger mb-5 py-3 text-left">
              <h2 className="text-lg font-bold text-danger">Gagal mengunduh data</h2>
              <p className="text-meta text-text-secondary mt-1">{syncProgress.step}</p>
            </div>
            <button
              onClick={() => doSync(false)}
              className="w-full min-h-touch bg-primary text-ivory font-bold rounded-input transition active:scale-[0.98]"
            >
              Coba Lagi
            </button>
          </div>
        </div>
      )}

      {children}
    </DataSyncContext.Provider>
  );
}
