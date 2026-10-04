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
import { getHistoryMonth, selectHistoryMonth, formatHistoryMonth } from "@/lib/historyPeriod";
import {
  RefreshIcon,
  XIcon,
  ClipboardIcon,
  SearchIcon,
  MapPinIcon,
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
  const allLocationsRef = useRef<Array<{ locationCode: string; productCount: number }> | null>(null);

  useEffect(() => {
    fetchHistory();

    const cachedProducts = getCache<Product[]>("allProducts");
    if (cachedProducts) allProductsRef.current = cachedProducts.data;
    const cachedLocations = getCache<Array<{ locationCode: string; productCount: number }>>("allLocations");
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
      (parseTimestamp(row.timestamp)?.getTime() || 0) > (parseTimestamp(latest.timestamp)?.getTime() || 0) ? row : latest
    );
    const location = currentHistory.some((row) => row.location === savedLocation) ? savedLocation! : newest.location;
    setExpandedGroups(new Set([location]));
  }, [currentHistory, user?.email]);

  const periodLabel = activeMonth ? formatHistoryMonth(activeMonth) : "Memuat periode";

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

    // Filter Periode: Minggu Ini (7 hari) / Bulan Ini (30 hari)
    const now = Date.now();
    const thresholdDays = timeFilter === "week" ? 7 : 30;
    const minTimestamp = now - thresholdDays * 24 * 60 * 60 * 1000;

    result = result.filter((e) => {
      const ts = parseTimestamp(e.timestamp)?.getTime();
      if (!ts) return true;
      return ts >= minTimestamp;
    });

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (e) =>
          String(e.productName || "").toLowerCase().includes(q) ||
          String(e.sku || "").toLowerCase().includes(q) ||
          String(e.batch || "").toLowerCase().includes(q) ||
          String(e.location || "").toLowerCase().includes(q) ||
          String(e.operator || "").toLowerCase().includes(q) ||
          String(e.formula || "").toLowerCase().includes(q)
      );
    }

    if (selectedLocations.size > 0) {
      result = result.filter((e) => {
        for (const prefix of selectedLocations) {
          if (e.location === prefix || e.location.startsWith(prefix + "/") || e.location.startsWith(prefix)) {
            return true;
          }
        }
        return false;
      });
    }

    // Default sorting: Terbaru menurun
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

  // Summary stats for filtered results
  const summary = useMemo(() => {
    const totalQty = filteredHistory.reduce((s, e) => s + (Number(e.qty) || 0), 0);
    return {
      count: filteredHistory.length,
      locCount: groupedHistory.length,
      totalQty,
    };
  }, [filteredHistory, groupedHistory]);

  const isGroupExpanded = (loc: string) => {
    if (searchQuery.trim()) return true;
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
          <span className="text-meta font-semibold">Entri dihapus</span>
          <button
            onClick={() => {
              undone = true;
              toast.dismiss(t.id);
              setHistory(prev);
              setCache(ck, prev);
            }}
            className="min-h-touch px-4 bg-primary text-ivory text-meta font-bold rounded-label whitespace-nowrap active:scale-95 transition"
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

  const saveInlineQty = async (entry: HistoryEntry, newQty: number, newFormula: string): Promise<boolean> => {
    if (newQty === entry.qty && newFormula === (entry.formula || "")) {
      return true;
    }
    setInlineSaving(entry.rowId);
    const editTimestamp = new Date().toISOString();

    try {
      const result = await updateEntryApi(entry.rowId, entry.sessionId, newQty, editTimestamp, {
        formula: newFormula,
      });
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

  return (
    <div className="mobile-container history-page pb-28">
      <header className="history-hero-compact">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1>Hasil opname</h1>
            <div className="compact-stats">
              <span><strong>{summary.totalQty.toLocaleString("id-ID")}</strong> pcs</span>
              <span>·</span>
              <span><strong>{summary.count.toLocaleString("id-ID")}</strong> entri</span>
              <span>·</span>
              <span><strong>{summary.locCount.toLocaleString("id-ID")}</strong> lokasi</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchHistory()}
            disabled={loading}
            className="history-refresh"
            aria-label="Muat ulang riwayat"
            title="Muat ulang"
          >
            <RefreshIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div className="history-toolbar">
        <div className="history-search">
          <SearchIcon className="w-[18px] h-[18px] shrink-0" />
          <label htmlFor="history-search" className="sr-only">Cari riwayat</label>
          <input
            id="history-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Cari produk, SKU, batch, lokasi, rumus…"
            autoComplete="off"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery("")} aria-label="Bersihkan pencarian">
              <XIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dropdown Filter Periode (Minggu & Bulan Saja) */}
        <div className="mt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
            <span className="text-meta font-bold uppercase tracking-wider text-text-secondary whitespace-nowrap">
              Periode Opname:
            </span>
            <select
              id="history-time-filter"
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value as "week" | "month")}
              className="shrink-0 max-w-full min-h-touch px-3 py-1.5 bg-surface-warm border border-border rounded-xl text-base2 font-bold text-text-primary focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer"
            >
              <option value="week">Minggu Ini (7 Hari)</option>
              <option value="month">Bulan Ini (30 Hari)</option>
            </select>
          </div>
        </div>

        {/* Chip Pilihan Area Gudang */}
        {areaGroups.length > 0 && (
          <div className="mt-2.5">
            <span className="text-meta font-bold uppercase tracking-wider text-text-secondary block mb-1.5">
              Area Gudang:
            </span>
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1" role="group" aria-label="Filter area gudang">
              {areaGroups.filter((g) => g.name === "CEN/PARAS" || g.name === "CEN/PAYU").map((group) => {
                const isSelected = selectedLocations.has(group.name);
                return (
                  <button
                    key={group.name}
                    type="button"
                    onClick={() => toggleLocation(group.name)}
                    className={`min-h-touch px-3 rounded-xl text-meta font-semibold border transition flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${
                      isSelected
                        ? "bg-primary text-ivory border-primary font-bold"
                        : "bg-paper text-text-primary border-border hover:bg-surface-warm"
                    }`}
                  >
                    <span>{group.name}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-meta font-black ${
                        isSelected ? "bg-paper/20 text-ivory" : "bg-primary-pale text-primary"
                      }`}
                    >
                      {group.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <main className="history-content">
        <div className="history-list-heading">
          <div>
            <h2>Riwayat per lokasi</h2>
            <p>
              {summary.count.toLocaleString("id-ID")} entri di {summary.locCount} lokasi
              {searchQuery || selectedLocations.size ? " · Hasil filter" : ""}
            </p>
          </div>
        </div>

        {loading && history.length === 0 ? (
          <div className="flex justify-center py-12"><LoadingSpinner /></div>
        ) : groupedHistory.length === 0 ? (
          <EmptyState
            icon={<ClipboardIcon className="w-6 h-6" />}
            title={`Tidak ada hasil opname`}
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
            const visibleEntries = showAll ? entries : entries.slice(0, INITIAL_VISIBLE_ENTRIES);
            return (
              <section key={loc} className="history-location" data-location={loc}>
                <div className="history-location-header">
                  <button
                    type="button"
                    onClick={() => toggleGroup(loc)}
                    className="history-location-toggle"
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Tutup" : "Buka"} grup ${loc}`}
                  >
                    <span className="history-location-icon"><MapPinIcon className="w-[18px] h-[18px]" /></span>
                    <span className="history-location-title"><span>LOKASI</span><strong>{loc}</strong></span>
                    {expanded ? <ChevronDownIcon className="w-4 h-4 shrink-0" /> : <ChevronRightIcon className="w-4 h-4 shrink-0" />}
                  </button>
                  <div className="history-location-summary">
                    <span>{entries.length} entri <span aria-hidden="true">·</span> <strong>{totalQty.toLocaleString("id-ID")} pcs</strong></span>
                    <DeliveryBadge rowIds={entries.map((entry) => entry.rowId)} />
                  </div>
                </div>
                {expanded && (
                  <>
                    <div className="history-record-list">
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
                    </div>
                    {entries.length > INITIAL_VISIBLE_ENTRIES && !showAll && (
                      <button
                        type="button"
                        onClick={() => setFullGroups((prev) => new Set(prev).add(loc))}
                        className="history-show-all"
                      >
                        Tampilkan semua {entries.length.toLocaleString("id-ID")} entri
                      </button>
                    )}
                    <button
                      type="button"
                      className="history-add-product"
                      onClick={() => setAddModal({ isOpen: true, location: loc })}
                      aria-label={`Tambah produk di ${loc}`}
                    >
                      <PlusIcon className="w-4 h-4" /> Tambah produk di lokasi ini
                    </button>
                  </>
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
