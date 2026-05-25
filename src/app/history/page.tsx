"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import EditModal, { EditData } from "@/components/EditModal";
import LoadingSpinner from "@/components/LoadingSpinner";
import QtyInput from "@/components/QtyInput";
import BarcodeScanner from "@/components/BarcodeScanner";
import {
  getHistoryApi,
  updateEntryApi,
  deleteEntryApi,
  warmupCacheApi,
  saveStockOpnameApi,
  lookupBarcodeApi,
  searchProductsApi,
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
  const [showFormula, setShowFormula] = useState<string | null>(null);

  // ── Search & Filter state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDate, setFilterDate] = useState(""); // "YYYY-MM-DD"
  const [filterDateEnd, setFilterDateEnd] = useState(""); // for range filtering
  const [activeTab, setActiveTab] = useState<
    "all" | "today" | "week" | "month"
  >("all");
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(
    new Set(),
  );
  const searchRef = useRef<HTMLInputElement>(null);

  // Inline edit state
  const [editingBatch, setEditingBatch] = useState<string | null>(null);
  const [editingBatchValue, setEditingBatchValue] = useState("");
  const [editingQty, setEditingQty] = useState<string | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState(0);
  const [editingQtyFormula, setEditingQtyFormula] = useState("");

  // ── Add Product state ──
  const [showAddForm, setShowAddForm] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [addSearchResults, setAddSearchResults] = useState<Product[]>([]);
  const [showAddSuggestions, setShowAddSuggestions] = useState(false);
  const [addSearchTimer, setAddSearchTimer] = useState<NodeJS.Timeout | null>(
    null,
  );
  const [addFormula, setAddFormula] = useState("");
  const allProductsRef = useRef<Product[] | null>(null);
  const allLocationsRef = useRef<Array<{
    locationCode: string;
    productCount: number;
  }> | null>(null);
  const [locationResults, setLocationResults] = useState<
    Array<{ locationCode: string; productCount: number }>
  >([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [showLocationScanner, setShowLocationScanner] = useState(false);
  const [addForm, setAddForm] = useState({
    location: "",
    productName: "",
    sku: "",
    batch: "",
    barcode: "",
    qty: 0,
  });

  // ── Batch dropdown state (add form) ──
  const [showAddBatchDropdown, setShowAddBatchDropdown] = useState(false);
  const addBatchDropdownRef = useRef<HTMLDivElement>(null);

  // ── Batch dropdown state (inline edit) ──
  const [showInlineBatchDropdown, setShowInlineBatchDropdown] = useState(false);
  const inlineBatchDropdownRef = useRef<HTMLDivElement>(null);

  // Get unique batches for add form SKU
  const addBatchesForSku = useMemo(() => {
    const skuVal = addForm.sku.trim().toLowerCase();
    if (!skuVal) return [];
    const all = allProductsRef.current || [];
    const batchSet = new Set<string>();
    all.forEach((p) => {
      if (p.sku.trim().toLowerCase() === skuVal && p.batch) {
        batchSet.add(p.batch);
      }
    });
    return Array.from(batchSet).sort();
  }, [addForm.sku]);

  // Filtered batches for add form
  const addFilteredBatches = useMemo(() => {
    const q = addForm.batch.trim().toLowerCase();
    if (!q) return addBatchesForSku;
    // If current value exactly matches an existing batch, show ALL batches so user can switch
    if (addBatchesForSku.some((b) => b.toLowerCase() === q))
      return addBatchesForSku;
    return addBatchesForSku.filter((b) => b.toLowerCase().includes(q));
  }, [addForm.batch, addBatchesForSku]);

  // Get unique batches for inline batch edit SKU
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

  // Filtered batches for inline edit
  const inlineFilteredBatches = useMemo(() => {
    const q = editingBatchValue.trim().toLowerCase();
    if (!q) return inlineBatchesForSku;
    // If current value exactly matches an existing batch, show ALL batches so user can switch
    if (inlineBatchesForSku.some((b) => b.toLowerCase() === q))
      return inlineBatchesForSku;
    return inlineBatchesForSku.filter((b) => b.toLowerCase().includes(q));
  }, [editingBatchValue, inlineBatchesForSku]);

  // Close add form batch dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        addBatchDropdownRef.current &&
        !addBatchDropdownRef.current.contains(e.target as Node)
      ) {
        setShowAddBatchDropdown(false);
      }
    };
    if (showAddBatchDropdown)
      document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAddBatchDropdown]);

  // Close inline batch dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        inlineBatchDropdownRef.current &&
        !inlineBatchDropdownRef.current.contains(e.target as Node)
      ) {
        setShowInlineBatchDropdown(false);
      }
    };
    if (showInlineBatchDropdown)
      document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showInlineBatchDropdown]);

  useEffect(() => {
    fetchHistory();
    warmupCacheApi().catch(() => {});
    // Load all products + locations in parallel for instant search
    const cachedProducts = getCache<Product[]>("allProducts");
    if (cachedProducts) allProductsRef.current = cachedProducts.data;
    const cachedLocations =
      getCache<Array<{ locationCode: string; productCount: number }>>(
        "allLocations",
      );
    if (cachedLocations) allLocationsRef.current = cachedLocations.data;
    // Background refresh
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

  // Normalize entries from API: Google Sheets may return numbers instead of strings
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

    // Show cached data instantly (includes optimistic entries from save)
    const cached = getCache<HistoryEntry[]>(ck);
    if (cached) {
      setHistory(cached.data.map(normalizeEntry));
      setLoading(false);
    }

    // Check if we just saved — delay API refresh to avoid overwriting optimistic data
    const lastSave = Number(localStorage.getItem("lastSaveTs") || "0");
    const sinceSave = Date.now() - lastSave;
    if (sinceSave < 15_000) {
      // Wait until server has had time to process the save
      await new Promise((r) => setTimeout(r, Math.max(15_000 - sinceSave, 0)));
    }

    // Background refresh
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

  // ── Parse a timestamp string to a Date object ──
  const parseTimestamp = (raw: string): Date | null => {
    try {
      // ISO format: "2026-02-16T18:28:00Z"
      if (/\d{4}-\d{2}-\d{2}T/.test(raw)) return new Date(raw);
      // Format: "16 Feb 2026 18:28"
      const m = raw.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
      if (m) {
        const months: Record<string, number> = {
          Jan: 0,
          Feb: 1,
          Mar: 2,
          Apr: 3,
          Mei: 4,
          May: 4,
          Jun: 5,
          Jul: 6,
          Agu: 7,
          Aug: 7,
          Sep: 8,
          Okt: 9,
          Oct: 9,
          Nov: 10,
          Des: 11,
          Dec: 11,
        };
        return new Date(+m[3], months[m[2]] ?? 0, +m[1]);
      }
      return new Date(raw);
    } catch {
      return null;
    }
  };

  // ── Client-side filtered data (instant) ──
  const filteredHistory = useMemo(() => {
    let result = history;

    // Search by product name, SKU, batch, location, operator
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (e) =>
          String(e.productName || "")
            .toLowerCase()
            .includes(q) ||
          String(e.sku || "")
            .toLowerCase()
            .includes(q) ||
          String(e.batch || "")
            .toLowerCase()
            .includes(q) ||
          String(e.location || "")
            .toLowerCase()
            .includes(q) ||
          String(e.operator || "")
            .toLowerCase()
            .includes(q),
      );
    }

    // Filter by date or date range
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

    // Filter by selected location groups (prefix match)
    if (selectedLocations.size > 0) {
      result = result.filter((e) => {
        for (const prefix of selectedLocations) {
          if (e.location === prefix || e.location.startsWith(prefix + "/"))
            return true;
        }
        return false;
      });
    }

    // Sort newest first
    result = [...result].sort((a, b) => {
      const ta = new Date(a.timestamp).getTime() || 0;
      const tb = new Date(b.timestamp).getTime() || 0;
      return tb - ta;
    });

    return result;
  }, [history, searchQuery, filterDate, filterDateEnd, selectedLocations]);

  // Extract location groups (parent prefixes) from history
  // e.g. CEN/PARAS, CEN/PARAS/RCK → group "CEN/PARAS" with count 2
  const uniqueLocations = useMemo(() => {
    const groupMap = new Map<string, number>();
    history.forEach((e) => {
      // Take first 2 segments as group key: "CEN/PARAS" from "CEN/PARAS/RCK"
      const parts = String(e.location || "").split("/");
      const groupKey =
        parts.length >= 2 ? parts.slice(0, 2).join("/") : parts[0];
      groupMap.set(groupKey, (groupMap.get(groupKey) || 0) + 1);
    });
    return Array.from(groupMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([loc, count]) => ({ location: loc, count }));
  }, [history]);

  // Group filtered history by location — sort groups by most recent entry
  const groupedHistory = useMemo(() => {
    const groups = new Map<string, HistoryEntry[]>();
    filteredHistory.forEach((e) => {
      if (!groups.has(e.location)) groups.set(e.location, []);
      groups.get(e.location)!.push(e);
    });
    return Array.from(groups.entries()).sort((a, b) => {
      const latestA = Math.max(
        ...a[1].map((e) => new Date(e.timestamp).getTime() || 0),
      );
      const latestB = Math.max(
        ...b[1].map((e) => new Date(e.timestamp).getTime() || 0),
      );
      return latestB - latestA;
    });
  }, [filteredHistory]);

  const toggleLocation = (loc: string) => {
    setSelectedLocations((prev) => {
      const next = new Set(prev);
      if (next.has(loc)) next.delete(loc);
      else next.add(loc);
      return next;
    });
  };

  const hasActiveFilters =
    searchQuery || filterDate || selectedLocations.size > 0;

  const clearAllFilters = () => {
    setSearchQuery("");
    setFilterDate("");
    setFilterDateEnd("");
    setActiveTab("all");
    setSelectedLocations(new Set());
  };

  const handleEdit = (entry: HistoryEntry) => {
    setSelectedEntry(entry);
    setIsModalOpen(true);
  };

  const handleDelete = async (entry: HistoryEntry) => {
    const confirmDelete = window.confirm(
      `Hapus entry "${entry.productName}" (Qty: ${entry.qty})?`,
    );
    if (!confirmDelete) return;

    // AppSheet-style: optimistic delete — hapus dari UI langsung
    const prev = [...history];
    const updated = history.filter((e) => e.rowId !== entry.rowId);
    setHistory(updated);
    toast.success("Entry berhasil dihapus");

    const ck = `history:ALL:all`;
    setCache(ck, updated);
    clearCache("products:"); // invalidate product cache

    // Background sync ke server
    try {
      const result = await deleteEntryApi(entry.rowId);
      if (!result.success) {
        setHistory(prev);
        setCache(ck, prev);
        toast.error(result.message || "Gagal menghapus, data dikembalikan");
      }
    } catch (error) {
      console.error("Delete error:", error);
      setHistory(prev);
      setCache(ck, prev);
      toast.error("Gagal menghapus, data dikembalikan");
    }
  };

  const handleSaveEdit = async (data: EditData) => {
    if (!selectedEntry) return;

    const editTimestamp = new Date().toISOString();
    const prev = [...history];

    // AppSheet-style: optimistic edit — update UI langsung
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
        : e,
    );
    setHistory(updated);
    setIsModalOpen(false);
    toast.success(
      data.location
        ? `Berhasil update & pindah ke ${data.location}`
        : "Berhasil mengupdate entry",
    );

    const ck = `history:ALL:all`;
    setCache(ck, updated);

    // Background sync ke server
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
        },
      );

      if (!result.success) {
        setHistory(prev);
        setCache(ck, prev);
        toast.error(result.message || "Gagal mengupdate, data dikembalikan");
      }
    } catch (error) {
      console.error("Update error:", error);
      setHistory(prev);
      setCache(ck, prev);
      toast.error("Gagal mengupdate, data dikembalikan");
    }
  };

  // ── Inline edit handlers ──

  const startInlineBatchEdit = (entry: HistoryEntry) => {
    setEditingBatch(entry.rowId);
    setEditingBatchValue(entry.batch);
    setShowInlineBatchDropdown(true);
  };

  const saveInlineBatch = async (entry: HistoryEntry) => {
    const newBatch = editingBatchValue.trim();
    setEditingBatch(null);
    setShowInlineBatchDropdown(false);
    if (newBatch === entry.batch) return; // no change

    const editTimestamp = new Date().toISOString();
    const prev = [...history];

    // Optimistic update
    const updated = history.map((e) =>
      e.rowId === entry.rowId
        ? { ...e, batch: newBatch, edited: "Yes", editTimestamp }
        : e,
    );
    setHistory(updated);
    toast.success("Batch berhasil diupdate");

    const ck = `history:ALL:all`;
    setCache(ck, updated);

    try {
      const result = await updateEntryApi(
        entry.rowId,
        entry.sessionId,
        entry.qty,
        editTimestamp,
        { batch: newBatch },
      );
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

  const startInlineQtyEdit = (entry: HistoryEntry) => {
    setEditingQty(entry.rowId);
    setEditingQtyValue(entry.qty);
    setEditingQtyFormula(entry.formula || "");
  };

  const saveInlineQty = async (entry: HistoryEntry) => {
    const newQty = editingQtyValue;
    const newFormula = editingQtyFormula;
    setEditingQty(null);
    if (newQty === entry.qty && newFormula === (entry.formula || "")) return; // no change

    const editTimestamp = new Date().toISOString();
    const prev = [...history];

    // Optimistic update
    const updated = history.map((e) =>
      e.rowId === entry.rowId
        ? {
            ...e,
            qty: newQty,
            formula: newFormula,
            edited: "Yes",
            editTimestamp,
          }
        : e,
    );
    setHistory(updated);
    toast.success("Qty berhasil diupdate");

    const ck = `history:ALL:all`;
    setCache(ck, updated);

    try {
      const result = await updateEntryApi(
        entry.rowId,
        entry.sessionId,
        newQty,
        editTimestamp,
        { formula: newFormula },
      );
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

  // ── Add Product handlers ──
  const normalizeLocationCode = (value: string) =>
    value.toUpperCase().replace(/\s+/g, "").trim();

  const handleLocationSearch = (value: string) => {
    const normalized = normalizeLocationCode(value);
    setAddForm((prev) => ({ ...prev, location: normalized }));

    if (normalized.length < 1) {
      setLocationResults([]);
      setShowLocationSuggestions(false);
      return;
    }

    // Build combined location list: API locations + unique history locations
    let candidates: Array<{ locationCode: string; productCount: number }> = [];

    if (allLocationsRef.current) {
      candidates = [...allLocationsRef.current];
    }

    // Add unique locations from history that aren't already in candidates
    const existingCodes = new Set(
      candidates.map((c) => c.locationCode.toLowerCase()),
    );
    const historyLocations = new Set(history.map((e) => e.location));
    historyLocations.forEach((loc) => {
      if (!existingCodes.has(loc.toLowerCase())) {
        candidates.push({ locationCode: loc, productCount: 0 });
      }
    });

    const q = normalized.toLowerCase();
    const filtered = candidates
      .filter((loc) => loc.locationCode.toLowerCase().includes(q))
      .slice(0, 15);
    setLocationResults(filtered);
    setShowLocationSuggestions(filtered.length > 0);
  };

  const handleSelectLocation = (loc: { locationCode: string }) => {
    setAddForm((prev) => ({ ...prev, location: loc.locationCode }));
    setLocationResults([]);
    setShowLocationSuggestions(false);
  };

  const handleLocationBarcodeScan = (code: string) => {
    setShowLocationScanner(false);
    const normalized = normalizeLocationCode(code);
    setAddForm((prev) => ({ ...prev, location: normalized }));
    toast.success(`Lokasi: ${normalized}`);
  };

  const handleAddProductSearch = (value: string) => {
    setAddForm((prev) => ({ ...prev, productName: value }));
    if (addSearchTimer) clearTimeout(addSearchTimer);
    if (value.trim().length < 2) {
      setAddSearchResults([]);
      setShowAddSuggestions(false);
      return;
    }
    if (allProductsRef.current) {
      const q = value.trim().toLowerCase();
      const filtered = allProductsRef.current
        .filter((p) => p.productName.toLowerCase().includes(q))
        .slice(0, 10);
      setAddSearchResults(filtered);
      setShowAddSuggestions(filtered.length > 0);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await searchProductsApi(value.trim());
        if (result.success && result.products) {
          setAddSearchResults(result.products);
          setShowAddSuggestions(result.products.length > 0);
        }
      } catch (error) {
        console.error("Search error:", error);
      }
    }, 80);
    setAddSearchTimer(timer);
  };

  const handleAddSelectSuggestion = (product: Product) => {
    setAddForm((prev) => ({
      ...prev,
      productName: product.productName,
      sku: product.sku,
      batch: product.batch,
      barcode: product.barcode || prev.barcode,
    }));
    setShowAddSuggestions(false);
    setAddSearchResults([]);
    toast.success(`Produk dipilih: ${product.productName}`);
  };

  const handleAddBarcodeScan = async (barcode: string) => {
    setShowBarcodeScanner(false);
    setScanningBarcode(true);
    try {
      const result = await lookupBarcodeApi(barcode);
      if (result.success && result.product) {
        setAddForm((prev) => ({
          ...prev,
          productName: result.product!.productName,
          sku: result.product!.sku,
          batch: result.product!.batch || "",
          barcode: barcode,
        }));
        toast.success(`Produk ditemukan: ${result.product.productName}`);
      } else {
        setAddForm((prev) => ({ ...prev, barcode }));
        toast.error(result.message || "Produk tidak ditemukan, isi manual");
      }
    } catch (error) {
      console.error("Barcode lookup error:", error);
      setAddForm((prev) => ({ ...prev, barcode }));
      toast.error("Gagal lookup barcode, isi data manual");
    } finally {
      setScanningBarcode(false);
    }
  };

  const handleAddProduct = async () => {
    if (!addForm.location.trim()) {
      toast.error("Lokasi harus diisi");
      return;
    }
    if (!addForm.productName || !addForm.sku || !addForm.batch) {
      toast.error("Nama Produk, SKU, dan Batch harus diisi");
      return;
    }
    if (addForm.qty <= 0) {
      toast.error("Quantity harus lebih dari 0");
      return;
    }

    const sessionId = `${user?.email}_${Date.now()}`;
    const timestamp = new Date().toISOString();
    const items = [
      {
        productName: addForm.productName,
        sku: addForm.sku,
        batch: addForm.batch,
        barcode: addForm.barcode || "",
        qty: addForm.qty,
        formula: addFormula || "",
        isNew: true,
      },
    ];

    // OPTIMISTIC: Add to history UI immediately — don't wait for server
    const newEntry: HistoryEntry = {
      sessionId,
      rowId: `temp_${Date.now()}`,
      timestamp,
      operator: user?.email || "",
      location: addForm.location.trim(),
      productName: addForm.productName,
      sku: addForm.sku,
      batch: addForm.batch,
      qty: addForm.qty,
      edited: "",
      editTimestamp: "",
      formula: addFormula || "",
    };
    setHistory((prev) => [newEntry, ...prev]);
    const ck = `history:ALL:all`;
    setCache(ck, [newEntry, ...history]);

    // Reset form immediately
    setAddForm({
      location: addForm.location,
      productName: "",
      sku: "",
      batch: "",
      barcode: "",
      qty: 0,
    });
    setAddFormula("");
    setShowAddForm(false);
    toast.success("Produk berhasil ditambahkan!");

    // Background sync to server
    saveStockOpnameApi(
      sessionId,
      user?.email || "",
      addForm.location.trim(),
      timestamp,
      items,
    )
      .then((result) => {
        if (result.success) {
          // Refresh history to get real rowId
          clearCache("history:");
          fetchHistory();
        } else {
          toast.error(result.message || "Gagal sinkron ke server");
        }
      })
      .catch(() => {
        toast.error("Gagal sinkron ke server");
      });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pb-20 bg-[var(--primary-bg)]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 bg-[var(--primary-bg)]">
      {/* ── Header ── */}
      <div className="bg-white px-5 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-xl font-bold text-text-primary">Riwayat</h1>
          <span className="px-2.5 py-0.5 bg-primary text-white text-xs font-bold rounded-full">
            {history.length}
          </span>
        </div>

        {/* ── Filter Tabs ── */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar">
          {(["all", "today", "week", "month"] as const).map((tab) => {
            const labels = {
              all: "Semua",
              today: "Hari Ini",
              week: "Minggu Ini",
              month: "Bulan Ini",
            };
            return (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  if (tab === "all") {
                    setFilterDate("");
                    setFilterDateEnd("");
                  } else if (tab === "today") {
                    const today = new Date().toISOString().slice(0, 10);
                    setFilterDate(today);
                    setFilterDateEnd("");
                  } else if (tab === "week") {
                    const now = new Date();
                    const weekAgo = new Date(now);
                    weekAgo.setDate(now.getDate() - 7);
                    setFilterDate(weekAgo.toISOString().slice(0, 10));
                    setFilterDateEnd(now.toISOString().slice(0, 10));
                  } else if (tab === "month") {
                    const now = new Date();
                    const monthAgo = new Date(now);
                    monthAgo.setDate(now.getDate() - 30);
                    setFilterDate(monthAgo.toISOString().slice(0, 10));
                    setFilterDateEnd(now.toISOString().slice(0, 10));
                  }
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
                  activeTab === tab
                    ? "bg-text-primary text-white"
                    : "bg-gray-100 text-text-secondary hover:bg-gray-200"
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-3">
        {/* ── Search Box ── */}
        <div className="mb-3">
          <div className="relative">
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
              ref={searchRef}
              type="text"
              placeholder="Cari produk, SKU, batch, lokasi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm shadow-card"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  searchRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* ── Location Chip Filters ── */}
        {uniqueLocations.length > 0 && (
          <div className="mb-3 flex gap-1.5 overflow-x-auto hide-scrollbar pb-0.5">
            <button
              type="button"
              onClick={() => setSelectedLocations(new Set())}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition border shadow-card ${
                selectedLocations.size === 0
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-text-secondary border-border hover:border-primary"
              }`}
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Semua
              <span
                className={`text-[10px] font-bold px-1 py-0.5 rounded-full ${
                  selectedLocations.size === 0 ? "bg-white/20" : "bg-gray-100"
                }`}
              >
                {history.length}
              </span>
            </button>
            {uniqueLocations.map(({ location: loc, count }) => {
              const isActive = selectedLocations.has(loc);
              return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => toggleLocation(loc)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition border shadow-card ${
                    isActive
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-text-secondary border-border hover:border-primary"
                  }`}
                >
                  {loc}
                  <span
                    className={`text-[10px] font-bold px-1 py-0.5 rounded-full ${
                      isActive ? "bg-white/20" : "bg-gray-100"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Date Filter + Counter ── */}
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          {/* Date filter */}
          <div className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-1.5 shadow-card border border-border">
            <svg
              className="w-4 h-4 text-text-secondary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => {
                setFilterDate(e.target.value);
                setFilterDateEnd("");
                setActiveTab("all");
              }}
              className="text-xs focus:outline-none bg-transparent"
            />
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-accent-red font-medium transition px-2 py-1"
            >
              Reset
            </button>
          )}

          <span className="ml-auto text-[11px] text-text-secondary bg-white px-2 py-1 rounded-lg shadow-card">
            {filteredHistory.length} / {history.length}
          </span>
        </div>

        {/* ── Add Product Button ── */}
        <div className="mb-3">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="w-full bg-primary text-white py-3 rounded-2xl font-semibold hover:bg-primary-light transition text-sm shadow-card active:scale-[0.98]"
          >
            {showAddForm ? "✕ Tutup Form" : "+ Tambah Produk Baru"}
          </button>
        </div>

        {/* ── Add Product Form ── */}
        {showAddForm && (
          <div className="bg-white border border-border rounded-2xl p-4 mb-4 shadow-card">
            <h3 className="text-sm font-semibold mb-3 text-text-primary">
              Tambah Produk Baru
            </h3>

            {scanningBarcode && (
              <div className="mb-3 flex items-center justify-center gap-2 text-xs text-text-secondary">
                <LoadingSpinner /> Mencari produk...
              </div>
            )}

            <div className="space-y-2.5">
              {/* Lokasi */}
              <div className="relative">
                <label className="block text-xs font-medium text-text-primary mb-1">
                  Lokasi
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={addForm.location}
                    onChange={(e) => handleLocationSearch(e.target.value)}
                    onFocus={() => {
                      if (locationResults.length > 0)
                        setShowLocationSuggestions(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowLocationSuggestions(false), 200);
                    }}
                    className="w-full pl-3 pr-12 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    placeholder="Ketik atau scan lokasi..."
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLocationScanner(true)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20"
                    title="Scan barcode lokasi"
                  >
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
                      <path d="M7 12h10" />
                    </svg>
                  </button>
                </div>
                {showLocationSuggestions && locationResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {locationResults.map((loc, idx) => (
                      <button
                        key={`loc-${idx}`}
                        type="button"
                        className="w-full text-left px-3 py-2.5 hover:bg-primary-pale transition border-b border-border last:border-b-0"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectLocation(loc)}
                      >
                        <p className="font-medium text-text-primary text-xs">
                          {loc.locationCode}
                        </p>
                        {loc.productCount > 0 && (
                          <p className="text-[10px] text-text-secondary">
                            {loc.productCount} produk
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Barcode */}
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">
                  Barcode
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={addForm.barcode}
                    onChange={(e) =>
                      setAddForm({ ...addForm, barcode: e.target.value.trim() })
                    }
                    onKeyDown={(e) => {
                      const bv = String(addForm.barcode || "").trim();
                      if (e.key === "Enter" && bv) {
                        e.preventDefault();
                        handleAddBarcodeScan(bv);
                      }
                    }}
                    className="w-full pl-3 pr-20 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-gray-50"
                    placeholder="Scan / ketik barcode"
                    autoComplete="off"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const bv = String(addForm.barcode || "").trim();
                        if (bv) handleAddBarcodeScan(bv);
                      }}
                      disabled={
                        !String(addForm.barcode || "").trim() || scanningBarcode
                      }
                      className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 disabled:opacity-50"
                      title="Cari barcode"
                    >
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBarcodeScanner(true)}
                      disabled={scanningBarcode}
                      className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 disabled:opacity-50"
                      title="Scan barcode"
                    >
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
                        <path d="M7 12h10" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Nama Produk + Search */}
              <div className="relative">
                <label className="block text-xs font-medium text-text-primary mb-1">
                  Nama Produk
                </label>
                <input
                  type="text"
                  value={addForm.productName}
                  onChange={(e) => handleAddProductSearch(e.target.value)}
                  onFocus={() => {
                    if (addSearchResults.length > 0)
                      setShowAddSuggestions(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowAddSuggestions(false), 200);
                  }}
                  className="w-full px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  placeholder="Ketik min. 2 huruf untuk cari produk..."
                  autoComplete="off"
                />
                {showAddSuggestions && addSearchResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {addSearchResults.map((p, idx) => (
                      <button
                        key={`${p.sku}-${idx}`}
                        type="button"
                        className="w-full text-left px-3 py-2.5 hover:bg-primary-pale transition border-b border-border last:border-b-0"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleAddSelectSuggestion(p)}
                      >
                        <p className="font-medium text-text-primary text-xs">
                          {p.productName}
                        </p>
                        <p className="text-[10px] text-text-secondary">
                          SKU: {p.sku} | Batch: {p.batch}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* SKU */}
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">
                  SKU
                </label>
                <input
                  type="text"
                  value={addForm.sku}
                  onChange={(e) =>
                    setAddForm({ ...addForm, sku: e.target.value })
                  }
                  className="w-full px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  placeholder="Masukkan SKU"
                />
              </div>

              {/* Batch */}
              <div ref={addBatchDropdownRef} className="relative">
                <label className="block text-xs font-medium text-text-primary mb-1">
                  Batch
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={addForm.batch}
                    onChange={(e) => {
                      setAddForm({ ...addForm, batch: e.target.value });
                      setShowAddBatchDropdown(true);
                    }}
                    onFocus={() => {
                      if (addForm.sku.trim()) setShowAddBatchDropdown(true);
                    }}
                    className="w-full px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm pr-8"
                    placeholder={
                      addBatchesForSku.length > 0
                        ? "Pilih atau ketik batch baru..."
                        : "Masukkan batch"
                    }
                  />
                  {addBatchesForSku.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setShowAddBatchDropdown(!showAddBatchDropdown)
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-primary p-0.5"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${showAddBatchDropdown ? "rotate-180" : ""}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  )}
                </div>
                {showAddBatchDropdown && addForm.sku.trim() && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
                    {addFilteredBatches.length > 0 ? (
                      <div className="max-h-40 overflow-y-auto">
                        {addFilteredBatches.map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => {
                              setAddForm({ ...addForm, batch: b });
                              setShowAddBatchDropdown(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-primary-pale/50 transition border-b border-border last:border-b-0 ${
                              addForm.batch === b
                                ? "bg-primary/10 text-primary font-semibold"
                                : "text-text-primary"
                            }`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    ) : addForm.batch.trim() ? (
                      <div className="px-3 py-2 text-xs text-text-secondary">
                        <span className="text-primary font-medium">
                          &quot;{addForm.batch.trim()}&quot;
                        </span>{" "}
                        — batch baru
                      </div>
                    ) : (
                      <div className="px-3 py-2 text-xs text-text-secondary">
                        Tidak ada batch untuk SKU ini
                      </div>
                    )}
                    {addForm.batch.trim() &&
                      !addBatchesForSku.includes(addForm.batch.trim()) &&
                      addFilteredBatches.length > 0 && (
                        <div className="border-t border-border px-3 py-2 bg-gray-50">
                          <button
                            type="button"
                            onClick={() => setShowAddBatchDropdown(false)}
                            className="text-xs text-primary font-medium hover:underline"
                          >
                            + Gunakan &quot;{addForm.batch.trim()}&quot; sebagai
                            batch baru
                          </button>
                        </div>
                      )}
                  </div>
                )}
              </div>

              {/* Qty */}
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">
                  Quantity{" "}
                  <span className="text-[10px] text-text-secondary font-normal">
                    (bisa pakai rumus: 10+5, 10x10+5)
                  </span>
                </label>
                <QtyInput
                  value={addForm.qty}
                  onChange={(v) => setAddForm((prev) => ({ ...prev, qty: v }))}
                  onExprCommit={(expr) => setAddFormula(expr)}
                  wide
                />
              </div>

              <button
                onClick={handleAddProduct}
                className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary-light transition text-sm active:scale-[0.98]"
              >
                Simpan Produk
              </button>
            </div>

            {/* Scanner Modals */}
            {showBarcodeScanner && (
              <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-md rounded-2xl p-4 shadow-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-text-primary text-sm">
                      Scan Barcode Produk
                    </h3>
                    <button
                      onClick={() => setShowBarcodeScanner(false)}
                      className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
                    >
                      ✕
                    </button>
                  </div>
                  <BarcodeScanner
                    onScan={(code) => handleAddBarcodeScan(code)}
                    active={showBarcodeScanner}
                  />
                </div>
              </div>
            )}
            {showLocationScanner && (
              <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-md rounded-2xl p-4 shadow-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-text-primary text-sm">
                      Scan Barcode Lokasi
                    </h3>
                    <button
                      onClick={() => setShowLocationScanner(false)}
                      className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
                    >
                      ✕
                    </button>
                  </div>
                  <BarcodeScanner
                    onScan={(code) => handleLocationBarcodeScan(code)}
                    active={showLocationScanner}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Data Cards ── */}
        {filteredHistory.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-card">
            <svg
              className="w-12 h-12 mx-auto mb-3 text-text-secondary/40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-text-secondary text-sm">
              {hasActiveFilters
                ? "Tidak ada hasil yang cocok"
                : "Belum ada riwayat"}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-2 text-sm text-primary font-medium hover:underline"
              >
                Reset Filter
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {groupedHistory.map(([locationName, entries]) => (
              <div key={locationName}>
                {/* Location Group Header */}
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="flex items-center gap-2 bg-gradient-to-r from-primary to-primary-light text-white px-4 py-2 rounded-xl shadow-md">
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span className="text-sm font-bold tracking-wide">
                      {locationName}
                    </span>
                    <span className="bg-white/25 text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                      {entries.length}
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
                </div>

                {/* Entries for this location */}
                <div className="space-y-2.5">
                  {entries.map((entry) => (
                    <div
                      key={entry.rowId}
                      className="bg-white rounded-xl shadow-card border border-border border-l-[3px] border-l-primary p-3.5"
                    >
                      {/* Row 1: Product Name + Actions */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-[13px] font-semibold text-text-primary leading-snug flex-1">
                          {entry.productName}
                          {entry.edited === "Yes" && (
                            <span
                              className="ml-1 text-[10px] text-accent-yellow"
                              title={`Diedit: ${entry.editTimestamp}`}
                            >
                              ✏️
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleEdit(entry)}
                            className="px-2.5 py-1 bg-primary/10 text-primary text-[10px] rounded-lg font-semibold hover:bg-primary/20 transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(entry)}
                            className="px-2.5 py-1 bg-accent-red/10 text-accent-red text-[10px] rounded-lg font-semibold hover:bg-accent-red/20 transition"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                      {/* Row 2: Batch (inline editable) + SKU */}
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <div
                          className="flex items-center gap-1 min-w-0 relative"
                          ref={
                            editingBatch === entry.rowId
                              ? inlineBatchDropdownRef
                              : undefined
                          }
                        >
                          <span className="text-[11px] text-text-secondary font-medium">
                            Batch:
                          </span>
                          {editingBatch === entry.rowId ? (
                            <div className="relative">
                              <input
                                type="text"
                                value={editingBatchValue}
                                onChange={(e) => {
                                  setEditingBatchValue(e.target.value);
                                  setShowInlineBatchDropdown(true);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveInlineBatch(entry);
                                  if (e.key === "Escape") {
                                    setEditingBatch(null);
                                    setShowInlineBatchDropdown(false);
                                  }
                                }}
                                autoFocus
                                className="w-28 px-1.5 py-0.5 border border-primary rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-primary pr-5"
                              />
                              {inlineBatchesForSku.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShowInlineBatchDropdown(
                                      !showInlineBatchDropdown,
                                    )
                                  }
                                  className="absolute right-0.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-primary p-0.5"
                                >
                                  <svg
                                    className={`w-3 h-3 transition-transform ${showInlineBatchDropdown ? "rotate-180" : ""}`}
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                  >
                                    <path d="M6 9l6 6 6-6" />
                                  </svg>
                                </button>
                              )}
                              {showInlineBatchDropdown &&
                                inlineBatchesForSku.length > 0 && (
                                  <div className="absolute z-30 left-0 mt-1 w-36 bg-white border border-border rounded-lg shadow-lg overflow-hidden">
                                    <div className="max-h-32 overflow-y-auto">
                                      {inlineFilteredBatches.map((b) => (
                                        <button
                                          key={b}
                                          type="button"
                                          onMouseDown={(e) =>
                                            e.preventDefault()
                                          }
                                          onClick={() => {
                                            setEditingBatchValue(b);
                                            setShowInlineBatchDropdown(false);
                                          }}
                                          className={`w-full text-left px-2 py-1.5 text-[11px] hover:bg-primary-pale/50 transition border-b border-border last:border-b-0 ${
                                            editingBatchValue === b
                                              ? "bg-primary/10 text-primary font-semibold"
                                              : "text-text-primary"
                                          }`}
                                        >
                                          {b}
                                        </button>
                                      ))}
                                    </div>
                                    {editingBatchValue.trim() &&
                                      !inlineBatchesForSku.includes(
                                        editingBatchValue.trim(),
                                      ) && (
                                        <div className="border-t border-border px-2 py-1.5 bg-gray-50">
                                          <button
                                            type="button"
                                            onMouseDown={(e) =>
                                              e.preventDefault()
                                            }
                                            onClick={() =>
                                              setShowInlineBatchDropdown(false)
                                            }
                                            className="text-[10px] text-primary font-medium hover:underline"
                                          >
                                            + &quot;{editingBatchValue.trim()}
                                            &quot; batch baru
                                          </button>
                                        </div>
                                      )}
                                  </div>
                                )}
                            </div>
                          ) : (
                            <span
                              className="text-[11px] text-text-primary font-medium cursor-pointer hover:text-primary transition"
                              onClick={() => startInlineBatchEdit(entry)}
                            >
                              {entry.batch}{" "}
                              <span className="text-[9px] opacity-50">✏️</span>
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-text-secondary">
                          SKU:{" "}
                          <span className="font-medium text-text-primary">
                            {entry.sku}
                          </span>
                        </span>
                      </div>
                      {/* Row 3: Qty (prominent) + Date + Operator */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-text-secondary font-medium">
                            Qty:
                          </span>
                          {editingQty === entry.rowId ? (
                            <div className="flex flex-col items-start">
                              <QtyInput
                                wide
                                value={editingQtyValue}
                                onChange={(v) => setEditingQtyValue(v)}
                                onExprCommit={(expr) =>
                                  setEditingQtyFormula(expr)
                                }
                              />
                              <div className="flex gap-1 mt-1">
                                <button
                                  type="button"
                                  onClick={() => saveInlineQty(entry)}
                                  className="px-2.5 py-0.5 bg-primary text-white text-[10px] rounded-lg font-semibold"
                                >
                                  💾
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingQty(null)}
                                  className="px-2.5 py-0.5 bg-gray-200 text-text-primary text-[10px] rounded-lg font-semibold"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                              <span className="text-base font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">
                                {entry.qty.toLocaleString()}
                              </span>
                              {entry.formula && (
                                <span className="text-[10px] text-text-secondary bg-gray-100 px-1.5 py-0.5 rounded-md">
                                  🧮 {entry.formula}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => startInlineQtyEdit(entry)}
                                className="text-[10px] text-text-secondary hover:text-primary opacity-50"
                                title="Edit qty"
                              >
                                ✏️
                              </button>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-text-secondary">
                            {(() => {
                              const d = parseTimestamp(entry.timestamp);
                              if (!d) return entry.timestamp;
                              const dd = String(d.getDate()).padStart(2, "0");
                              const mm = [
                                "Jan",
                                "Feb",
                                "Mar",
                                "Apr",
                                "Mei",
                                "Jun",
                                "Jul",
                                "Agu",
                                "Sep",
                                "Okt",
                                "Nov",
                                "Des",
                              ][d.getMonth()];
                              const hh = String(d.getHours()).padStart(2, "0");
                              const mi = String(d.getMinutes()).padStart(
                                2,
                                "0",
                              );
                              return `${dd} ${mm} ${hh}:${mi}`;
                            })()}
                          </span>
                          {entry.operator && (
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-semibold rounded-md">
                              {entry.operator}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Formula tooltip */}
                      {showFormula === entry.rowId && entry.formula && (
                        <div className="mt-2 bg-gray-800 text-white text-[10px] px-2.5 py-1 rounded-lg inline-block">
                          {entry.formula}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedEntry && (
        <EditModal
          entry={selectedEntry}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveEdit}
          allProducts={allProductsRef.current || undefined}
        />
      )}

      <BottomNav activePage="history" />
    </div>
  );
}
