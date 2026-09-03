"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import EditModal, { EditData } from "@/components/EditModal";
import LoadingSpinner from "@/components/LoadingSpinner";
import QtyInput from "@/components/QtyInput";
import ConfirmModal from "@/components/ConfirmModal";
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
import toast from "react-hot-toast";

export default function HistoryPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  // Inline edit state
  const [editingBatch, setEditingBatch] = useState<string | null>(null);
  const [editingBatchValue, setEditingBatchValue] = useState("");
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState(0);
  const [editingQtyFormula, setEditingQtyFormula] = useState("");

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

  const parseTimestamp = (raw: string): Date | null => {
    try {
      if (/\d{4}-\d{2}-\d{2}T/.test(raw)) return new Date(raw);
      const m = raw.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
      if (m) {
        const months: Record<string, number> = {
          Jan: 0, Feb: 1, Mar: 2, Apr: 3, Mei: 4, May: 4, Jun: 5, Jul: 6,
          Agu: 7, Aug: 7, Sep: 8, Okt: 9, Oct: 9, Nov: 10, Des: 11, Dec: 11,
        };
        return new Date(+m[3], months[m[2]] ?? 0, +m[1]);
      }
      return new Date(raw);
    } catch {
      return null;
    }
  };

  // Filter tab change helper
  const handleTabChange = (tab: "all" | "today" | "week" | "month") => {
    setActiveTab(tab);
    const now = new Date();
    const toDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    if (tab === "all") {
      setFilterDate("");
      setFilterDateEnd("");
    } else if (tab === "today") {
      const todayStr = toDateStr(now);
      setFilterDate(todayStr);
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
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
      const ta = new Date(a.timestamp).getTime() || 0;
      const tb = new Date(b.timestamp).getTime() || 0;
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
      const latestA = Math.max(...a[1].map((e) => new Date(e.timestamp).getTime() || 0));
      const latestB = Math.max(...b[1].map((e) => new Date(e.timestamp).getTime() || 0));
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
    toast.success("Entry berhasil dihapus");

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
    const prev = [...history];

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
    setIsModalOpen(false);
    toast.success(data.location ? `Berhasil update & pindah ke ${data.location}` : "Berhasil mengupdate entry");

    const ck = `history:ALL:all`;
    setCache(ck, updated);

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
        setHistory(prev);
        setCache(ck, prev);
        toast.error(result.message || "Gagal mengupdate");
      }
    } catch {
      setHistory(prev);
      setCache(ck, prev);
      toast.error("Gagal mengupdate");
    }
  };

  const saveInlineBatch = async (entry: HistoryEntry) => {
    const newBatch = editingBatchValue.trim();
    setEditingBatch(null);
    if (newBatch === entry.batch) return;

    const editTimestamp = new Date().toISOString();
    const prev = [...history];

    const updated = history.map((e) =>
      e.rowId === entry.rowId ? { ...e, batch: newBatch, edited: "Yes", editTimestamp } : e
    );
    setHistory(updated);
    toast.success("Batch berhasil diupdate");

    const ck = `history:ALL:all`;
    setCache(ck, updated);

    try {
      const result = await updateEntryApi(entry.rowId, entry.sessionId, entry.qty, editTimestamp, {
        batch: newBatch,
      });
      if (!result.success) {
        setHistory(prev);
        setCache(ck, prev);
        toast.error(result.message || "Gagal update batch");
      }
    } catch {
      setHistory(prev);
      setCache(ck, prev);
      toast.error("Gagal update batch");
    }
  };

  const saveInlineQty = async (entry: HistoryEntry) => {
    const newQty = editingQtyValue;
    const newFormula = editingQtyFormula;
    setEditingQty(null);
    if (newQty === entry.qty && newFormula === (entry.formula || "")) return;

    const editTimestamp = new Date().toISOString();
    const prev = [...history];

    const updated = history.map((e) =>
      e.rowId === entry.rowId
        ? { ...e, qty: newQty, formula: newFormula, edited: "Yes", editTimestamp }
        : e
    );
    setHistory(updated);
    toast.success("Qty berhasil diupdate");

    const ck = `history:ALL:all`;
    setCache(ck, updated);

    try {
      const result = await updateEntryApi(entry.rowId, entry.sessionId, newQty, editTimestamp, {
        formula: newFormula,
      });
      if (!result.success) {
        setHistory(prev);
        setCache(ck, prev);
        toast.error(result.message || "Gagal update qty");
      }
    } catch {
      setHistory(prev);
      setCache(ck, prev);
      toast.error("Gagal update qty");
    }
  };

  const formatDisplayTime = (ts: string) => {
    try {
      const d = parseTimestamp(ts);
      if (!d) return ts;
      return d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="mobile-container pb-28">
      {/* ── Sticky Top Header ── */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 pt-4 pb-3 border-b border-border shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-bold text-text-primary">Riwayat Stock Opname</h1>
            <p className="text-[11px] text-text-secondary">
              {filteredHistory.length} produk tercatat
            </p>
          </div>
          <button
            onClick={() => fetchHistory()}
            className="px-3 py-1.5 bg-primary-pale rounded-full text-primary text-[11px] font-bold border border-primary/20 hover:bg-primary/20 transition active:scale-95 flex items-center gap-1"
          >
            <span>🔄</span> Refresh
          </button>
        </div>

        {/* ── Search Input ── */}
        <div className="mt-3 relative">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-surface-warm border border-border rounded-xl text-xs font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white"
            placeholder="Cari produk, SKU, batch, lokasi, operator..."
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-[10px]"
            >
              ✕
            </button>
          )}
        </div>

        {/* ── Quick Filter Tabs (Pills) ── */}
        <div className="flex gap-1.5 mt-2.5 overflow-x-auto hide-scrollbar">
          {[
            { id: "all", label: "Semua" },
            { id: "today", label: "Hari Ini" },
            { id: "week", label: "7 Hari" },
            { id: "month", label: "30 Hari" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as any)}
              className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition active:scale-95 ${
                activeTab === tab.id
                  ? "bg-primary text-white shadow-xs"
                  : "bg-surface-warm text-text-secondary hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-3 space-y-4">
        {/* ── Area / Location Filters Chips ── */}
        {uniqueLocations.length > 1 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary px-1">
              Filter Area Gudang:
            </span>
            <div className="flex gap-1.5 mt-1.5 overflow-x-auto hide-scrollbar pb-1">
              {uniqueLocations.map((loc) => {
                const isSelected = selectedLocations.has(loc.location);
                return (
                  <button
                    key={loc.location}
                    onClick={() => toggleLocation(loc.location)}
                    className={`px-3 py-1 rounded-xl text-[11px] font-semibold border transition flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${
                      isSelected
                        ? "bg-primary text-white border-primary shadow-xs"
                        : "bg-white text-text-primary border-border hover:bg-surface-warm"
                    }`}
                  >
                    <span>{loc.location}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                        isSelected ? "bg-white/25 text-white" : "bg-primary-pale text-primary"
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

        {/* ── History Grouped List ── */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : groupedHistory.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-border shadow-xs mt-4">
            <div className="w-12 h-12 rounded-2xl bg-primary-pale text-primary mx-auto flex items-center justify-center text-xl mb-2">
              📋
            </div>
            <p className="text-xs font-bold text-text-primary">Tidak ada riwayat opname</p>
            <p className="text-[11px] text-text-secondary mt-1">
              {searchQuery || filterDate ? "Coba ubah kata kunci atau filter tanggal" : "Belum ada produk yang disimpan"}
            </p>
          </div>
        ) : (
          groupedHistory.map(([loc, entries]) => {
            const locTotalQty = entries.reduce((s, e) => s + e.qty, 0);

            return (
              <div key={loc} className="bg-white rounded-2xl border border-border shadow-card overflow-hidden">
                {/* Location Group Header */}
                <div className="bg-surface-warm px-4 py-2.5 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    <span className="font-bold text-xs text-text-primary">{loc}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-text-secondary">{entries.length} produk</span>
                    <span className="font-black text-primary bg-primary-pale px-2 py-0.5 rounded-full border border-primary/20">
                      {locTotalQty} item
                    </span>
                  </div>
                </div>

                {/* Entry Items */}
                <div className="divide-y divide-border-subtle">
                  {entries.map((entry) => (
                    <div key={entry.rowId} className="p-3 hover:bg-primary-pale/10 transition">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-text-primary leading-snug break-words">
                            {entry.productName}
                          </h4>
                          <p className="text-[10px] text-text-secondary mt-0.5">
                            SKU: <span className="font-semibold text-text-primary">{entry.sku}</span>
                          </p>
                        </div>

                        {/* Actions (Edit & Delete Buttons) */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEdit(entry)}
                            className="w-8 h-8 rounded-xl bg-surface-warm hover:bg-primary-pale text-text-primary flex items-center justify-center text-xs transition active:scale-95"
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={() => promptDelete(entry)}
                            className="w-8 h-8 rounded-xl bg-accent-red/10 hover:bg-accent-red hover:text-white text-accent-red flex items-center justify-center text-xs transition active:scale-95"
                            title="Hapus"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {/* Row 2: Batch, Qty, Operator & Time */}
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border-subtle mt-1.5">
                        <div className="flex items-center gap-2">
                          {editingBatch === entry.rowId ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editingBatchValue}
                                onChange={(e) => setEditingBatchValue(e.target.value)}
                                className="w-24 px-1.5 py-0.5 bg-white border border-primary rounded text-xs font-bold"
                                autoFocus
                              />
                              <button
                                onClick={() => saveInlineBatch(entry)}
                                className="px-2 py-0.5 bg-primary text-white text-[10px] font-bold rounded"
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
                              className="px-2 py-0.5 bg-surface-warm hover:bg-primary-pale rounded-md font-semibold text-text-primary text-[10px]"
                            >
                              Batch: {entry.batch || "-"} ✏️
                            </button>
                          )}
                          <span className="text-[10px] text-text-secondary">
                            👤 {entry.operator?.split("@")[0]}
                          </span>
                        </div>

                        {/* Qty with formula */}
                        <div className="flex items-center gap-1.5">
                          {editingQty === entry.rowId ? (
                            <div className="flex flex-col items-end gap-1">
                              <QtyInput
                                wide
                                value={editingQtyValue}
                                onChange={(v) => setEditingQtyValue(v)}
                                onExprCommit={(expr) => setEditingQtyFormula(expr)}
                              />
                              <div className="flex gap-1 mt-1">
                                <button
                                  type="button"
                                  onClick={() => saveInlineQty(entry)}
                                  className="px-3 py-1 bg-primary text-white text-[10px] font-bold rounded-lg shadow-xs"
                                >
                                  Simpan
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingQty(null)}
                                  className="px-2.5 py-1 bg-surface-warm text-text-primary text-[10px] font-bold rounded-lg"
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
                              className="flex items-center gap-1 font-black text-xs text-primary bg-primary-pale px-2.5 py-1 rounded-lg border border-primary/20 hover:bg-primary/20 transition active:scale-95"
                              title="Klik untuk edit Qty"
                            >
                              <span>{entry.qty} pcs</span>
                              <span className="text-[10px] opacity-70">✏️</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Explicit Formula Breakdown (Perkalian & Penjumlahan) */}
                      {entry.formula && (
                        <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1 bg-surface-warm border border-border-subtle rounded-lg text-primary">
                          <span className="text-xs">🧮</span>
                          <span className="text-[11px] font-bold font-mono tracking-tight">
                            Rumus: {entry.formula}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[9px] text-text-secondary mt-1.5">
                        <span>{formatDisplayTime(entry.timestamp)}</span>
                        {entry.edited === "Yes" && (
                          <span className="text-accent-yellow font-bold">Telah diedit</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Edit Modal ── */}
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

      {/* ── Delete Confirmation Modal ── */}
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
