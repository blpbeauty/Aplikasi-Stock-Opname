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
        <div className="fixed inset-0 z-[9999] bg-white flex items-center justify-center">
          <div className="w-full max-w-sm px-8 text-center">
            {/* Animated icon */}
            <div className="mb-6">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary to-primary-light flex items-center justify-center shadow-lg">
                <svg className="w-10 h-10 text-white animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                </svg>
              </div>
            </div>

            <h2 className="text-lg font-bold text-text-primary mb-2">
              Menyiapkan Data
            </h2>
            <p className="text-sm text-text-secondary mb-6">
              {syncProgress.step}
            </p>

            {/* Progress bar */}
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary-light rounded-full transition-all duration-500 ease-out"
                style={{ width: `${syncProgress.percent}%` }}
              />
            </div>
            <p className="text-xs text-text-secondary">
              {syncProgress.percent}% — Mohon tunggu, hanya sekali saat pertama buka
            </p>
          </div>
        </div>
      )}

      {/* Error overlay — only when no local data and sync failed */}
      {user && !isReady && syncProgress.status === "error" && (
        <div className="fixed inset-0 z-[9999] bg-white flex items-center justify-center">
          <div className="w-full max-w-sm px-8 text-center">
            <div className="mb-6">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-red-50 flex items-center justify-center">
                <svg className="w-10 h-10 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
              </div>
            </div>

            <h2 className="text-lg font-bold text-text-primary mb-2">
              Gagal Mengunduh Data
            </h2>
            <p className="text-sm text-text-secondary mb-6">
              {syncProgress.step}
            </p>

            <button
              onClick={() => doSync(false)}
              className="w-full py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition active:scale-95"
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
