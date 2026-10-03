"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { flushPendingWrites } from "@/lib/api";
import { getPendingWrites, isOffline, PendingWrite } from "@/lib/localDb";
import { useAuth } from "./AuthProvider";
import {
  syncAllData,
  hasLocalData,
  getLastSyncTime,
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
  pendingWrites: PendingWrite[];
  queueReady: boolean;
  offline: boolean;
  testingOffline: boolean;
  toggleOfflineTest: () => void;
};

const DataSyncContext = createContext<DataSyncContextType>({
  isReady: false,
  syncProgress: { status: "idle", step: "", percent: 0, lastSyncTime: null },
  forceSync: async () => {},
  lastSyncTime: null,
  pendingWrites: [], queueReady: false, offline: false, testingOffline: false, toggleOfflineTest: () => {},
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
  const [pendingWrites, setPendingWrites] = useState<PendingWrite[]>([]);
  const [queueReady, setQueueReady] = useState(false);
  const pending = pendingWrites.length;
  const [queueError, setQueueError] = useState("");
  const [offline, setOffline] = useState(false);
  const [testingOffline, setTestingOffline] = useState(false);
  const syncingRef = useRef(false);
  const initializedRef = useRef(false);

  const doSync = useCallback(async (isBackground: boolean = false) => {
    if (syncingRef.current) return;
    syncingRef.current = true;

    try {
      if (isBackground && isOffline()) return;
      if (!isBackground) {
        setSyncProgress({
          status: "syncing",
          step: "Memulai sinkronisasi...",
          percent: 0,
          lastSyncTime: lastSyncTime,
        });
      }

      await flushPendingWrites();
      const result = await syncAllData((progress) => {
        setSyncProgress(progress);
      });

      const now = Date.now();
      setLastSyncTime(now);
      setIsReady(true);

      {
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
        {
          setSyncProgress(previous => ({
            ...previous, status: "error", percent: 100,
            step: previous.step.startsWith('Gagal pada tahap') ? previous.step : "Gagal mengunduh data terbaru; menggunakan data terakhir",
            lastSyncTime, error: error?.message,
          }));
        }
      } else {
        if (!isBackground) {
          setSyncProgress(previous => ({
            ...previous, status: "error", percent: 0,
            step: previous.step.startsWith('Gagal pada tahap') ? previous.step : "Unduhan belum selesai. Periksa rincian kegagalan.",
            lastSyncTime: null, error: error?.message,
          }));
        }
      }
    } finally {
      syncingRef.current = false;
    }
  }, [lastSyncTime]);

  const forceSync = useCallback(async () => {
    await doSync(false);
  }, [doSync]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const refresh = async () => {
      const jobs = await getPendingWrites();
      if (!alive) return;
      setPendingWrites(jobs);
      setQueueReady(true);
      setQueueError(jobs.find(job => job.error)?.error || "");
      setOffline(isOffline());
      setTestingOffline(localStorage.getItem("testOffline") === "true");
    };
    const reconnect = () => { void refresh(); void flushPendingWrites(); };
    void refresh();
    window.addEventListener("outbox-change", refresh);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", refresh);
    const timer = setInterval(reconnect, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("outbox-change", refresh);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", refresh);
    };
  }, [user]);

  const toggleOfflineTest = useCallback(() => {
    const next = localStorage.getItem("testOffline") !== "true";
    localStorage.setItem("testOffline", String(next));
    setTestingOffline(next);
    setOffline(isOffline());
    window.dispatchEvent(new Event("outbox-change"));
    if (!next) void flushPendingWrites();
  }, []);

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
    <DataSyncContext.Provider value={{ isReady, syncProgress, forceSync, lastSyncTime, pendingWrites, queueReady, offline, testingOffline, toggleOfflineTest }}>
      {/* Sync Loading Overlay — only shown during first-time sync when no local data */}
      {user && !isReady && syncProgress.status === "syncing" && (
        <div className="fixed inset-0 z-[80] bg-ivory flex items-center justify-center px-6">
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

            <ol className="space-y-2 text-left" aria-label="Tahap unduhan">
              {([['products', 'Mengunduh produk'], ['history', 'Mengunduh riwayat'], ['storage', 'Menyimpan di perangkat']] as const).map(([stage, label], index) => {
                const current = ['products', 'history', 'storage', 'complete'].indexOf(syncProgress.stage || 'products');
                const done = current > index;
                return <li key={stage} className={`flex justify-between gap-2 rounded-input px-3 py-2 border ${current === index ? 'border-primary bg-primary-pale font-bold' : 'border-border'}`}>
                  <span>{label}</span><span>{done ? 'Selesai' : current === index ? 'Diproses' : 'Menunggu'}</span>
                </li>;
              })}
            </ol>
          </div>
        </div>
      )}

      {/* Error overlay — only when no local data and sync failed */}
      {user && !isReady && syncProgress.status === "error" && (
        <div className="fixed inset-0 z-[80] bg-ivory flex items-center justify-center px-6">
          <div className="w-full max-w-sm text-center">
            <div className="border border-danger/30 bg-danger-bg rounded-input px-4 py-3 text-left mb-5">
              <h2 className="text-lg font-bold text-danger">Gagal mengunduh data</h2>
              <p className="text-meta text-text-secondary mt-1">{syncProgress.step}</p>
              {syncProgress.error && <p className="text-sm text-danger mt-2 break-words">{syncProgress.error}</p>}
            </div>
            <button
              onClick={() => {
                if (localStorage.getItem("testOffline") === "true") {
                  localStorage.setItem("testOffline", "false");
                  setTestingOffline(false);
                  setOffline(isOffline());
                }
                void doSync(false);
              }}
              className="w-full min-h-touch bg-primary text-ivory font-bold rounded-input transition active:scale-[0.98]"
            >
              {testingOffline ? "Akhiri uji offline dan unduh" : "Coba Lagi"}
            </button>
          </div>
        </div>
      )}

      {user && <div className={`mobile-sync-status border-b px-4 py-1.5 ${queueError || syncProgress.status === 'error' ? 'bg-amber-bg border-amber-text/30' : 'bg-surface-warm border-border'}`} role="status" aria-live="polite">
        <div className="mx-auto max-w-[480px] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            <p className="font-bold">{!queueReady ? 'Memeriksa status' : queueError ? 'Gagal kirim' : pending ? (offline ? 'Tersimpan di perangkat' : 'Menunggu kirim') : syncProgress.status === 'syncing' ? 'Mengunduh data' : syncProgress.status === 'error' ? 'Gagal unduh data' : isReady ? (offline ? 'Tersimpan di perangkat' : 'Tersinkron') : 'Menyiapkan data'} <span className="font-normal">· {offline ? 'Offline' : 'Online'}{testingOffline ? ' (uji)' : ''}</span></p>
            <p className="text-meta text-text-secondary">{pending ? `${pending} perubahan belum terkirim. ` : ''}{lastSyncTime ? `Data diperbarui ${new Date(lastSyncTime).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Belum ada unduhan lengkap'}</p>
          </div>
          {pending > 0 && !offline && <button className="min-h-touch px-3 border border-border rounded-input font-bold" onClick={() => void flushPendingWrites()}>Kirim ulang</button>}
          {syncProgress.status === 'error' && !offline && <button className="min-h-touch px-3 border border-border rounded-input font-bold" onClick={() => void forceSync()}>Coba unduh lagi</button>}
        </div>
        {queueError && <p className="mx-auto max-w-[480px] text-sm text-danger break-words">{queueError}. Data tetap tersimpan di perangkat.</p>}
        {isReady && syncProgress.status === 'error' && <p className="mx-auto max-w-[480px] text-sm text-danger break-words">{syncProgress.error}</p>}
        {isReady && syncProgress.status === 'syncing' && <p className="mx-auto max-w-[480px] text-sm">{syncProgress.step}</p>}
      </div>}
      {children}
    </DataSyncContext.Provider>
  );
}
