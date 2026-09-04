"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import EditModal, { EditData } from "@/components/EditModal";
import AddHistoryEntryModal from "@/components/AddHistoryEntryModal";
import LoadingSpinner from "@/components/LoadingSpinner";
import QtyInput from "@/components/QtyInput";
import ConfirmModal from "@/components/ConfirmModal";
import { EmptyState, IconButton } from "@/components/ui";
import {
  getHistoryApi,
  updateEntryApi,
  deleteEntryApi,
  warmupCacheApi,
  getAllProductsApi,
  getAllLocationsApi,
} from "@/lib/api";
import { HistoryEntry, Product } from "@/lib/types";
import { getCache, setCache, clearCache } from "@/lib/cache";
import { parseTimestamp, formatDisplayTime, toDateStr } from "@/lib/format";
import {
  RefreshIcon,
  PencilIcon,
  TrashIcon,
  XIcon,
  ClipboardIcon,
  CalculatorIcon,
  UserIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
} from "@/components/icons";
import toast from "react-hot-toast";

export default function HistoryPage() {
  const { user } = useAuth();
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
  const [filterDate, setFilterDate] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "today" | "week" | "month">("all");
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());

  // Collapsed location groups (expanded by default while searching/filtering dates)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Inline edit state
  const [editingBatch, setEditingBatch] = useState<string | null>(null);
  const [editingBatchValue, setEditingBatchValue] = useState("");
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState(0);
  const [editingQtyFormula, setEditingQtyFormula] = useState("");
  const [inlineSaving, setInlineSaving] = useState<string | null>(null);

  const allProductsRef = useRef<Product[] | null>(null);
  const allLocationsRef = useRef<Array<{ locationCode: string; productCount: number }> | null>(null);

  // Batches for inline edit
  const inlineBatchesForSku = useMemo(() => {
    if (!editingBatch) return [];
    const entry = history.find((e) => e.rowId === editingBatch);
    if (!entry) return [];
    const skuVal = entry.sku.trim().toLowerCase();
    if (!skuVal) return [];
    const all = allProductsRef.current || [];
    const batchSet = new Set<string>();
    all.forEach((p) => {
      if (p.sku.trim().toLowerCase() === skuVal && p.batch) {
        batchSet.add(p.batch);
      }
    });
    return Array.from(batchSet).sort();
  }, [editingBatch, history]);

  useEffect(() => {
    fetchHistory();
    warmupCacheApi().catch(() => {});

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
  }, [user]);

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

    const lastSave = Number(localStorage.getItem("lastSaveTs") || "0");
    const sinceSave = Date.now() - lastSave;
    if (sinceSave < 15_000) {
      await new Promise((r) => setTimeout(r, Math.max(15_000 - sinceSave, 0)));
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

  // Filter tab change helper
  const handleTabChange = (tab: "all" | "today" | "week" | "month") => {
    setActiveTab(tab);
    const now = new Date();

    if (tab === "all") {
      setFilterDate("");
      setFilterDateEnd("");
    } else if (tab === "today") {
      setFilterDate(toDateStr(now));
      setFilterDateEnd("");
    } else if (tab === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setFilterDate(toDateStr(weekAgo));
      setFilterDateEnd(toDateStr(now));
    } else if (tab === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setFilterDate(toDateStr(monthAgo));
      setFilterDateEnd(toDateStr(now));
    }
  };

  const filteredHistory = useMemo(() => {
    let result = history;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (e) =>
          String(e.productName || "").toLowerCase().includes(q) ||
          String(e.sku || "").toLowerCase().includes(q) ||
          String(e.batch || "").toLowerCase().includes(q) ||
          String(e.location || "").toLowerCase().includes(q) ||
          String(e.operator || "").toLowerCase().includes(q)
      );
    }

    if (filterDate) {
      result = result.filter((e) => {
        const d = parseTimestamp(e.timestamp);
        if (!d) return false;
        const iso = toDateStr(d);
        if (filterDateEnd) {
          return iso >= filterDate && iso <= filterDateEnd;
        }
        return iso === filterDate;
      });
    }

    if (selectedLocations.size > 0) {
      result = result.filter((e) => {
        for (const prefix of selectedLocations) {
          if (e.location === prefix || e.location.startsWith(prefix + "/")) return true;
        }
        return false;
      });
    }

    return [...result].sort((a, b) => {
      const ta = parseTimestamp(a.timestamp)?.getTime() || 0;
      const tb = parseTimestamp(b.timestamp)?.getTime() || 0;
      return tb - ta;
    });
  }, [history, searchQuery, filterDate, filterDateEnd, selectedLocations]);

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

  const uniqueLocations = useMemo(() => {
    const groupMap = new Map<string, number>();
    history.forEach((e) => {
      const parts = String(e.location || "").split("/");
      const groupKey = parts.length >= 2 ? parts.slice(0, 2).join("/") : parts[0];
      groupMap.set(groupKey, (groupMap.get(groupKey) || 0) + 1);
    });
    return Array.from(groupMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([loc, count]) => ({ location: loc, count }));
  }, [history]);

  const toggleLocation = (loc: string) => {
    setSelectedLocations((prev) => {
      const next = new Set(prev);
      if (next.has(loc)) next.delete(loc);
      else next.add(loc);
      return next;
    });
  };

  const filteredTotalQty = useMemo(
    () => filteredHistory.reduce((sum, e) => sum + e.qty, 0),
    [filteredHistory]
  );

  // While searching or filtering by date the user has narrowed things down on
  // purpose, so every group is forced open; otherwise the collapsed set rules.
  const isGroupExpanded = (loc: string) => {
    if (searchQuery.trim() || filterDate) return true;
    return !collapsedGroups.has(loc);
  };

  const toggleGroup = (loc: string) => {
    setCollapsedGroups((prev) => {
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

    const prev = [...history];
    const updated = history.filter((e) => e.rowId !== entry.rowId);
    setHistory(updated);
    toast.success("Entri berhasil dihapus");

    const ck = `history:ALL:all`;
    setCache(ck, updated);
    clearCache("products:");

    try {
      const result = await deleteEntryApi(entry.rowId);
      if (!result.success) {
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

    // Tunggu server sebelum mengklaim sukses — rollback bila gagal.
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
            formula: data.formula || e.formula,
            edited: "Yes",
            editTimestamp,
          }
        : e
    );
    setHistory(updated);
    setCache(`history:ALL:all`, updated);
    clearCache("products:");
    setInlineSaving(null);
    toast.success(data.location ? `Berhasil update & pindah ke ${data.location}` : "Berhasil mengupdate entri");
  };

  const handleAddSuccess = (newEntry: HistoryEntry) => {
    const updated = [newEntry, ...history];
    setHistory(updated);
    setCache(`history:ALL:all`, updated);
    if (user?.email) {
      setCache(`history:${user.email}:all`, updated);
    }
    clearCache("products:");
  };

  const saveInlineBatch = async (entry: HistoryEntry) => {
    const newBatch = editingBatchValue.trim();
    if (!newBatch) {
      toast.error("Batch tidak boleh kosong");
      return;
    }
    if (newBatch === entry.batch) {
      setEditingBatch(null);
      return;
    }
    setEditingBatch(null);
    setInlineSaving(entry.rowId);
    const editTimestamp = new Date().toISOString();

    try {
      const result = await updateEntryApi(entry.rowId, entry.sessionId, entry.qty, editTimestamp, {
        batch: newBatch,
      });
      if (!result.success) {
        setInlineSaving(null);
        toast.error(result.message || "Gagal update batch, data tidak diubah");
        return;
      }
    } catch {
      setInlineSaving(null);
      toast.error("Gagal update batch, data tidak diubah");
      return;
    }

    const updated = history.map((e) =>
      e.rowId === entry.rowId ? { ...e, batch: newBatch, edited: "Yes", editTimestamp } : e
    );
    setHistory(updated);
    setCache(`history:ALL:all`, updated);
    clearCache("products:");
    setInlineSaving(null);
    toast.success("Batch berhasil diupdate");
  };

  const saveInlineQty = async (entry: HistoryEntry) => {
    const newQty = editingQtyValue;
    const newFormula = editingQtyFormula;
    if (newQty === entry.qty && newFormula === (entry.formula || "")) {
      setEditingQty(null);
      return;
    }
    setEditingQty(null);
    setInlineSaving(entry.rowId);
    const editTimestamp = new Date().toISOString();

    try {
      const result = await updateEntryApi(entry.rowId, entry.sessionId, newQty, editTimestamp, {
        formula: newFormula,
      });
      if (!result.success) {
        setInlineSaving(null);
        toast.error(result.message || "Gagal update qty, data tidak diubah");
        return;
      }
    } catch {
      setInlineSaving(null);
      toast.error("Gagal update qty, data tidak diubah");
      return;
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
    toast.success("Qty berhasil diupdate");
  };

  return (
    <div className="mobile-container pb-32">
      {/* ── Header + toolbar filter ── */}
      <div className="sticky top-0 z-30 bg-paper/95 backdrop-blur-sm px-4 sm:px-6 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-text-primary leading-tight">Riwayat Stock Opname</h1>
            <p className="text-meta text-text-secondary tnum">
              {filteredHistory.length.toLocaleString("id-ID")} entri ·{" "}
              {filteredTotalQty.toLocaleString("id-ID")} item
            </p>
          </div>
          <button
            onClick={() => fetchHistory()}
            disabled={loading}
            className="tap px-4 bg-primary-pale rounded-label text-primary text-meta font-bold border border-primary/20 transition active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Muat ulang
          </button>
        </div>

        {/* ── Pencarian ── */}
        <div className="mt-2.5 relative">
          <label htmlFor="history-search" className="sr-only">
            Cari riwayat
          </label>
          <input
            id="history-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-touch pl-3 pr-10 bg-surface-warm border border-border rounded-input text-meta font-semibold text-text-primary"
            placeholder="Cari produk, SKU, batch, lokasi, operator…"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-surface-warm text-text-secondary flex items-center justify-center active:scale-95 transition"
              aria-label="Bersihkan pencarian"
            >
              <XIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Filter cepat ── */}
        <div className="flex gap-1.5 mt-2 overflow-x-auto hide-scrollbar" role="group" aria-label="Filter rentang waktu">
          {[
            { id: "all", label: "Semua" },
            { id: "today", label: "Hari Ini" },
            { id: "week", label: "7 Hari" },
            { id: "month", label: "30 Hari" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as any)}
              aria-pressed={activeTab === tab.id}
              className={`min-h-touch px-3.5 rounded-label text-meta font-bold whitespace-nowrap transition active:scale-95 ${
                activeTab === tab.id
                  ? "bg-primary text-ivory"
                  : "bg-surface-warm text-text-secondary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-3 space-y-4">
        {/* ── Filter area gudang ── */}
        {uniqueLocations.length > 1 && (
          <div>
            <p className="text-meta font-bold text-text-secondary px-1">Filter Area Gudang:</p>
            <div className="flex gap-1.5 mt-1.5 overflow-x-auto hide-scrollbar pb-1">
              {uniqueLocations.map((loc) => {
                const isSelected = selectedLocations.has(loc.location);
                return (
                  <button
                    key={loc.location}
                    onClick={() => toggleLocation(loc.location)}
                    aria-pressed={isSelected}
                    className={`min-h-touch px-3 rounded-label text-meta font-semibold border transition flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${
                      isSelected
                        ? "bg-primary text-ivory border-primary"
                        : "bg-paper text-text-primary border-border"
                    }`}
                  >
                    <span>{loc.location}</span>
                    <span
                      className={`tnum px-1.5 py-0.5 rounded-full text-meta font-bold ${
                        isSelected ? "bg-ivory/25 text-ivory" : "bg-primary-pale text-primary"
                      }`}
                    >
                      {loc.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Daftar riwayat berkelompok lokasi ── */}
        {loading && history.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : groupedHistory.length === 0 ? (
          <EmptyState
            icon={<ClipboardIcon className="w-6 h-6" />}
            title="Tidak ada riwayat opname"
            description={
              searchQuery || filterDate
                ? "Coba ubah kata kunci atau filter tanggal."
                : "Belum ada produk yang disimpan. Mulai hitung dari halaman Scan."
            }
          />
        ) : (
          groupedHistory.map(([loc, entries]) => {
            const locTotalQty = entries.reduce((s, e) => s + e.qty, 0);
            const expanded = isGroupExpanded(loc);

            return (
              <section
                key={loc}
                className="bg-paper rounded-card border border-border shadow-subtle overflow-hidden"
              >
                {/* Kepala grup gaya label rak */}
                <div className="w-full bg-surface-warm px-3.5 sm:px-4 py-2 border-b border-border">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleGroup(loc)}
                      className="flex-1 min-w-0 flex items-center gap-2 text-left active:opacity-80 transition py-1"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Tutup" : "Buka"} grup ${loc}`}
                    >
                      <span className="w-1.5 h-6 bg-ochre rounded-full shrink-0" aria-hidden="true" />
                      <span className="font-bold text-meta uppercase text-text-primary leading-snug tnum break-all min-w-0 flex-1">
                        {loc}
                      </span>
                      {expanded ? (
                        <ChevronDownIcon className="w-4 h-4 text-text-secondary shrink-0" />
                      ) : (
                        <ChevronRightIcon className="w-4 h-4 text-text-secondary shrink-0" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAddModal({ isOpen: true, location: loc });
                      }}
                      className="min-h-touch px-2.5 py-1.5 bg-primary text-ivory rounded-label text-meta font-bold flex items-center gap-1 shrink-0 active:scale-95 transition shadow-subtle hover:bg-primary/90"
                      aria-label={`Tambah produk di ${loc}`}
                      title={`Tambah produk di ${loc}`}
                    >
                      <PlusIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-meta tnum pl-4 mt-0.5">
                    <span className="text-text-secondary">{entries.length} entri</span>
                    <span className="font-bold text-primary bg-primary-pale px-2 py-0.5 rounded-full border border-primary/20 whitespace-nowrap">
                      {locTotalQty.toLocaleString("id-ID")} item
                    </span>
                  </div>
                </div>

                {/* Entri */}
                {expanded && (
                <div>
                <div className="divide-y divide-border-subtle">
                  {entries.map((entry) => (
                    <div key={entry.rowId} className="p-3.5 sm:p-4 hover:bg-primary-pale/10 transition">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-meta font-bold text-text-primary leading-snug break-words">
                            {entry.productName}
                          </h3>
                          <p className="text-meta text-text-secondary mt-0.5 tnum">
                            SKU: <span className="font-semibold text-text-primary">{entry.sku}</span>
                          </p>
                        </div>

                        {/* Tindakan per entri */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <IconButton
                            label={`Edit ${entry.productName}`}
                            onClick={() => handleEdit(entry)}
                            disabled={inlineSaving === entry.rowId}
                          >
                            <PencilIcon className="w-4 h-4" />
                          </IconButton>
                          <IconButton
                            label={`Hapus ${entry.productName}`}
                            variant="danger"
                            onClick={() => promptDelete(entry)}
                            disabled={inlineSaving === entry.rowId}
                          >
                            <TrashIcon className="w-4 h-4" />
                          </IconButton>
                        </div>
                      </div>

                      {/* Baris: batch, qty, operator & waktu */}
                      <div className="flex flex-wrap items-center justify-between gap-y-1.5 text-meta pt-1.5 border-t border-border-subtle mt-1.5">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          {editingBatch === entry.rowId ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editingBatchValue}
                                onChange={(e) => setEditingBatchValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveInlineBatch(entry);
                                  if (e.key === "Escape") setEditingBatch(null);
                                }}
                                aria-label="Batch baru"
                                className="w-28 min-h-touch px-2 bg-surface-warm border border-primary rounded-input text-meta font-bold"
                                autoFocus
                              />
                              {inlineBatchesForSku.length > 0 && (
                                <select
                                  value=""
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      setEditingBatchValue(e.target.value);
                                    }
                                  }}
                                  aria-label="Pilih batch yang ada"
                                  className="min-h-touch px-1 bg-surface-warm border border-border rounded-input text-meta"
                                >
                                  <option value="">Pilih…</option>
                                  {inlineBatchesForSku.map((b) => (
                                    <option key={b} value={b}>
                                      {b}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <button
                                onClick={() => saveInlineBatch(entry)}
                                className="min-h-touch px-3 bg-primary text-ivory text-meta font-bold rounded-label"
                              >
                                OK
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingBatch(entry.rowId);
                                setEditingBatchValue(entry.batch);
                              }}
                              disabled={inlineSaving === entry.rowId}
                              className="inline-flex items-center gap-1 min-h-touch px-2.5 bg-surface-warm hover:bg-primary-pale rounded-label font-semibold text-text-primary text-meta"
                              aria-label={`Edit batch ${entry.batch || "-"} untuk ${entry.productName}`}
                            >
                              Batch: {entry.batch || "-"}
                              <PencilIcon className="w-3.5 h-3.5 text-text-secondary" />
                            </button>
                          )}
                          <span className="inline-flex items-center gap-1 text-meta text-text-secondary">
                            <UserIcon className="w-3.5 h-3.5" aria-hidden="true" /> {entry.operator?.split("@")[0]}
                          </span>
                        </div>

                        {/* Qty dengan rumus */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {editingQty === entry.rowId ? (
                            <div className="flex flex-col items-end gap-1">
                              <QtyInput
                                wide
                                value={editingQtyValue}
                                onChange={(v) => setEditingQtyValue(v)}
                                onExprCommit={(expr) => setEditingQtyFormula(expr)}
                                ariaLabel={`Kuantitas baru untuk ${entry.productName}`}
                              />
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => saveInlineQty(entry)}
                                  className="min-h-touch px-4 bg-primary text-ivory text-meta font-bold rounded-label"
                                >
                                  Simpan
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingQty(null)}
                                  className="min-h-touch px-4 bg-surface-warm text-text-primary text-meta font-bold rounded-label"
                                >
                                  Batal
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingQty(entry.rowId);
                                setEditingQtyValue(entry.qty);
                                setEditingQtyFormula(entry.formula || "");
                              }}
                              disabled={inlineSaving === entry.rowId}
                              className="flex items-center gap-1 min-h-touch px-3 font-bold text-base2 text-primary bg-primary-pale rounded-label border border-primary/20 hover:bg-primary/20 transition active:scale-95 tnum"
                              aria-label={`Edit kuantitas ${entry.qty} untuk ${entry.productName}`}
                            >
                              <span>{entry.qty.toLocaleString("id-ID")} pcs</span>
                              <PencilIcon className="w-3.5 h-3.5 opacity-70" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Rumus eksplisit */}
                      {entry.formula && (
                        <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-warm border border-border-subtle rounded-label text-amber-text">
                          <CalculatorIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span className="text-meta font-bold tnum">Rumus: {entry.formula}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-meta text-text-secondary mt-1.5">
                        <span>{formatDisplayTime(entry.timestamp)}</span>
                        {inlineSaving === entry.rowId ? (
                          <span className="text-info font-bold" role="status">
                            Menyimpan…
                          </span>
                        ) : entry.edited === "Yes" ? (
                          <span className="text-amber-text font-bold">Telah diedit</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3 bg-surface-warm/40 border-t border-border-subtle flex justify-end">
                  <button
                    type="button"
                    onClick={() => setAddModal({ isOpen: true, location: loc })}
                    className="min-h-touch px-3 py-1.5 bg-primary-pale border border-primary/20 text-primary hover:bg-primary/20 rounded-label text-meta font-bold flex items-center gap-1.5 active:scale-95 transition"
                  >
                    <PlusIcon className="w-4 h-4" />
                    <span>Tambah produk di {loc}</span>
                  </button>
                </div>
                </div>
                )}
              </section>
            );
          })
        )}
      </div>

      {/* ── Modal edit ── */}
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

      {/* ── Modal tambah produk di lokasi ── */}
      {addModal.isOpen && (
        <AddHistoryEntryModal
          isOpen={addModal.isOpen}
          initialLocation={addModal.location}
          onClose={() => setAddModal({ isOpen: false, location: "" })}
          onSuccess={handleAddSuccess}
          allProducts={allProductsRef.current || undefined}
        />
      )}

      {/* ── Konfirmasi hapus ── */}
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
