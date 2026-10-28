"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import DeliveryBadge from "@/components/DeliveryBadge";
import { useDataSync } from "@/components/DataSyncProvider";
import BottomNav from "@/components/BottomNav";
import EditModal, { EditData } from "@/components/EditModal";
import AddHistoryEntryModal from "@/components/AddHistoryEntryModal";
import LoadingSpinner from "@/components/LoadingSpinner";
import HistoryRecord from "@/components/HistoryRecord";
import ConfirmModal from "@/components/ConfirmModal";
import { EmptyState } from "@/components/ui";
import {
  getHistoryApi,
  updateEntryApi,
  deleteEntryApi,
  getAllProductsApi,
  getAllLocationsApi,
} from "@/lib/api";
import { HistoryEntry, Product } from "@/lib/types";
import { getCache, setCache, clearCache } from "@/lib/cache";
import { deleteHistoryEntryLocal } from "@/lib/localDb";
import { parseTimestamp } from "@/lib/format";
import { getHistoryMonth, selectHistoryMonth } from "@/lib/historyPeriod";
import {
  RefreshIcon,
  ClipboardIcon,
  SearchIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
} from "@/components/icons";
import toast from "react-hot-toast";

/** Entri maksimum yang dirender per grup sebelum tombol "Tampilkan semua". */
const INITIAL_VISIBLE_ENTRIES = 20;

export default function HistoryPage() {
  const { user } = useAuth();
  const { isReady, lastSyncTime } = useDataSync();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Add modal state
  const [addModal, setAddModal] = useState<{
    isOpen: boolean;
    location: string;
  }>({
    isOpen: false,
    location: "",
  });

  // Delete modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    entry: HistoryEntry | null;
  }>({
    isOpen: false,
    entry: null,
  });

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<"week" | "month">("week");
  const [activeMonth, setActiveMonth] = useState("");
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());

  // Grup lokasi dilipat secara default
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // Grup yang entri-nya ditampilkan semua
  const [fullGroups, setFullGroups] = useState<Set<string>>(new Set());

  const [inlineSaving, setInlineSaving] = useState<string | null>(null);
  const initializedGroups = useRef(false);

  const allProductsRef = useRef<Product[] | null>(null);
  const allLocationsRef = useRef<Array<{ locationCode: string; productCount: number }> | null>(
    null
  );

  useEffect(() => {
    fetchHistory();

    const cachedProducts = getCache<Product[]>("allProducts");
    if (cachedProducts) allProductsRef.current = cachedProducts.data;
    const cachedLocations = getCache<Array<{ locationCode: string; productCount: number }>>(
      "allLocations"
    );
    if (cachedLocations) allLocationsRef.current = cachedLocations.data;

    getAllProductsApi()
      .then((res) => {
        if (res.success && res.products) {
          allProductsRef.current = res.products;
          setCache("allProducts", res.products);
        }
      })
      .catch(() => {});

    getAllLocationsApi()
      .then((res) => {
        if (res.success && res.locations) {
          allLocationsRef.current = res.locations;
          setCache("allLocations", res.locations);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isReady]);

  const normalizeEntry = (e: any): HistoryEntry => ({
    ...e,
    rowId: String(e.rowId ?? ""),
    sessionId: String(e.sessionId ?? ""),
    timestamp: String(e.timestamp ?? ""),
    operator: String(e.operator ?? ""),
    location: String(e.location ?? ""),
    productName: String(e.productName ?? ""),
    sku: String(e.sku ?? ""),
    batch: String(e.batch ?? ""),
    qty: Number(e.qty) || 0,
    edited: String(e.edited ?? ""),
    editTimestamp: String(e.editTimestamp ?? ""),
    formula: String(e.formula ?? ""),
  });

  const fetchHistory = async () => {
    if (!user) return;
    const ck = `history:ALL:all`;
    const cached = getCache<HistoryEntry[]>(ck);
    if (cached) {
      setHistory(cached.data.map(normalizeEntry));
      setLoading(false);
    }

    try {
      const result = await getHistoryApi(user.email, undefined, true);
      if (result.success && result.history) {
        const normalized = result.history.map(normalizeEntry);
        setHistory(normalized);
        setCache(ck, normalized);
      } else if (!cached) {
        toast.error(result.message || "Gagal mengambil riwayat");
      }
    } catch (error) {
      console.error("Fetch history error:", error);
      if (!cached) toast.error("Terjadi kesalahan saat mengambil riwayat");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isReady || !user) return;
    const refresh = () => void fetchHistory();
    refresh();
    window.addEventListener("outbox-change", refresh);
    return () => window.removeEventListener("outbox-change", refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, lastSyncTime, user?.email]);

  useEffect(() => {
    const refreshPeriod = () => setActiveMonth(getHistoryMonth());
    refreshPeriod();
    const timer = window.setInterval(refreshPeriod, 60_000);
    window.addEventListener("focus", refreshPeriod);
    document.addEventListener("visibilitychange", refreshPeriod);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshPeriod);
      document.removeEventListener("visibilitychange", refreshPeriod);
    };
  }, []);

  useEffect(() => {
    setSelectedLocations(new Set());
    setIsModalOpen(false);
    setSelectedEntry(null);
    setDeleteModal({ isOpen: false, entry: null });
    initializedGroups.current = false;
    setAddModal({ isOpen: false, location: "" });
  }, [activeMonth]);

  const currentHistory = useMemo(
    () => selectHistoryMonth(history, activeMonth),
    [history, activeMonth]
  );

  useEffect(() => {
    if (initializedGroups.current || !currentHistory.length) return;
    initializedGroups.current = true;
    const savedLocation = localStorage.getItem(`lastSaveLocation:${user?.email}`);
    const newest = currentHistory.reduce((latest, row) =>
      (parseTimestamp(row.timestamp)?.getTime() || 0) >
      (parseTimestamp(latest.timestamp)?.getTime() || 0)
        ? row
        : latest
    );
    const location = currentHistory.some((row) => row.location === savedLocation)
      ? savedLocation!
      : newest.location;
    setExpandedGroups(new Set([location]));
  }, [currentHistory, user?.email]);

  // Ekstraksi area grup seperti CEN/PARAS, CEN/PAYU
  const areaGroups = useMemo(() => {
    const groupMap = new Map<string, number>();
    history.forEach((e) => {
      const parts = String(e.location || "").split("/");
      const groupKey = parts.length >= 2 ? parts.slice(0, 2).join("/") : parts[0];
      if (groupKey) {
        groupMap.set(groupKey, (groupMap.get(groupKey) || 0) + 1);
      }
    });
    return Array.from(groupMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [history]);

  const toggleLocation = (locName: string) => {
    setSelectedLocations((prev) => {
      const next = new Set(prev);
      if (next.has(locName)) next.delete(locName);
      else next.add(locName);
      return next;
    });
  };

  const filteredHistory = useMemo(() => {
    let result = history;

    const now = Date.now();
    const thresholdDays = timeFilter === "week" ? 7 : 30;
    const minTimestamp = now - thresholdDays * 24 * 60 * 60 * 1000;

    result = result.filter((e) => {
      const ts = parseTimestamp(e.timestamp)?.getTime();
      if (!ts) return true;
      return ts >= minTimestamp;
    });

    const trimmedQuery = String(searchQuery || "").trim().toLowerCase();
    if (trimmedQuery) {
      result = result.filter(
        (e) =>
          String(e.productName || "").toLowerCase().includes(trimmedQuery) ||
          String(e.sku || "").toLowerCase().includes(trimmedQuery) ||
          String(e.batch || "").toLowerCase().includes(trimmedQuery) ||
          String(e.location || "").toLowerCase().includes(trimmedQuery) ||
          String(e.operator || "").toLowerCase().includes(trimmedQuery) ||
          String(e.formula || "").toLowerCase().includes(trimmedQuery)
      );
    }

    if (selectedLocations.size > 0) {
      result = result.filter((e) => {
        for (const prefix of selectedLocations) {
          if (
            e.location === prefix ||
            e.location.startsWith(prefix + "/") ||
            e.location.startsWith(prefix)
          ) {
            return true;
          }
        }
        return false;
      });
    }

    return [...result].sort((a, b) => {
      const ta = parseTimestamp(a.timestamp)?.getTime() || 0;
      const tb = parseTimestamp(b.timestamp)?.getTime() || 0;
      return tb - ta;
    });
  }, [history, timeFilter, searchQuery, selectedLocations]);

  // Grouped by location
  const groupedHistory = useMemo(() => {
    const groups = new Map<string, HistoryEntry[]>();
    filteredHistory.forEach((e) => {
      if (!groups.has(e.location)) groups.set(e.location, []);
      groups.get(e.location)!.push(e);
    });
    return Array.from(groups.entries()).sort((a, b) => {
      const latestA = Math.max(...a[1].map((e) => parseTimestamp(e.timestamp)?.getTime() || 0));
      const latestB = Math.max(...b[1].map((e) => parseTimestamp(e.timestamp)?.getTime() || 0));
      return latestB - latestA;
    });
  }, [filteredHistory]);

  // Summary stats
  const summary = useMemo(() => {
    const totalQty = filteredHistory.reduce((s, e) => s + (Number(e.qty) || 0), 0);
    return {
      count: filteredHistory.length,
      locCount: groupedHistory.length,
      totalQty,
    };
  }, [filteredHistory, groupedHistory]);

  const isGroupExpanded = (loc: string) => {
    if (String(searchQuery || "").trim()) return true;
    return expandedGroups.has(loc);
  };

  const toggleGroup = (loc: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(loc)) next.delete(loc);
      else next.add(loc);
      return next;
    });
  };

  const handleEdit = (entry: HistoryEntry) => {
    setSelectedEntry(entry);
    setIsModalOpen(true);
  };

  const promptDelete = (entry: HistoryEntry) => {
    setDeleteModal({ isOpen: true, entry });
  };

  const confirmDelete = async () => {
    if (!deleteModal.entry) return;
    const entry = deleteModal.entry;
    setDeleteModal({ isOpen: false, entry: null });

    const prev = [...history];
    const updated = history.filter((e) => e.rowId !== entry.rowId);
    setHistory(updated);

    const ck = `history:ALL:all`;
    setCache(ck, updated);
    clearCache("products:");

    if (entry.rowId.startsWith("optimistic_")) {
      deleteHistoryEntryLocal(entry.rowId).catch(() => {});
      toast.success("Entri dihapus");
      return;
    }

    let undone = false;
    toast(
      (t) => (
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold">Entri dihapus</span>
          <button
            onClick={() => {
              undone = true;
              toast.dismiss(t.id);
              setHistory(prev);
              setCache(ck, prev);
            }}
            className="h-7 px-3 bg-[#2E5339] hover:bg-[#3D6E4C] text-white text-xs font-bold rounded whitespace-nowrap"
          >
            Batalkan
          </button>
        </div>
      ),
      { duration: 5000, id: `undo-${entry.rowId}` }
    );

    await new Promise((r) => setTimeout(r, 5500));
    if (undone) return;

    try {
      const result = await deleteEntryApi(entry.rowId);
      if (!result.success) {
        if (/tidak ditemukan/i.test(result.message || "")) {
          deleteHistoryEntryLocal(entry.rowId).catch(() => {});
          return;
        }
        setHistory(prev);
        setCache(ck, prev);
        toast.error(result.message || "Gagal menghapus, data dikembalikan");
      }
    } catch {
      setHistory(prev);
      setCache(ck, prev);
      toast.error("Gagal menghapus, data dikembalikan");
    }
  };

  const handleSaveEdit = async (data: EditData) => {
    if (!selectedEntry) return;
    const editTimestamp = new Date().toISOString();
    setIsModalOpen(false);
    setInlineSaving(selectedEntry.rowId);

    try {
      const result = await updateEntryApi(
        selectedEntry.rowId,
        selectedEntry.sessionId,
        data.newQty,
        editTimestamp,
        {
          productName: data.productName,
          sku: data.sku,
          batch: data.batch,
          formula: data.formula,
          location: data.location,
        }
      );
      if (!result.success) {
        setInlineSaving(null);
        toast.error(result.message || "Gagal mengupdate, data tidak diubah");
        return;
      }
    } catch {
      setInlineSaving(null);
      toast.error("Gagal mengupdate, data tidak diubah");
      return;
    }

    const updated = history.map((e) =>
      e.rowId === selectedEntry.rowId
        ? {
            ...e,
            productName: data.productName ?? e.productName,
            sku: data.sku ?? e.sku,
            batch: data.batch ?? e.batch,
            location: data.location ?? e.location,
            qty: data.newQty,
            formula: data.formula ?? e.formula,
            edited: "Yes",
            editTimestamp,
          }
        : e
    );
    setHistory(updated);
    setCache(`history:ALL:all`, updated);
    clearCache("products:");
    setInlineSaving(null);
    if (data.location) {
      setExpandedGroups((prev) => new Set(prev).add(data.location!));
      toast.success(`Perubahan ke ${data.location} tersimpan di perangkat`);
    }
  };

  const handleAddSuccess = (newEntry: HistoryEntry) => {
    setExpandedGroups((prev) => new Set(prev).add(newEntry.location));
    localStorage.setItem(`lastSaveLocation:${user?.email}`, newEntry.location);
    const updated = [newEntry, ...history];
    setHistory(updated);
    setCache(`history:ALL:all`, updated);
    if (user?.email) {
      setCache(`history:${user.email}:all`, updated);
    }
    clearCache("products:");
  };

  const saveInlineQty = async (
    entry: HistoryEntry,
    newQty: number,
    newFormula: string
  ): Promise<boolean> => {
    if (newQty === entry.qty && newFormula === (entry.formula || "")) {
      return true;
    }
    setInlineSaving(entry.rowId);
    const editTimestamp = new Date().toISOString();

    try {
      const result = await updateEntryApi(
        entry.rowId,
        entry.sessionId,
        newQty,
        editTimestamp,
        {
          formula: newFormula,
        }
      );
      if (!result.success) {
        setInlineSaving(null);
        toast.error(result.message || "Gagal update qty, data tidak diubah");
        return false;
      }
    } catch {
      setInlineSaving(null);
      toast.error("Gagal update qty, data tidak diubah");
      return false;
    }

    const updated = history.map((e) =>
      e.rowId === entry.rowId
        ? { ...e, qty: newQty, formula: newFormula, edited: "Yes", editTimestamp }
        : e
    );
    setHistory(updated);
    setCache(`history:ALL:all`, updated);
    clearCache("products:");
    setInlineSaving(null);
    return true;
  };

  const activeAreas = areaGroups.filter(
    (g) => g.name === "CEN/PARAS" || g.name === "CEN/PAYU"
  );

  return (
    <div className="max-w-md mx-auto min-h-dvh bg-[#F8FAFC] text-[#0F172A] pb-24 border-x border-slate-200 font-sans antialiased">
      {/* ============================================================== */}
      {/* 1. COMPACT TOP HEADER (~46px, Sticky - Deep Pistachio)        */}
      {/* ============================================================== */}
      <header className="sticky top-0 z-30 h-11 min-h-[46px] bg-[#2E5339] text-white border-b border-[#203B28] px-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs font-bold bg-white/15 border border-white/25 text-white px-2 py-0.5 rounded tracking-wide">
            RIWAYAT
          </span>
          <h1 className="text-sm font-bold text-white truncate">Hasil Opname</h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="font-mono text-xs text-emerald-100 tabular-nums tnum">
            <strong className="font-bold text-white">
              {summary.totalQty.toLocaleString("id-ID")}
            </strong>{" "}
            <span className="font-sans text-[11px] text-emerald-200/80">Pcs</span>
            <span className="text-white/25 mx-1">·</span>
            <strong className="font-bold text-white">{summary.locCount}</strong>{" "}
            <span className="font-sans text-[11px] text-emerald-200/80">Rak</span>
          </div>

          <button
            type="button"
            onClick={() => fetchHistory()}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded border border-white/25 bg-white/15 hover:bg-white/25 active:bg-white/30 text-white disabled:opacity-40 transition-colors"
            aria-label="Muat ulang riwayat"
            title="Muat ulang"
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* ============================================================== */}
      {/* 2. DENSE SEARCH & FILTER BAR (~80px, Sticky)                   */}
      {/* ============================================================== */}
      <div className="sticky top-11 z-20 bg-white border-b border-slate-200 px-3 py-2 space-y-1.5">
        {/* Baris 1: Slim Search Input (h-9 text-sm) */}
        <div className="relative flex items-center">
          <SearchIcon className="w-4 h-4 text-slate-400 absolute left-2.5 pointer-events-none" />
          <label htmlFor="history-search" className="sr-only">
            Cari riwayat
          </label>
          <input
            id="history-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Cari nama barang, SKU, batch, lokasi…"
            autoComplete="off"
            className="w-full h-9 pl-8 pr-8 bg-slate-50 border border-slate-300 rounded text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#2E5339] transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Bersihkan pencarian"
              className="absolute right-1.5 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-700 font-mono text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Baris 2: Compact Period Tabs + Area Chips (h-7 text-xs) */}
        <div className="flex items-center justify-between gap-1.5 overflow-x-auto hide-scrollbar">
          {/* Segmented Period Filter */}
          <div className="flex items-center p-0.5 bg-slate-100 rounded h-7 shrink-0 text-xs font-medium">
            <button
              type="button"
              onClick={() => setTimeFilter("week")}
              className={`h-6 px-2.5 rounded transition-colors ${
                timeFilter === "week"
                  ? "bg-white text-slate-900 font-semibold shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              7 Hari
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter("month")}
              className={`h-6 px-2.5 rounded transition-colors ${
                timeFilter === "month"
                  ? "bg-white text-slate-900 font-semibold shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              30 Hari
            </button>
          </div>

          {/* Area Gudang Filter Chips (CEN/PARAS & CEN/PAYU) */}
          {activeAreas.length > 0 && (
            <div
              className="flex items-center gap-1 shrink-0"
              role="group"
              aria-label="Filter area gudang"
            >
              {activeAreas.map((group) => {
                const isSelected = selectedLocations.has(group.name);
                return (
                  <button
                    key={group.name}
                    type="button"
                    onClick={() => toggleLocation(group.name)}
                    className={`h-7 px-2 rounded border text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
                      isSelected
                        ? "bg-[#2E5339] text-white border-[#2E5339]"
                        : "bg-[#EAF2EB] text-[#2E5339] border-[#BDD7C4] hover:bg-[#D6E8DC]"
                    }`}
                  >
                    <span className="font-mono text-[11px]">{group.name}</span>
                    <span
                      className={`font-mono text-[10px] px-1 rounded tabular-nums tnum ${
                        isSelected
                          ? "bg-[#3D6E4C] text-white"
                          : "bg-white/80 text-[#2E5339]"
                      }`}
                    >
                      {group.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. DENSE GROUPED HISTORY LIST                                  */}
      {/* ============================================================== */}
      <main className="p-3 space-y-2.5">
        <div className="flex items-center justify-between text-xs text-slate-500 px-0.5">
          <span>
            Menampilkan{" "}
            <strong className="font-mono font-bold text-slate-800 tnum">
              {summary.count.toLocaleString("id-ID")}
            </strong>{" "}
            entri di{" "}
            <strong className="font-mono font-bold text-slate-800 tnum">
              {summary.locCount}
            </strong>{" "}
            lokasi
          </span>
          {(searchQuery || selectedLocations.size > 0) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedLocations(new Set());
              }}
              className="font-semibold text-blue-600 hover:underline"
            >
              Reset Filter
            </button>
          )}
        </div>

        {loading && history.length === 0 ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : groupedHistory.length === 0 ? (
          <EmptyState
            icon={<ClipboardIcon className="w-6 h-6" />}
            title="Tidak ada hasil opname"
            description={
              searchQuery || selectedLocations.size > 0
                ? "Tidak ada hasil yang cocok dengan filter yang dipilih."
                : "Belum ada produk yang dicatat pada periode ini."
            }
          />
        ) : (
          groupedHistory.map(([loc, entries]) => {
            const totalQty = entries.reduce((sum, entry) => sum + (Number(entry.qty) || 0), 0);
            const expanded = isGroupExpanded(loc);
            const showAll = fullGroups.has(loc);
            const visibleEntries = showAll
              ? entries
              : entries.slice(0, INITIAL_VISIBLE_ENTRIES);

            return (
              <section
                key={loc}
                data-location={loc}
                className="bg-white border border-slate-200 rounded overflow-hidden"
              >
                {/* Compact Location Group Header (~40px) */}
                <button
                  type="button"
                  onClick={() => toggleGroup(loc)}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Tutup" : "Buka"} grup ${loc}`}
                  className="w-full px-3 py-2 bg-slate-100/80 hover:bg-slate-100 flex items-center justify-between gap-2 text-left transition-colors"
                >
                  <div className="min-w-0 flex-1 pr-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-bold bg-[#EAF2EB] text-[#2E5339] border border-[#BDD7C4] px-1.5 py-0.5 rounded uppercase tnum">
                        {loc}
                      </span>
                      <span className="font-mono text-xs text-slate-600 tabular-nums tnum">
                        {entries.length} SKU ·{" "}
                        <strong className="font-bold text-slate-900">
                          {totalQty.toLocaleString("id-ID")} Pcs
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <DeliveryBadge rowIds={entries.map((entry) => entry.rowId)} />
                    {expanded ? (
                      <ChevronDownIcon className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronRightIcon className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-slate-200 divide-y divide-slate-200">
                    {visibleEntries.map((entry) => (
                      <HistoryRecord
                        key={entry.rowId}
                        entry={entry}
                        saving={inlineSaving === entry.rowId}
                        onEdit={() => handleEdit(entry)}
                        onDelete={() => promptDelete(entry)}
                        onSaveCount={(qty, formula) => saveInlineQty(entry, qty, formula)}
                      />
                    ))}

                    {entries.length > INITIAL_VISIBLE_ENTRIES && !showAll && (
                      <button
                        type="button"
                        onClick={() => setFullGroups((prev) => new Set(prev).add(loc))}
                        className="w-full h-9 px-3 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-blue-600 flex items-center justify-center transition-colors"
                      >
                        Tampilkan semua {entries.length.toLocaleString("id-ID")} entri
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setAddModal({ isOpen: true, location: loc })}
                      aria-label={`Tambah produk di ${loc}`}
                      className="w-full h-9 px-3 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                      <span>Tambah Produk di Rak {loc}</span>
                    </button>
                  </div>
                )}
              </section>
            );
          })
        )}
      </main>

      {/* Modal edit */}
      {selectedEntry && (
        <EditModal
          entry={selectedEntry}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedEntry(null);
          }}
          onSave={handleSaveEdit}
          allProducts={allProductsRef.current || undefined}
        />
      )}

      {/* Modal tambah produk di lokasi */}
      {addModal.isOpen && (
        <AddHistoryEntryModal
          isOpen={addModal.isOpen}
          initialLocation={addModal.location}
          onClose={() => setAddModal({ isOpen: false, location: "" })}
          onSuccess={handleAddSuccess}
          allProducts={allProductsRef.current || undefined}
        />
      )}

      {/* Konfirmasi hapus */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title="Hapus Riwayat Opname?"
        message={`Apakah Anda yakin ingin menghapus catatan produk "${deleteModal.entry?.productName}" (Qty: ${deleteModal.entry?.qty})?`}
        confirmText="Hapus Entri"
        cancelText="Batal"
        isDanger
        onConfirm={confirmDelete}
        onClose={() => setDeleteModal({ isOpen: false, entry: null })}
      />

      <BottomNav activePage="history" />
    </div>
  );
}
