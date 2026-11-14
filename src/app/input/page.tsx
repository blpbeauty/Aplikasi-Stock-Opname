"use client";

import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDataSync } from "@/components/DataSyncProvider";
import { InputDraft, getDraft, saveDraft, removeDraft } from "@/lib/drafts";
import { useAuth } from "@/components/AuthProvider";
import ScannerModal from "@/components/ScannerModal";
import MoveSheet from "@/components/MoveSheet";
import QtyInput, { calcExpr } from "@/components/QtyInput";
import ConfirmModal from "@/components/ConfirmModal";
import DuplicateWarningModal from "@/components/DuplicateWarningModal";
import BatchPickerModal from "@/components/BatchPickerModal";
import { Dialog, EmptyState, Field, PageSkeleton } from "@/components/ui";
import Autocomplete from "@/components/Autocomplete";
import {
  getProductsApi,
  saveStockOpnameApi,
  updateEntryApi,
  deleteProductApi,
  addMasterProductApi,
  lookupBarcodeApi,
  searchProductsApi,
  preloadHistory,
  getAllProductsApi,
  invalidateMemCache,
} from "@/lib/api";
import { findDuplicates, DuplicateMatch } from "@/lib/duplicates";
import { getHistoryLocal, getPendingWrites, updatePendingWrite } from "@/lib/localDb";
import { scrollElementCenter } from "@/lib/scroll";
import { Product, HistoryEntry } from "@/lib/types";
import { getCache, setCache, clearCache } from "@/lib/cache";
import {
  SearchIcon,
  CameraIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  BoxIcon,
  TrashIcon,
  PencilIcon,
  CalculatorIcon,
  PlusIcon,
  CheckIcon,
  XIcon,
  MoreHorizontalIcon,
} from "@/components/icons";
import toast from "react-hot-toast";

type FilterTab = "all" | "pending" | "completed";

function InputPageContent() {
  const { user } = useAuth();
  const { isReady } = useDataSync();
  const router = useRouter();
  const searchParams = useSearchParams();
  const location = (searchParams.get("location") || "").trim().toUpperCase();

  const [products, setProducts] = useState<Product[]>([]);
  const [newProducts, setNewProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [counted, setCounted] = useState<Record<string, boolean>>({});
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [draftDirty, setDraftDirty] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const saveFinished = useRef(false);
  const latestDraft = useRef<InputDraft | null>(null);
  const [formulas, setFormulas] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [scannerMode, setScannerMode] = useState<"quick" | "addForm">("quick");
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [online, setOnline] = useState(true);

  // Active row expanded for expression calculator or actions
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [rowExprDraft, setRowExprDraft] = useState<Record<string, string>>({});

  // Exit (unsaved changes) confirm modal state
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  // Semua-kuantitas-nol: simpan hanya lewat konfirmasi eksplisit
  const [showZeroConfirm, setShowZeroConfirm] = useState(false);

  // Duplicate prevention state
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingItemsToSave, setPendingItemsToSave] = useState<any[]>([]);
  const [pendingZeroMode, setPendingZeroMode] = useState(false);

  const [newProductForm, setNewProductForm] = useState({
    productName: "",
    sku: "",
    batch: "",
    barcode: "",
    qty: 0,
  });
  const [newProductFormula, setNewProductFormula] = useState("");
  const [savingMasterData, setSavingMasterData] = useState(false);

  // Pop-up Pilih Batch (Model Chip) untuk baris produk di lokasi & untuk Tambah Produk Baru
  const [batchModalTarget, setBatchModalTarget] = useState<{
    productName: string;
    sku: string;
    batch: string;
    isNew: boolean;
  } | null>(null);
  const [showAddFormBatchModal, setShowAddFormBatchModal] = useState(false);
  const [masterDataTick, setMasterDataTick] = useState(0);

  // Move location (shared MoveSheet)
  const [showMoveModal, setShowMoveModal] = useState(false);

  // Auto-scroll & flash refs
  const [flashRowKey, setFlashRowKey] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addFormQtyRef = useRef<HTMLDivElement>(null);
  const productListRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Unique key per product row
  const productKey = (sku: string, batch: string) => `${sku}__${batch}`;
  const allProductsRef = useRef<Product[] | null>(null);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  const normalizeProduct = (p: any): Product => ({
    ...p,
    productName: String(p.productName ?? ""),
    sku: String(p.sku ?? ""),
    batch: String(p.batch ?? ""),
    barcode: String(p.barcode ?? ""),
  });

  // Get unique batches for current SKU (Tambah Produk Baru)
  const batchesForSku = useMemo(() => {
    const sku = String(newProductForm.sku || "").trim().toLowerCase();
    if (!sku) return [];
    const all = allProductsRef.current || [];
    const batchSet = new Set<string>();
    all.forEach((p) => {
      if (p && String(p.sku || "").trim().toLowerCase() === sku && p.batch) {
        batchSet.add(String(p.batch));
      }
    });
    [...products, ...newProducts].forEach((p) => {
      if (p && String(p.sku || "").trim().toLowerCase() === sku && p.batch) {
        batchSet.add(String(p.batch));
      }
    });
    return Array.from(batchSet).sort();
  }, [newProductForm.sku, products, newProducts, masterDataTick]);

  // Batches for row BatchPickerModal
  const inlineBatchesForSku = useMemo(() => {
    const sku = String(batchModalTarget?.sku || "").trim().toLowerCase();
    if (!sku) return [];
    const all = allProductsRef.current || [];
    const batchSet = new Set<string>();
    all.forEach((p) => {
      if (p && String(p.sku || "").trim().toLowerCase() === sku && p.batch) {
        batchSet.add(String(p.batch));
      }
    });
    [...products, ...newProducts].forEach((p) => {
      if (p && String(p.sku || "").trim().toLowerCase() === sku && p.batch) {
        batchSet.add(String(p.batch));
      }
    });
    return Array.from(batchSet).sort();
  }, [batchModalTarget?.sku, products, newProducts, masterDataTick]);

  useEffect(() => {
    if (!isReady) return;
    if (user?.email) preloadHistory(user.email, undefined, user?.name);
    const loadAllProducts = async () => {
      const cached = getCache<Product[]>("allProducts");
      if (cached && cached.age < 120) {
        allProductsRef.current = cached.data;
        setMasterDataTick((t) => t + 1);
      }
      try {
        const result = await getAllProductsApi();
        if (result.success && result.products) {
          allProductsRef.current = result.products;
          setCache("allProducts", result.products);
          setMasterDataTick((t) => t + 1);
        }
      } catch {}
    };
    loadAllProducts();
  }, [user, isReady]);

  useEffect(() => {
    if (!location) {
      router.push("/scan");
      return;
    }
    if (isReady) fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, router, isReady, user?.email]);

  const fetchProducts = async (ignoreDraft = false) => {
    setDraftReady(false);
    saveFinished.current = false;
    setExpandedRowKey(null);
    setBatchModalTarget(null);
    const draft = !ignoreDraft && user?.email ? getDraft(user.email, location) : null;
    if (draft) {
      setProducts(draft.products);
      setNewProducts(draft.newProducts);
      setQuantities(draft.quantities);
      setFormulas(draft.formulas);
      setCounted(draft.counted);
      setNewProductForm(draft.newProductForm);
      setNewProductFormula(draft.newProductFormula || "");
      setShowAddForm(draft.showAddForm);
      setDraftRestored(true);
      setDraftDirty(true);
      setLoading(false);
      setDraftReady(true);
      return;
    }
    setNewProducts([]);
    setCounted({});
    setQuantities({});
    setFormulas({});
    setDraftDirty(false);
    setDraftRestored(false);
    setNewProductForm({ productName: "", sku: "", batch: "", barcode: "", qty: 0 });
    setNewProductFormula("");
    setShowAddForm(searchParams.get("new") === "1");
    const ck = `products:${location}`;
    const cached = getCache<Product[]>(ck);
    if (cached) {
      const normalized = cached.data.map(normalizeProduct);
      setProducts(normalized);
      const init: Record<string, number> = {};
      normalized.forEach((p) => (init[productKey(p.sku, p.batch)] = 0));
      setQuantities(init);
      setLoading(false);
    }

    try {
      const result = await getProductsApi(location);
      if (result.success && result.products) {
        const normalized = result.products.map(normalizeProduct);
        setProducts(normalized);
        setCache(ck, normalized);
        setQuantities((prev) => {
          const next = { ...prev };
          normalized.forEach((p) => {
            const k = productKey(p.sku, p.batch);
            if (next[k] === undefined) next[k] = 0;
          });
          return next;
        });
      } else if (!cached) {
        toast.error(result.message || "Gagal mengambil data produk");
        router.push("/scan");
      }
    } catch (error) {
      console.error("Fetch products error:", error);
      if (!cached) {
        toast.error("Terjadi kesalahan saat mengambil data produk");
        router.push("/scan");
      }
    } finally {
      setLoading(false);
      setDraftReady(true);
    }
  };

  const handleQuantityChange = (key: string, qty: number) => {
    const cleanQty = Math.max(0, qty);
    setQuantities((prev) => ({ ...prev, [key]: cleanQty }));
    setCounted((prev) => ({ ...prev, [key]: true }));
  };

  const handleStepQuantity = (key: string, delta: number) => {
    const isAlreadyCounted = Boolean(counted[key]);
    const current = isAlreadyCounted ? (quantities[key] ?? 0) : 0;
    const next = Math.max(0, current + delta);
    setQuantities((prev) => ({ ...prev, [key]: next }));
    setCounted((prev) => ({ ...prev, [key]: true }));
    setRowExprDraft((prev) => {
      if (!(key in prev)) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const handleExprCommit = (key: string, expr: string) => {
    setFormulas((prev) => ({ ...prev, [key]: expr }));
  };

  const handleDeleteProduct = (product: Product, isNew: boolean) => {
    const key = productKey(product.sku, product.batch);
    const prevProducts = [...products];
    const prevNewProducts = [...newProducts];
    const prevQuantities = { ...quantities };
    const prevFormulas = { ...formulas };
    const prevCounted = { ...counted };

    setProducts((prev) =>
      prev.filter((p) => !(p.sku === product.sku && p.batch === product.batch))
    );
    setNewProducts((prev) =>
      prev.filter((p) => !(p.sku === product.sku && p.batch === product.batch))
    );
    setQuantities((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    setCounted((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFormulas((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });

    const ck = `products:${location}`;
    const remaining = [...products, ...newProducts].filter(
      (p) => !(p.sku === product.sku && p.batch === product.batch)
    );
    setCache(ck, remaining);
    clearCache("history:");

    const restoreLocal = () => {
      setProducts(prevProducts);
      setNewProducts(prevNewProducts);
      setQuantities(prevQuantities);
      setFormulas(prevFormulas);
      setCounted(prevCounted);
      setCache(ck, prevProducts);
    };

    let deletedOnServer = false;
    let rolledBack = false;
    const serverDelete: Promise<void> = isNew
      ? Promise.resolve()
      : (async () => {
          try {
            const result = await deleteProductApi(location, product.sku, product.batch);
            if (result.success) {
              deletedOnServer = true;
              return;
            }
            rolledBack = true;
            restoreLocal();
            toast.error(result.message || "Gagal menghapus, data dikembalikan");
          } catch {
            rolledBack = true;
            restoreLocal();
            toast.error("Gagal menghapus, data dikembalikan");
          }
        })();

    toast(
      (t) => (
        <span className="flex items-center gap-3 min-w-0">
          <span className="min-w-0 truncate">Dihapus: {product.productName}</span>
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id);
              if (rolledBack) return;
              restoreLocal();
              if (isNew) return;
              serverDelete.then(() => {
                if (deletedOnServer) {
                  addMasterProductApi(
                    location,
                    product.productName,
                    product.sku,
                    product.batch,
                    product.barcode
                  ).catch(() => toast.error("Gagal mengembalikan produk ke server"));
                }
              });
            }}
            className="shrink-0 font-bold text-primary underline underline-offset-2"
          >
            Urungkan
          </button>
        </span>
      ),
      { duration: 8000 }
    );
  };

  const handleCloseAddForm = useCallback(() => setShowAddForm(false), []);

  const resolveProductNames = useCallback(async (query: string): Promise<Product[]> => {
    const q = query.trim().toLowerCase();
    const dedupBySku = (items: Product[]) => {
      const seen = new Set<string>();
      const out: Product[] = [];
      for (const p of items) {
        const key = String(p.sku || "").trim().toLowerCase() || String(p.productName || "").trim().toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(p);
        }
        if (out.length >= 10) break;
      }
      return out;
    };
    if (allProductsRef.current) {
      const filtered = dedupBySku(
        allProductsRef.current.filter(
          (p) =>
            String(p.productName || "").toLowerCase().includes(q) ||
            String(p.sku || "").toLowerCase().includes(q)
        )
      );
      if (filtered.length > 0) return filtered;
    }
    try {
      const result = await searchProductsApi(query.trim());
      return result.success && result.products ? dedupBySku(result.products) : [];
    } catch {
      return [];
    }
  }, []);

  const handleSelectSuggestion = useCallback((product: Product) => {
    setNewProductForm((prev) => ({
      ...prev,
      productName: product.productName,
      sku: product.sku,
      batch: "",
      barcode: product.barcode || prev.barcode,
    }));
    // Munculkan pop-up pilih batch (model chip) terlebih dahulu sebelum fokus ke input Qty
    setShowAddFormBatchModal(true);
  }, []);

  const handleOpenRowBatchPicker = (product: Product, isNew: boolean) => {
    setBatchModalTarget({
      productName: product.productName,
      sku: product.sku,
      batch: product.batch,
      isNew,
    });
  };

  const handleBarcodeScan = async (barcode: string) => {
    setShowBarcodeScanner(false);
    const cleanCode = barcode.trim();
    if (!cleanCode) return;

    // Jika dipicu dari tombol utama dock bawah ("quick"), cek dulu apakah barang ada di lokasi ini
    if (scannerMode === "quick") {
      const all = [...products, ...newProducts];
      const matchIdx = all.findIndex(
        (p) =>
          (p?.barcode && String(p.barcode).trim().toLowerCase() === cleanCode.toLowerCase()) ||
          String(p?.sku || "").trim().toLowerCase() === cleanCode.toLowerCase()
      );
      if (matchIdx !== -1) {
        const matched = all[matchIdx];
        const isNew = matchIdx >= products.length;
        const matchKey = productKey(matched.sku, matched.batch);
        setActiveTab("all");
        setFilterQuery("");
        handleOpenRowBatchPicker(matched, isNew);
        setTimeout(() => {
          const rowEl = findRowElementByKey(matchKey);
          if (rowEl) {
            scrollElementCenter(rowEl, { focusInput: false });
            triggerRowFlash(matchKey);
          }
        }, 120);
        return;
      }
      // Jika belum ada di lokasi ini, buka modal tambah produk & cari di Master Data
      setShowAddForm(true);
    }

    setScanningBarcode(true);
    try {
      const result = await lookupBarcodeApi(cleanCode);
      if (result.success && result.product) {
        setNewProductForm((prev) => ({
          ...prev,
          productName: result.product!.productName,
          sku: result.product!.sku,
          batch: "",
          barcode: cleanCode,
        }));
        setShowAddFormBatchModal(true);
      } else {
        setNewProductForm((prev) => ({ ...prev, barcode: cleanCode }));
        toast.error(result.message || "Produk tidak ditemukan di Master, isi manual");
      }
    } catch {
      setNewProductForm((prev) => ({ ...prev, barcode: cleanCode }));
      toast.error("Gagal lookup barcode, isi manual");
    } finally {
      setScanningBarcode(false);
    }
  };

  const handleAddNewProduct = () => {
    if (!newProductForm.productName || !newProductForm.sku) {
      toast.error("Nama Produk dan SKU harus diisi");
      return;
    }

    const batchValue = newProductForm.batch.trim();
    if (!batchValue) {
      toast.error("Pilih nomor batch terlebih dahulu");
      setShowAddFormBatchModal(true);
      return;
    }

    if (newProductForm.qty <= 0) {
      toast.error("Quantity harus lebih dari 0");
      return;
    }

    const all = [...products, ...newProducts];
    const targetSku = String(newProductForm.sku || "").trim().toLowerCase();
    const targetBatch = batchValue.trim().toLowerCase();
    const existingIndex = all.findIndex(
      (p) =>
        String(p?.sku || "").trim().toLowerCase() === targetSku &&
        String(p?.batch || "").trim().toLowerCase() === targetBatch
    );
    if (existingIndex !== -1) {
      const existingProd = all[existingIndex];
      const dupKey = productKey(existingProd.sku, existingProd.batch);
      toast.error("Produk dengan SKU dan Batch ini sudah ada di daftar. Silakan edit kuantitasnya langsung.");
      setActiveTab("all");
      setFilterQuery("");
      setShowAddForm(false);
      setExpandedRowKey(dupKey);
      focusAndScrollRowByKey(dupKey, true);
      triggerRowFlash(dupKey);
      return;
    }

    const newProduct: Product = {
      productName: newProductForm.productName,
      sku: newProductForm.sku,
      batch: batchValue,
      barcode: newProductForm.barcode || undefined,
    };

    setNewProducts((prev) => [...prev, newProduct]);
    const nk = productKey(newProduct.sku, newProduct.batch);
    setQuantities((prev) => ({ ...prev, [nk]: newProductForm.qty }));
    setCounted((prev) => ({ ...prev, [nk]: true }));
    if (newProductFormula) {
      setFormulas((prev) => ({ ...prev, [nk]: newProductFormula }));
    }

    setNewProductForm({ productName: "", sku: "", batch: "", barcode: "", qty: 0 });
    setNewProductFormula("");
    setShowAddForm(false);
    toast.success("Produk ditambahkan ke hitungan");
  };

  const handleBatchSave = (
    sku: string,
    oldBatch: string,
    isNew: boolean,
    selectedBatch: string
  ) => {
    const newBatch = selectedBatch.trim().toUpperCase();
    if (!newBatch) {
      toast.error("Batch tidak boleh kosong");
      return;
    }

    const all = [...products, ...newProducts];
    const oldKey = productKey(sku, oldBatch);
    const duplicateInLoc = all.some(
      (p) =>
        String(p.sku || "").trim().toLowerCase() === String(sku || "").trim().toLowerCase() &&
        String(p.batch || "").trim().toLowerCase() === newBatch.toLowerCase() &&
        String(p.batch || "") !== oldBatch
    );

    if (duplicateInLoc) {
      // Jika baris asal belum dihitung, langsung arahkan & buka input Qty pada baris batch yang sudah ada di lokasi
      if (!counted[oldKey]) {
        setBatchModalTarget(null);
        const existingKey = productKey(sku, newBatch);
        setExpandedRowKey(existingKey);
        focusAndScrollRowByKey(existingKey, true);
        triggerRowFlash(existingKey);
        return;
      }
      toast.error("Batch tersebut sudah dipakai SKU ini di lokasi");
      return;
    }

    setBatchModalTarget(null);

    if (newBatch !== oldBatch) {
      if (isNew) {
        setNewProducts((prev) =>
          prev.map((p) => (p.sku === sku && p.batch === oldBatch ? { ...p, batch: newBatch } : p))
        );
      } else {
        setProducts((prev) =>
          prev.map((p) => (p.sku === sku && p.batch === oldBatch ? { ...p, batch: newBatch } : p))
        );
      }

      const newKey = productKey(sku, newBatch);
      setDraftDirty(true);
      if (oldKey !== newKey) {
        setCounted((prev) => {
          const next = { ...prev };
          if (next[oldKey]) next[newKey] = true;
          delete next[oldKey];
          return next;
        });
        setQuantities((prev) => {
          const copy = { ...prev };
          copy[newKey] = copy[oldKey] || 0;
          delete copy[oldKey];
          return copy;
        });
        setFormulas((prev) => {
          const copy = { ...prev };
          if (copy[oldKey]) {
            copy[newKey] = copy[oldKey];
            delete copy[oldKey];
          }
          return copy;
        });
      }
    }

    // Flow otomatis: setelah pilih chip batch di pop-up, langsung buka & fokus ke input Qty!
    const targetKey = productKey(sku, newBatch);
    setExpandedRowKey(targetKey);
    focusAndScrollRowByKey(targetKey, true);
    triggerRowFlash(targetKey);
  };

  const handleMoveProducts = () => {
    setShowMoveModal(false);
    clearCache("products:");
    invalidateMemCache("getProducts");
    invalidateMemCache("getAllProducts");
    invalidateMemCache("getAllLocations");
    fetchProducts(true);
  };

  const executeSave = async (items: any[], zeroMode: boolean) => {
    setSaving(true);
    setShowDuplicateModal(false);
    setShowZeroConfirm(false);
    const sessionId = `${user?.email}_${Date.now()}`;
    const timestamp = new Date().toISOString();

    let saved: { sessionId?: string; rowIds?: string[] } | null = null;
    try {
      const result = await saveStockOpnameApi(
        sessionId,
        user?.email || "",
        location,
        timestamp,
        items
      );
      if (!result.success) {
        toast.error(result.message || "Gagal menyimpan ke server. Data masih ada, coba lagi.");
        setSaving(false);
        return;
      }
      saved = { sessionId: result.sessionId, rowIds: result.rowIds };
    } catch {
      toast.error("Gagal menyimpan ke server. Data masih ada, coba lagi.");
      setSaving(false);
      return;
    }

    const historyCacheKey = `history:${user?.email}:all`;
    const cachedHistory = getCache<HistoryEntry[]>(historyCacheKey);
    const optimisticEntries: HistoryEntry[] = items.map((item, idx) => ({
      sessionId: saved?.sessionId || sessionId,
      rowId: saved?.rowIds?.[idx] || `optimistic_${Date.now()}_${idx}`,
      timestamp,
      operator: user?.email || "",
      location,
      productName: item.productName,
      sku: item.sku,
      batch: item.batch,
      qty: item.qty,
      edited: "",
      editTimestamp: "",
      formula: item.formula || "",
    }));
    setCache(historyCacheKey, [...optimisticEntries, ...(cachedHistory?.data || [])]);

    if (typeof window !== "undefined") {
      window.localStorage.setItem("lastSaveTs", String(Date.now()));
      window.localStorage.setItem(`lastSaveLocation:${user?.email}`, location);
    }

    saveFinished.current = true;
    latestDraft.current = null;
    if (user?.email) {
      try {
        removeDraft(user.email, location);
      } catch {}
    }
    invalidateMemCache("getHistory");
    clearCache("products:");
    toast.success(
      "Tersimpan di perangkat. Status pengiriman tersedia di indikator sinkronisasi."
    );
    router.push("/scan");
  };

  const executeOverwrite = async (items: any[], dups: DuplicateMatch[], zeroMode: boolean) => {
    setSaving(true);
    setShowDuplicateModal(false);
    setShowZeroConfirm(false);
    const timestamp = new Date().toISOString();
    const sessionId = `${user?.email}_${Date.now()}`;

    try {
      const dupMap = new Map<string, DuplicateMatch>();
      dups.forEach((d) => {
        const k = `${String(d.item?.sku || "").trim().toLowerCase()}__${String(d.item?.batch || "").trim().toLowerCase()}`;
        dupMap.set(k, d);
      });

      const itemsToUpdate = items.filter((item) => {
        const k = `${String(item?.sku || "").trim().toLowerCase()}__${String(item?.batch || "").trim().toLowerCase()}`;
        return dupMap.has(k);
      });

      const itemsToInsert = items.filter((item) => {
        const k = `${String(item?.sku || "").trim().toLowerCase()}__${String(item?.batch || "").trim().toLowerCase()}`;
        return !dupMap.has(k);
      });

      for (const item of itemsToUpdate) {
        const k = `${String(item?.sku || "").trim().toLowerCase()}__${String(item?.batch || "").trim().toLowerCase()}`;
        const match = dupMap.get(k)!;

        if (match.existing.isPending && match.existing.pendingJobId) {
          const pendingWrites = await getPendingWrites();
          const targetJob = pendingWrites.find((j) => j.id === match.existing.pendingJobId);
          if (targetJob && Array.isArray(targetJob.data.items)) {
            const itemIdx = targetJob.data.items.findIndex(
              (p: any) =>
                String(p?.sku || "").trim().toLowerCase() === String(item?.sku || "").trim().toLowerCase() &&
                String(p?.batch || "").trim().toLowerCase() === String(item?.batch || "").trim().toLowerCase()
            );
            if (itemIdx !== -1) {
              targetJob.data.items[itemIdx].qty = item.qty;
              if (item.formula) targetJob.data.items[itemIdx].formula = item.formula;
              if (targetJob.entries?.[itemIdx]) {
                targetJob.entries[itemIdx].qty = item.qty;
                if (item.formula) targetJob.entries[itemIdx].formula = item.formula;
                targetJob.entries[itemIdx].editTimestamp = timestamp;
              }
              await updatePendingWrite(targetJob);
            }
          }
        } else if (match.existing.rowId) {
          await updateEntryApi(
            match.existing.rowId,
            match.existing.sessionId || sessionId,
            item.qty,
            timestamp,
            { formula: item.formula }
          );
        }
      }

      if (itemsToInsert.length > 0) {
        await saveStockOpnameApi(
          sessionId,
          user?.email || "",
          location,
          timestamp,
          itemsToInsert
        );
      }

      saveFinished.current = true;
      latestDraft.current = null;
      if (user?.email) {
        try {
          removeDraft(user.email, location);
        } catch {}
      }
      invalidateMemCache("getHistory");
      clearCache("products:");
      toast.success("Nilai berhasil diperbarui tanpa baris duplikat.");
      router.push("/scan");
    } catch {
      toast.error("Gagal memperbarui data. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const allProducts = useMemo(() => [...products, ...newProducts], [products, newProducts]);

  const totalItems = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  const countedCount = allProducts.filter((p) => counted[productKey(p.sku, p.batch)]).length;
  const pendingCount = Math.max(0, allProducts.length - countedCount);

  const formHasContent = !!(
    newProductForm.productName ||
    newProductForm.sku ||
    newProductForm.batch ||
    newProductForm.barcode ||
    newProductForm.qty ||
    newProductFormula
  );
  const hasUnsavedChanges =
    countedCount > 0 || newProducts.length > 0 || formHasContent || draftDirty;

  const doSave = async (zeroMode: boolean, bypassDuplicateCheck: boolean = false) => {
    if (saving) return;
    if (formHasContent) {
      setShowAddForm(true);
      toast.error("Masukkan produk dari form ke hitungan sebelum menyimpan hasil.");
      return;
    }

    const buildItem = (product: Product, isNew: boolean) => {
      const k = productKey(product.sku, product.batch);
      return {
        productName: product.productName,
        sku: product.sku,
        batch: product.batch,
        barcode: product.barcode || "",
        qty: zeroMode ? 0 : quantities[k] || 0,
        formula: zeroMode ? "" : formulas[k] || "",
        isNew,
      };
    };

    const items = zeroMode
      ? allProducts.map((p) => buildItem(p, newProducts.includes(p)))
      : allProducts
          .filter((product) => counted[productKey(product.sku, product.batch)])
          .map((p) =>
            buildItem(
              p,
              newProducts.some((n) => n.sku === p.sku && n.batch === p.batch)
            )
          );

    if (items.length === 0) {
      toast.error("Belum ada produk yang ditandai sudah dihitung");
      return;
    }

    if (!bypassDuplicateCheck) {
      try {
        const [localHistory, pendingWrites] = await Promise.all([
          getHistoryLocal(),
          getPendingWrites(),
        ]);
        const dups = findDuplicates(location, items, localHistory, pendingWrites);
        if (dups.length > 0) {
          setPendingItemsToSave(items);
          setPendingZeroMode(zeroMode);
          setDuplicateMatches(dups);
          setShowDuplicateModal(true);
          return;
        }
      } catch {}
    }

    await executeSave(items, zeroMode);
  };

  const handleSaveClick = () => {
    if (!Object.values(counted).some(Boolean)) {
      toast.error("Periksa produk atau tandai stok 0 terlebih dahulu");
      return;
    }
    doSave(false);
  };

  const visibleProducts = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return allProducts
      .map((product, idx) => ({ product, idx, isNew: idx >= products.length }))
      .filter(({ product }) => {
        if (q) {
          const matchesText =
            String(product?.productName || "").toLowerCase().includes(q) ||
            String(product?.sku || "").toLowerCase().includes(q) ||
            String(product?.batch || "").toLowerCase().includes(q) ||
            String(product?.barcode || "").toLowerCase().includes(q);
          if (!matchesText) return false;
        }
        const k = productKey(product.sku, product.batch);
        const isItemCounted = Boolean(counted[k]);

        if (activeTab === "pending") return !isItemCounted || expandedRowKey === k;
        if (activeTab === "completed") return isItemCounted;
        return true;
      });
  }, [allProducts, products.length, filterQuery, activeTab, counted, expandedRowKey]);

  const findRowElementByKey = (targetKey: string): HTMLElement | null => {
    const listEl = productListRef.current;
    if (!listEl) return null;
    const rows = Array.from(listEl.querySelectorAll<HTMLElement>("[data-product-key]"));
    return rows.find((el) => el.dataset.productKey === targetKey) || null;
  };

  const triggerRowFlash = (targetKey: string) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashRowKey(targetKey);
    flashTimerRef.current = setTimeout(() => setFlashRowKey(null), 1200);
  };

  const focusAndScrollRowByKey = (targetKey: string, focusInput = true) => {
    setTimeout(() => {
      const rowEl = findRowElementByKey(targetKey);
      if (rowEl) {
        scrollElementCenter(rowEl, { focusInput, select: true });
      }
    }, 90);
  };

  const handleFinishRowQty = (finishedKey?: string, explicit = true) => {
    let nextTargetKey: string | null = null;
    if (explicit && finishedKey) {
      const currentIdx = visibleProducts.findIndex(
        (item) => productKey(item.product.sku, item.product.batch) === finishedKey
      );
      if (currentIdx !== -1) {
        const tail = visibleProducts.slice(currentIdx + 1);
        const nextCandidate =
          tail.find(
            (item) => !counted[productKey(item.product.sku, item.product.batch)]
          ) || tail[0];
        if (nextCandidate) {
          nextTargetKey = productKey(
            nextCandidate.product.sku,
            nextCandidate.product.batch
          );
        }
      }
    }

    setExpandedRowKey(null);

    if (nextTargetKey) {
      const keyToScroll = nextTargetKey;
      setTimeout(() => {
        const nextRow = findRowElementByKey(keyToScroll);
        if (nextRow) {
          scrollElementCenter(nextRow, { focusInput: false });
          triggerRowFlash(keyToScroll);
        }
      }, 140);
    }
  };

  useEffect(() => {
    if (!draftReady || !user?.email || saveFinished.current) return;
    if (!hasUnsavedChanges) {
      latestDraft.current = null;
      try {
        removeDraft(user.email, location);
        setDraftError("");
      } catch {
        setDraftError("Draft lama belum dapat dihapus dari perangkat.");
      }
      return;
    }
    const draft: InputDraft = {
      version: 1,
      location,
      updatedAt: Date.now(),
      products,
      newProducts,
      quantities,
      formulas,
      counted,
      newProductForm,
      newProductFormula,
      showAddForm,
    };
    latestDraft.current = draft;
    try {
      saveDraft(user.email, draft);
      setDraftError("");
    } catch {
      setDraftError("Draft gagal disimpan di perangkat. Jangan tutup halaman sebelum menyimpan hasil.");
    }
  }, [
    draftReady,
    user?.email,
    location,
    products,
    newProducts,
    quantities,
    formulas,
    counted,
    newProductForm,
    newProductFormula,
    showAddForm,
    hasUnsavedChanges,
  ]);

  useEffect(() => {
    const flushDraft = () => {
      if (!user?.email || !latestDraft.current || saveFinished.current) return;
      try {
        saveDraft(user.email, latestDraft.current);
      } catch {}
    };
    window.addEventListener("pagehide", flushDraft);
    return () => {
      flushDraft();
      window.removeEventListener("pagehide", flushDraft);
    };
  }, [user?.email]);

  const handleBackClick = () => {
    if (hasUnsavedChanges) {
      setShowExitConfirm(true);
    } else {
      router.push("/scan");
    }
  };

  if (loading) {
    return <PageSkeleton />;
  }

  return (
    <div className="max-w-md mx-auto min-h-dvh flex flex-col bg-gradient-to-b from-[#D7F4F4] via-[#ECF9F9] to-[#F4FCFC] text-[#0D3B40] font-sans antialiased select-none pb-20 sm:border-x sm:border-[#8ADBD9]/65">
      {/* ============================================================== */}
      {/* 1. TOP HEADER & SEARCH PINNED (Sticky)                         */}
      {/* ============================================================== */}
      <div className="sticky top-0 z-30 shrink-0 shadow-subtle">
        <header>
          {/* Baris 1: Navigasi, Status Item & Menu Aksi (Frosted Aqua Pastel) */}
          <div className="min-h-[44px] px-2 py-1 bg-gradient-to-r from-[#D5F4F3]/95 via-[#E4F8F8]/95 to-[#EEFAFA]/95 backdrop-blur-md border-b border-[#8ADBD9]/65 flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1 min-w-0">
              <button
                type="button"
                onClick={handleBackClick}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-[#0D3B40] hover:bg-white/75 active:scale-[0.96] transition-transform shrink-0"
                aria-label="Kembali ke halaman scan"
                title="Kembali"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <span className="text-[13px] font-bold text-[#0D3B40] tracking-tight truncate">
                SO Central
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <div
                className="flex items-center gap-1 bg-white/85 border border-[#8ADBD9]/75 px-2 py-1 rounded-full font-mono text-[11px] font-semibold text-[#0D3B40] tabular-nums tnum"
                title={
                  draftError
                    ? draftError
                    : hasUnsavedChanges
                    ? "Draft tersimpan lokal di perangkat"
                    : online
                    ? "Online"
                    : "Offline"
                }
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    draftError
                      ? "bg-[#DC2626]"
                      : online
                      ? "bg-[#16A34A]"
                      : "bg-[#F59E0B]"
                  }`}
                />
                <span>
                  {countedCount}/{allProducts.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="h-8 px-2.5 bg-[#C7EEED] hover:bg-[#B4E6E5] border border-[#7AD3D2]/85 rounded-xl text-[11px] font-semibold text-[#0B666E] flex items-center gap-1 active:scale-[0.97] transition-all"
                title="Tambah Produk Baru ke Rak Ini"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                <span>Produk</span>
              </button>

              <button
                type="button"
                onClick={() => setShowActions(true)}
                aria-expanded={showActions}
                aria-label="Menu tindakan lokasi"
                className="w-8 h-8 bg-white/85 border border-[#8ADBD9]/75 hover:bg-white rounded-xl text-[#0D3B40] flex items-center justify-center active:scale-[0.96] transition-transform"
              >
                <MoreHorizontalIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Baris 2: Banner Kode Rak / Lokasi (Gradient Teal, Tanpa Truncate) */}
          <div className="px-3 py-1.5 bg-gradient-to-r from-[#0E838C] to-[#14B8A6] text-white flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A7F3D0] shrink-0" />
              <span className="text-[11px] font-semibold text-[#DCF7F6] uppercase tracking-wider shrink-0">
                LOKASI:
              </span>
              <span className="font-mono text-[13px] font-bold text-white tracking-wide break-words tnum">
                {location}
              </span>
            </div>

            <div className="text-[11px] font-mono text-[#DCF7F6] shrink-0 tnum">
              Total: <strong className="text-white font-bold">{totalItems}</strong> Pcs
            </div>
          </div>
        </header>

        {/* Banner Error Draft (Hanya tampil jika ada kendala storage) */}
        {draftError && (
          <div
            role="alert"
            className="bg-[#FEF2F2] border-b border-[#DC2626]/20 px-3 py-1 text-[11px] font-medium text-[#DC2626]"
          >
            {draftError}
          </div>
        )}

        {/* ============================================================== */}
        {/* 2. SEARCH & FILTER BAR                                         */}
        {/* ============================================================== */}
        <div className="bg-[#EEFBFB]/95 backdrop-blur-md border-b border-[#9BE0DF]/70 px-2.5 py-1.5 space-y-1.5">
          {/* Baris 1: Input pencarian + tombol kamera */}
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1 min-w-0 flex items-center">
              <SearchIcon className="w-3.5 h-3.5 text-[#487277] absolute left-3 pointer-events-none" />
              <input
                ref={searchInputRef}
                id="input-filter"
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Cari nama / scan SKU…"
                autoComplete="off"
                className="w-full h-9 pl-9 pr-9 bg-white border border-[#9CE0DF]/85 rounded-xl text-[13px] text-[#0D3B40] placeholder:text-[#6B9498] focus:outline-none focus:border-[#0E838C] focus:ring-2 focus:ring-[#14B8A6]/20 transition-colors"
              />
              {filterQuery && (
                <button
                  type="button"
                  onClick={() => setFilterQuery("")}
                  className="absolute right-0.5 w-8 h-8 flex items-center justify-center rounded-lg text-[#487277] hover:text-[#0D3B40]"
                  aria-label="Bersihkan pencarian"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setScannerMode("quick");
                setShowBarcodeScanner(true);
              }}
              className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-[#D5F4F3] border border-[#82D6D5]/80 hover:bg-[#C2ECEB] text-[#0B666E] active:scale-[0.97] transition-all"
              title="Scan Barcode"
              aria-label="Scan barcode dengan kamera"
            >
              <CameraIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Baris 2: Segmented filter tabs */}
          <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#D8F3F2] border border-[#9BE0DF]/65 rounded-xl text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`h-8 rounded-lg flex items-center justify-center gap-1 transition-all active:scale-[0.98] ${
                activeTab === "all"
                  ? "bg-white text-[#0D3B40] font-semibold shadow-subtle"
                  : "text-[#487277] hover:text-[#0D3B40]"
              }`}
            >
              <span>Semua</span>
              <span className="font-mono text-[11px] tabular-nums tnum">({allProducts.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("pending")}
              className={`h-8 rounded-lg flex items-center justify-center gap-1 transition-all active:scale-[0.98] ${
                activeTab === "pending"
                  ? "bg-white text-[#0D3B40] font-semibold shadow-subtle"
                  : "text-[#487277] hover:text-[#0D3B40]"
              }`}
            >
              <span>Belum</span>
              <span className="font-mono text-[11px] tabular-nums tnum">({pendingCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("completed")}
              className={`h-8 rounded-lg flex items-center justify-center gap-1 transition-all active:scale-[0.98] ${
                activeTab === "completed"
                  ? "bg-white text-[#16A34A] font-semibold shadow-subtle"
                  : "text-[#487277] hover:text-[#0D3B40]"
              }`}
            >
              <span>Selesai</span>
              <span className="font-mono text-[11px] tabular-nums tnum">({countedCount})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. PRODUCT LIST (Aqua Pastel Grouped Card for Compact HP)      */}
      {/* ============================================================== */}
      <div ref={productListRef} className="flex-1 px-2.5 pt-2">
        {allProducts.length === 0 ? (
          <div className="p-2">
            <EmptyState
              icon={<BoxIcon className="w-5 h-5" />}
              title="Belum ada produk di lokasi ini"
              description="Ketuk tombol + Produk di kanan atas atau Scan Barcode di bawah untuk menambahkan barang."
              action={
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="h-9 px-4 bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white rounded-xl font-semibold text-xs shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)] active:scale-[0.98] transition-all"
                >
                  + Tambah Produk
                </button>
              }
            />
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="py-12 px-5 bg-white rounded-2xl border border-[#9BE0DF]/75 shadow-subtle text-center">
            <p className="text-sm font-semibold text-[#0D3B40]">Tidak ada barang yang cocok</p>
            <p className="text-xs text-[#487277] mt-1 leading-relaxed">
              Ubah kata kunci pencarian atau pilih tab filter lainnya.
            </p>
            {(filterQuery || activeTab !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setFilterQuery("");
                  setActiveTab("all");
                }}
                className="mt-3 min-h-[44px] px-4 bg-[#EEFBFB] border border-[#9CE0DF]/80 hover:bg-[#D5F4F3] rounded-xl text-xs font-semibold text-[#0D3B40] active:scale-[0.98] transition-all"
              >
                Reset Filter
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-[#9BE0DF]/75 shadow-subtle overflow-hidden divide-y divide-[#9BE0DF]/40">
            {visibleProducts.map(({ product, idx, isNew }) => {
              const k = productKey(product.sku, product.batch);
              const isItemCounted = Boolean(counted[k]);
              const qty = quantities[k] ?? 0;
              const formula = formulas[k] || "";
              const isExpanded = expandedRowKey === k;
              const isBatchModalOpenForRow =
                batchModalTarget?.sku === product.sku &&
                batchModalTarget?.batch === product.batch &&
                batchModalTarget?.isNew === isNew;

              const rowBorderAndBg = !isItemCounted
                ? "bg-white border-l-4 border-l-[#9BE0DF]"
                : qty === 0
                ? "bg-[#FEF2F2]/40 border-l-4 border-l-[#DC2626]"
                : isNew
                ? "bg-[#FFFBEB]/45 border-l-4 border-l-[#D97706]"
                : "bg-[#ECFAF9]/75 border-l-4 border-l-[#16A34A]";

              const dotColor = !isItemCounted
                ? "bg-[#9BE0DF]"
                : qty === 0
                ? "bg-[#DC2626]"
                : isNew
                ? "bg-[#D97706]"
                : "bg-[#16A34A]";

              return (
                <div
                  key={`${product.sku}-${product.batch}-${idx}`}
                  data-product-idx={idx}
                  data-product-key={k}
                  data-count-status={isItemCounted ? "counted" : "uncounted"}
                  className={`${rowBorderAndBg} scroll-mt-[176px] scroll-mb-24 transition-all ${
                    flashRowKey === k ? "ring-2 ring-inset ring-[#0E838C] bg-[#D9F6F5]" : ""
                  }`}
                >
                  {/* Main Compact HP Row */}
                  <div className="px-3 py-2 flex items-center justify-between gap-2">
                    {/* Sisi Kiri: Info Barang */}
                    <div
                      className={`min-w-0 flex-1 pr-1 ${
                        !isItemCounted && !isExpanded ? "cursor-pointer" : ""
                      }`}
                      onClick={() => {
                        if (!isItemCounted && !isExpanded) {
                          handleOpenRowBatchPicker(product, isNew);
                        }
                      }}
                    >
                      {/* Baris 1: Nama Produk */}
                      <h3 className="text-[13px] font-semibold text-[#0D3B40] leading-snug break-words">
                        {product.productName}
                      </h3>

                      {/* Baris 2: Titik Status + SKU + Chip Batch + Rumus/Badge */}
                      <div className="flex items-center gap-1 mt-1 text-[11px] text-[#487277] leading-normal flex-wrap">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                        <span className="font-mono text-[11px] text-[#487277] tabular-nums tnum">
                          {product.sku}
                        </span>
                        <span className="text-[#487277]/45">•</span>

                        {/* Chip Batch/Lot — Membuka Pop-up Pilih Batch */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenRowBatchPicker(product, isNew);
                          }}
                          title="Klik untuk pilih / ubah Batch"
                          className={`h-6 px-2 rounded-lg font-mono text-[11px] font-semibold border transition-all active:scale-[0.97] flex items-center gap-1 ${
                            isBatchModalOpenForRow
                              ? "bg-gradient-to-r from-[#0E838C] to-[#14B8A6] text-white border-[#0E838C]"
                              : "bg-[#D5F4F3] text-[#0B666E] border-[#82D6D5]/75 hover:bg-[#C2ECEB]"
                          }`}
                        >
                          <span>{product.batch || "NO-BATCH"}</span>
                          <ChevronDownIcon className="w-3 h-3 opacity-75" />
                        </button>

                        {formula ? (
                          <>
                            <span className="text-[#487277]/45">•</span>
                            <span className="font-mono text-[11px] text-[#487277] font-semibold tnum">
                              ={formula}
                            </span>
                          </>
                        ) : null}

                        {isItemCounted && qty === 0 && (
                          <span className="font-mono text-[10px] font-semibold bg-[#FEF2F2] text-[#DC2626] px-1.5 py-0.5 rounded-md tnum">
                            STOK 0
                          </span>
                        )}
                        {isNew && (
                          <span className="font-mono text-[10px] font-semibold bg-[#FFFBEB] text-[#B45309] px-1.5 py-0.5 rounded-md">
                            BARU
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Sisi Kanan: Kuantitas / Tombol Buka Hitung */}
                    <div className="flex items-center shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (isExpanded) {
                            setExpandedRowKey(null);
                          } else if (!isItemCounted) {
                            handleOpenRowBatchPicker(product, isNew);
                          } else {
                            setExpandedRowKey(k);
                            focusAndScrollRowByKey(k, true);
                          }
                        }}
                        className={`h-8 px-2.5 rounded-lg font-mono text-[11px] font-bold border transition-all flex items-center justify-center gap-1 tabular-nums tnum shadow-subtle active:scale-[0.97] touch-manipulation ${
                          isItemCounted
                            ? "bg-[#D5F4F3] text-[#0B666E] border-[#7CD4D3]/85 hover:bg-[#C2ECEB]"
                            : "bg-[#EEFBFB] text-[#0D3B40] border-[#9CE0DF]/85 hover:bg-[#DCF6F5]"
                        }`}
                        title={
                          isItemCounted
                            ? `Kuantitas: ${qty} Pcs. Klik untuk buka kalkulator/opsi.`
                            : "Klik untuk pilih batch lalu input qty"
                        }
                      >
                        <span>{isItemCounted ? `${qty} Pcs` : "Hitung"}</span>
                        <ChevronDownIcon
                          className={`w-3.5 h-3.5 text-current opacity-70 transition-transform duration-150 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Inline Mini Drawer: Kalkulator Rumus + Tandai 0 + Reset + Hapus */}
                  {isExpanded && (
                    <div className="px-3 py-2.5 bg-[#EEFBFB] border-t border-[#9BE0DF]/55 space-y-2">
                      <QtyInput
                        wide
                        value={qty}
                        unfilled={!isItemCounted}
                        onChange={(v) => handleQuantityChange(k, v)}
                        onExprCommit={(expr) => handleExprCommit(k, expr)}
                        onFocus={() => scrollElementCenter(findRowElementByKey(k))}
                        onCommit={(explicit) => handleFinishRowQty(k, Boolean(explicit))}
                        ariaLabel={`Kalkulator kuantitas ${product.productName}`}
                      />
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              handleQuantityChange(k, 0);
                              handleFinishRowQty(k, true);
                            }}
                            className="h-8 px-2.5 bg-white border border-[#9CE0DF]/80 rounded-lg text-[11px] font-semibold text-[#0D3B40] hover:bg-[#D5F4F3]/60 active:scale-[0.98] transition-all"
                          >
                            Stok 0
                          </button>
                          {isItemCounted && (
                            <button
                              type="button"
                              onClick={() => {
                                setCounted((prev) => {
                                  const next = { ...prev };
                                  delete next[k];
                                  return next;
                                });
                                setQuantities((prev) => ({ ...prev, [k]: 0 }));
                                setFormulas((prev) => ({ ...prev, [k]: "" }));
                              }}
                              className="h-8 px-2.5 bg-white border border-[#9CE0DF]/80 rounded-lg text-[11px] font-semibold text-[#487277] hover:text-[#0D3B40] active:scale-[0.98] transition-all"
                            >
                              Reset Belum
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setExpandedRowKey(null);
                            handleDeleteProduct(product, isNew);
                          }}
                          className="h-8 px-2.5 bg-[#FEF2F2] border border-[#DC2626]/20 rounded-lg text-[11px] font-semibold text-[#DC2626] hover:bg-red-100/70 flex items-center gap-1 active:scale-[0.98] transition-transform"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                          <span>Hapus</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* 4. FIXED THUMB-ZONE BOTTOM ACTION DOCK                         */}
      {/* ============================================================== */}
      <footer className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-30 bg-gradient-to-t from-[#DAF4F4] via-[#E8F9F9]/95 to-[#F4FCFC]/95 backdrop-blur-md border-t border-[#8ADBD9]/75 shadow-bar px-2.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setScannerMode("quick");
            setShowBarcodeScanner(true);
          }}
          className="flex-[7] h-10 bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white font-semibold text-xs rounded-xl shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)] flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all duration-150 touch-manipulation"
        >
          <CameraIcon className="w-4 h-4" />
          <span>SCAN BARCODE</span>
        </button>

        <button
          type="button"
          onClick={handleSaveClick}
          disabled={saving || countedCount === 0}
          className="flex-[3] h-10 bg-[#16A34A] hover:bg-[#15803D] disabled:bg-[#D5EDED] disabled:text-[#5B8E92] disabled:shadow-none text-white font-semibold text-xs rounded-xl shadow-subtle flex items-center justify-center gap-1 active:scale-[0.98] transition-all duration-150 touch-manipulation"
        >
          <CheckIcon className="w-4 h-4" />
          <span>{saving ? "…" : "Submit"}</span>
        </button>
      </footer>

      {/* ============================================================== */}
      {/* ACTION SHEET MENU TINDAKAN LOKASI (Centered Modal)             */}
      {/* ============================================================== */}
      <Dialog
        isOpen={showActions}
        onClose={() => setShowActions(false)}
        title="Tindakan Lokasi"
        description={location}
        size="md"
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-[#487277] bg-[#EEFBFB] border border-[#9CE0DF]/75 rounded-xl px-3 py-2">
            <span>
              Total Kuantitas:{" "}
              <strong className="font-mono font-bold text-[#0D3B40] tnum">{totalItems} Pcs</strong>
            </span>
            <span>Operator: {user?.name?.split(" ")[0] || "—"}</span>
          </div>

          <button
            type="button"
            disabled={hasUnsavedChanges || !products.length}
            onClick={() => {
              setShowMoveModal(true);
              setShowActions(false);
            }}
            className="w-full h-10 px-3.5 rounded-xl border border-[#9CE0DF]/80 bg-white hover:bg-[#EEFBFB] text-xs font-semibold text-[#0D3B40] flex items-center justify-between active:scale-[0.98] transition-all disabled:opacity-40"
          >
            <span>⇄ Pindah ke Rak Lain</span>
            <ChevronDownIcon className="w-4 h-4 -rotate-90 text-[#487277]" />
          </button>

          <button
            type="button"
            disabled={!allProducts.length}
            onClick={() => {
              setShowZeroConfirm(true);
              setShowActions(false);
            }}
            className="w-full h-10 px-3.5 rounded-xl border border-[#DC2626]/20 bg-[#FEF2F2] hover:bg-red-100/70 text-xs font-semibold text-[#DC2626] flex items-center justify-between active:scale-[0.98] transition-all disabled:opacity-40"
          >
            <span>⊘ Set Semua Stok 0</span>
          </button>

          {hasUnsavedChanges && (
            <p className="text-[11px] text-[#B45309] bg-[#FFFBEB] border border-[#F59E0B]/25 rounded-xl px-3 py-1.5 leading-snug">
              * Simpan hitungan terlebih dahulu sebelum memindahkan produk.
            </p>
          )}
        </div>
      </Dialog>

      {/* ============================================================== */}
      {/* DIALOG TAMBAH PRODUK BARU KE LOKASI INI                        */}
      {/* ============================================================== */}
      <Dialog
        isOpen={showAddForm}
        onClose={handleCloseAddForm}
        title={`Tambah Produk — ${location}`}
      >
        <div className="space-y-3">
          {/* Barcode */}
          <Field
            id="add-barcode"
            label="Barcode (opsional)"
            hint="Pindai atau ketik lalu tekan Enter."
          >
            <div className="flex items-center gap-1.5">
              <input
                id="add-barcode"
                type="text"
                value={newProductForm.barcode}
                onChange={(e) =>
                  setNewProductForm({ ...newProductForm, barcode: e.target.value.trim() })
                }
                onKeyDown={(e) => {
                  const b = String(newProductForm.barcode || "").trim();
                  if (e.key === "Enter" && b) {
                    e.preventDefault();
                    setScannerMode("addForm");
                    handleBarcodeScan(b);
                  }
                }}
                className="flex-1 min-w-0 h-9 px-3 bg-[#EEFBFB] border border-[#9CE0DF]/80 rounded-xl font-mono text-[13px] text-[#0D3B40] placeholder:text-[#6B9498] focus:bg-white focus:outline-none focus:border-[#0E838C] focus:ring-2 focus:ring-[#14B8A6]/20"
                placeholder="Scan / ketik barcode…"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => {
                  const b = String(newProductForm.barcode || "").trim();
                  if (b) {
                    setScannerMode("addForm");
                    handleBarcodeScan(b);
                  }
                }}
                disabled={!String(newProductForm.barcode || "").trim() || scanningBarcode}
                className="w-9 h-9 shrink-0 rounded-xl bg-white border border-[#9CE0DF]/80 hover:bg-[#EEFBFB] flex items-center justify-center text-[#0D3B40] disabled:opacity-40 active:scale-[0.97] transition-all"
                aria-label="Cari barcode"
              >
                <SearchIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setScannerMode("addForm");
                  setShowBarcodeScanner(true);
                }}
                disabled={scanningBarcode}
                className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white flex items-center justify-center disabled:opacity-40 active:scale-[0.97] transition-all"
                aria-label="Pindai barcode dengan kamera"
              >
                <CameraIcon className="w-4 h-4" />
              </button>
            </div>
          </Field>

          {/* Nama Produk */}
          <Autocomplete<Product>
            id="add-product-name"
            label="Nama Produk"
            value={newProductForm.productName}
            onValueChange={(v) => setNewProductForm((prev) => ({ ...prev, productName: v }))}
            resolve={resolveProductNames}
            getKey={(p, i) => `${p.sku}-${i}`}
            renderItem={(p) => (
              <>
                <p className="font-semibold text-[#0D3B40] text-[13px] leading-snug">{p.productName}</p>
                <p className="font-mono text-[11px] text-[#487277] mt-0.5">
                  SKU: {p.sku}
                </p>
              </>
            )}
            onSelect={handleSelectSuggestion}
            placeholder="Ketik min. 2 huruf…"
            minChars={2}
            debounceMs={120}
            emptyText="Produk tidak ditemukan — isi manual"
          />

          {/* SKU & Nomor Batch (Pop-up Chip) */}
          <div className="grid grid-cols-2 gap-2">
            <Field id="add-sku" label="SKU" required>
              <input
                id="add-sku"
                type="text"
                value={newProductForm.sku}
                onChange={(e) =>
                  setNewProductForm({ ...newProductForm, sku: e.target.value })
                }
                className="w-full h-9 px-3 bg-[#EEFBFB] border border-[#9CE0DF]/80 rounded-xl font-mono text-[13px] font-semibold text-[#0D3B40] placeholder:text-[#6B9498] focus:bg-white focus:outline-none focus:border-[#0E838C] focus:ring-2 focus:ring-[#14B8A6]/20"
                placeholder="SKU…"
              />
            </Field>

            <Field id="add-batch" label="Nomor Batch" required>
              <button
                id="add-batch"
                type="button"
                onClick={() => setShowAddFormBatchModal(true)}
                className={`w-full h-9 px-3 rounded-xl border flex items-center justify-between gap-1 text-left transition-colors active:scale-[0.98] ${
                  newProductForm.batch.trim()
                    ? "bg-[#D5F4F3] border-[#7CD4D3] text-[#0B666E] font-mono text-xs font-semibold"
                    : "bg-[#EEFBFB] border-[#9CE0DF]/80 text-[#487277] text-xs font-medium hover:bg-white"
                }`}
              >
                <span className="truncate">
                  {newProductForm.batch.trim() || "Pilih Batch..."}
                </span>
                <ChevronDownIcon className="w-3.5 h-3.5 shrink-0 opacity-75" />
              </button>
            </Field>
          </div>

          {/* Qty Input */}
          <Field id="add-qty" label="Quantity" required>
            <div ref={addFormQtyRef} className="scroll-my-4">
              <QtyInput
                value={newProductForm.qty}
                onChange={(v) => setNewProductForm((prev) => ({ ...prev, qty: v }))}
                onExprCommit={(expr) => setNewProductFormula(expr)}
                onFocus={() => scrollElementCenter(addFormQtyRef.current)}
                wide
              />
            </div>
          </Field>

          <div className="pt-1.5 space-y-1.5">
            <button
              type="button"
              onClick={handleAddNewProduct}
              className="w-full h-10 bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white rounded-xl font-semibold text-xs shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)] active:scale-[0.98] transition-all"
            >
              Masukkan ke Hitungan Opname
            </button>

            <button
              type="button"
              disabled={savingMasterData}
              onClick={async () => {
                if (!newProductForm.productName || !newProductForm.sku) {
                  toast.error("Nama Produk dan SKU harus diisi");
                  return;
                }
                const batchValue = newProductForm.batch.trim();
                if (!batchValue) {
                  toast.error("Pilih nomor batch terlebih dahulu");
                  setShowAddFormBatchModal(true);
                  return;
                }
                const targetSku = newProductForm.sku.trim().toLowerCase();
                const targetBatch = batchValue.trim().toLowerCase();
                if (
                  [...products, ...newProducts].some(
                    (p) =>
                      p.sku.trim().toLowerCase() === targetSku &&
                      String(p.batch || "").trim().toLowerCase() === targetBatch
                  )
                ) {
                  toast.error(`SKU dan Batch ini sudah terdaftar di lokasi ${location}`);
                  return;
                }
                setSavingMasterData(true);
                try {
                  const result = await addMasterProductApi(
                    location,
                    newProductForm.productName,
                    newProductForm.sku,
                    batchValue,
                    newProductForm.barcode
                  );
                  if (result.success) {
                    const newProd: Product = {
                      productName: newProductForm.productName,
                      sku: newProductForm.sku,
                      batch: batchValue,
                      barcode: newProductForm.barcode || undefined,
                    };
                    setProducts((prev) => [...prev, newProd]);
                    if (
                      allProductsRef.current &&
                      !allProductsRef.current.some(
                        (p) =>
                          p.sku.trim().toLowerCase() === targetSku &&
                          String(p.batch || "").trim().toLowerCase() === targetBatch
                      )
                    ) {
                      allProductsRef.current.push(newProd);
                    }
                    setQuantities((prev) => ({
                      ...prev,
                      [productKey(newProd.sku, newProd.batch)]: 0,
                    }));
                    setNewProductForm({
                      productName: "",
                      sku: "",
                      batch: "",
                      barcode: "",
                      qty: 0,
                    });
                    setShowAddForm(false);
                    setNewProductFormula("");
                    toast.success("Produk tersimpan ke Master Data lokasi ini");
                  } else {
                    toast.error(result.message || "Gagal menyimpan");
                  }
                } catch {
                  toast.error("Gagal menambahkan ke Master Data");
                } finally {
                  setSavingMasterData(false);
                }
              }}
              className="w-full h-9 bg-[#EEFBFB] border border-[#9CE0DF]/80 text-[#0D3B40] rounded-xl font-semibold text-[11px] hover:bg-[#D5F4F3] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {savingMasterData ? "Menyimpan…" : "Simpan ke Master Data Saja (Tanpa Hitung)"}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Pop-up Pilih Batch (Model Chip) — untuk baris produk di lokasi */}
      <BatchPickerModal
        isOpen={Boolean(batchModalTarget)}
        onClose={() => setBatchModalTarget(null)}
        productName={batchModalTarget?.productName || ""}
        sku={batchModalTarget?.sku || ""}
        currentBatch={batchModalTarget?.batch || ""}
        batches={inlineBatchesForSku}
        onSelectBatch={(selectedBatch) => {
          if (!batchModalTarget) return;
          handleBatchSave(
            batchModalTarget.sku,
            batchModalTarget.batch,
            batchModalTarget.isNew,
            selectedBatch
          );
        }}
      />

      {/* Pop-up Pilih Batch (Model Chip) — untuk form Tambah Produk Baru */}
      <BatchPickerModal
        isOpen={showAddFormBatchModal}
        onClose={() => setShowAddFormBatchModal(false)}
        productName={newProductForm.productName || "Produk Baru"}
        sku={newProductForm.sku}
        currentBatch={newProductForm.batch}
        batches={batchesForSku}
        onSelectBatch={(selectedBatch) => {
          setNewProductForm((prev) => ({ ...prev, batch: selectedBatch }));
          setShowAddFormBatchModal(false);
          setTimeout(() => {
            scrollElementCenter(addFormQtyRef.current, { focusInput: true, select: true });
          }, 90);
        }}
      />

      {/* Konfirmasi keluar tanpa menyimpan */}
      <ConfirmModal
        isOpen={showExitConfirm}
        title="Keluar Tanpa Menyimpan?"
        message={`Hitungan lokasi ${location} belum dikirim. Draft akan tetap tersedia saat Anda kembali.`}
        confirmText="Simpan Draft & Kembali"
        cancelText="Tetap di Halaman"
        onConfirm={() => router.push("/scan")}
        onClose={() => setShowExitConfirm(false)}
      />

      {/* Konfirmasi simpan semua-nol */}
      <ConfirmModal
        isOpen={showZeroConfirm}
        title="Simpan dengan Semua Kuantitas Nol?"
        message={`Semua ${allProducts.length} produk di lokasi ${location} akan dicatat dengan kuantitas 0, termasuk produk yang belum diperiksa. Lanjutkan hanya jika seluruh stok sudah dipastikan kosong.`}
        confirmText="Ya, Semua 0"
        cancelText="Batal"
        onConfirm={() => doSave(true)}
        onClose={() => setShowZeroConfirm(false)}
      />

      {/* Sheet pindah lokasi */}
      <MoveSheet
        isOpen={showMoveModal}
        onClose={() => setShowMoveModal(false)}
        fromLocation={location}
        items={products.map((p) => ({
          sku: p.sku,
          batch: String(p.batch),
          productName: p.productName,
        }))}
        allowSelection
        onMoved={handleMoveProducts}
      />

      {/* Scanner modal */}
      <ScannerModal
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onScan={handleBarcodeScan}
        title="Pindai Barcode Produk / SKU"
      />

      {/* Modal Peringatan Duplikasi */}
      <DuplicateWarningModal
        isOpen={showDuplicateModal}
        location={location}
        duplicates={duplicateMatches}
        onConfirmOverwrite={() =>
          executeOverwrite(pendingItemsToSave, duplicateMatches, pendingZeroMode)
        }
        onConfirmAppend={() => executeSave(pendingItemsToSave, pendingZeroMode)}
        onCancel={() => {
          setShowDuplicateModal(false);
          setSaving(false);
        }}
        busy={saving}
      />
    </div>
  );
}

export default function InputPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InputPageContent />
    </Suspense>
  );
}
