"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { flushPendingWrites } from "@/lib/api";
import { getPendingWrites, isOffline, PendingWrite } from "@/lib/localDb";
import { useAuth } from "./AuthProvider";
import {
  syncAllData,
  hasLocalData,
  getLastSyncTime,
  SyncProgress,
} from "@/lib/localDb";

// ── Context Types ──────────────────────────────────────────────

type DataSyncContextType = {
  /** Whether the initial sync has completed (data is ready to use) */
  isReady: boolean;
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

const defaultSyncProgress: SyncProgress = {
  status: "idle",
  step: "",
  percent: 0,
  lastSyncTime: null,
};

const DataSyncContext = createContext<DataSyncContextType>({
  isReady: false,
  forceSync: async () => {},
  lastSyncTime: null,
  pendingWrites: [],
  queueReady: false,
  offline: false,
  testingOffline: false,
  toggleOfflineTest: () => {},
});

const SyncProgressContext = createContext<SyncProgress>(defaultSyncProgress);

export const useDataSync = () => useContext(DataSyncContext);
export const useSyncProgress = () => useContext(SyncProgressContext);

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
      setPendingWrites((prev) =>
        prev.length === 0 && jobs.length === 0 ? prev : jobs
      );
      setQueueReady(true);
      setQueueError(jobs.find((job) => job.error)?.error || "");
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

  const dataSyncValue = useMemo<DataSyncContextType>(
    () => ({
      isReady,
      forceSync,
      lastSyncTime,
      pendingWrites,
      queueReady,
      offline,
      testingOffline,
      toggleOfflineTest,
    }),
    [
      isReady,
      forceSync,
      lastSyncTime,
      pendingWrites,
      queueReady,
      offline,
      testingOffline,
      toggleOfflineTest,
    ]
  );

  return (
    <DataSyncContext.Provider value={dataSyncValue}>
      <SyncProgressContext.Provider value={syncProgress}>
      {/* Sync Loading Overlay — only shown during first-time sync when no local data */}
      {user && !isReady && syncProgress.status === "syncing" && (
        <div className="fixed inset-0 z-[80] bg-gradient-to-b from-[#D7F4F4] via-[#ECF9F9] to-[#F4FCFC] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-[#8ADBD9]/80 shadow-card p-5 text-center">
            <div className="location-band text-left mb-4" aria-hidden="true">
              <p className="location-band-code">STOCK OPNAME</p>
              <p className="location-band-sub">Menyiapkan data gudang</p>
            </div>

            <h2 className="text-base font-bold text-[#0D3B40] mb-1">
              Mengunduh data
            </h2>
            <p className="text-xs text-[#487277] mb-4">
              {syncProgress.step}
            </p>

            <ol className="space-y-2 text-left text-xs" aria-label="Tahap unduhan">
              {([['products', 'Mengunduh produk'], ['history', 'Mengunduh riwayat'], ['storage', 'Menyimpan di perangkat']] as const).map(([stage, label], index) => {
                const current = ['products', 'history', 'storage', 'complete'].indexOf(syncProgress.stage || 'products');
                const done = current > index;
                return <li key={stage} className={`flex justify-between gap-2 rounded-xl px-3.5 py-2.5 border ${current === index ? 'border-[#82D6D5] bg-[#D8F5F4] text-[#0B666E] font-semibold' : 'border-[#CBEFED] bg-[#EFFAFA] text-[#487277]'}`}>
                  <span>{label}</span><span>{done ? 'Selesai' : current === index ? 'Diproses' : 'Menunggu'}</span>
                </li>;
              })}
            </ol>
          </div>
        </div>
      )}

      {/* Error overlay — only when no local data and sync failed */}
      {user && !isReady && syncProgress.status === "error" && (
        <div className="fixed inset-0 z-[80] bg-gradient-to-b from-[#D7F4F4] via-[#ECF9F9] to-[#F4FCFC] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl border border-[#8ADBD9]/80 shadow-card p-5 text-center space-y-4">
            <div className="border border-[#DC2626]/20 bg-[#FEF2F2] rounded-2xl px-4 py-3 text-left">
              <h2 className="text-base font-bold text-[#DC2626]">Gagal mengunduh data</h2>
              <p className="text-xs text-[#487277] mt-1">{syncProgress.step}</p>
              {syncProgress.error && <p className="text-xs text-[#DC2626] mt-2 break-words">{syncProgress.error}</p>}
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
              className="w-full min-h-[48px] bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white text-sm font-semibold rounded-xl shadow-subtle transition-transform duration-150 active:scale-[0.98]"
            >
              {testingOffline ? "Akhiri uji offline dan unduh" : "Coba Lagi"}
            </button>
          </div>
        </div>
      )}

      {user && (
        <div
          className={`mobile-sync-status max-w-md mx-auto w-full border-b px-3.5 py-1.5 flex items-center justify-between text-xs transition-colors sm:border-x sm:border-[#8ADBD9]/65 ${
            queueError || syncProgress.status === "error"
              ? "bg-[#FFFBEB] border-[#F59E0B]/30 text-[#B45309]"
              : "bg-[#DDF5F5] border-[#96DEDD] text-[#0B5A60]"
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="w-full flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  queueError || syncProgress.status === "error"
                    ? "bg-[#DC2626]"
                    : pending || offline || testingOffline
                    ? "bg-[#D97706]"
                    : syncProgress.status === "syncing"
                    ? "bg-[#0E838C] animate-pulse"
                    : "bg-[#16A34A]"
                }`}
              />
              <span className="font-semibold text-[#0D3B40] truncate">
                {!queueReady
                  ? "Cek status…"
                  : queueError
                  ? "Gagal kirim"
                  : pending
                  ? offline
                    ? `${pending} tersimpan di HP`
                    : `${pending} belum terkirim`
                  : syncProgress.status === "syncing"
                  ? "Sinkron…"
                  : syncProgress.status === "error"
                  ? "Gagal unduh"
                  : offline
                  ? "Tersimpan di HP"
                  : "Tersinkron"}
              </span>
              <span className="text-[#487277]/60">·</span>
              <span className="text-[#487277] truncate">
                {offline ? "Offline" : "Online"}
                {testingOffline ? " (uji)" : ""}
              </span>
              {lastSyncTime && (
                <>
                  <span className="text-[#487277]/60">·</span>
                  <span className="font-mono text-xs text-[#487277] tabular-nums tnum">
                    {new Date(lastSyncTime).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </>
              )}
            </div>

            {(pending > 0 || syncProgress.status === "error") && !offline && (
              <div className="flex items-center gap-1.5 shrink-0">
                {pending > 0 && (
                  <button
                    type="button"
                    className="min-h-[44px] px-3 bg-gradient-to-r from-[#0E838C] to-[#14B8A6] text-white rounded-xl text-xs font-semibold active:scale-[0.98] transition-transform"
                    onClick={() => void flushPendingWrites()}
                  >
                    Kirim ({pending})
                  </button>
                )}
                {syncProgress.status === "error" && (
                  <button
                    type="button"
                    className="min-h-[44px] px-3 bg-[#FFFBEB] hover:bg-amber-100 text-[#B45309] border border-[#F59E0B]/30 rounded-xl text-xs font-semibold active:scale-[0.98] transition-transform"
                    onClick={() => void forceSync()}
                  >
                    Coba lagi
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {children}
      </SyncProgressContext.Provider>
    </DataSyncContext.Provider>
  );
}
