"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDataSync } from "@/components/DataSyncProvider";
import { InputDraft, getDraft, saveDraft, removeDraft } from "@/lib/drafts";
import { useAuth } from "@/components/AuthProvider";
import LoadingSpinner from "@/components/LoadingSpinner";
import ScannerModal from "@/components/ScannerModal";
import MoveSheet from "@/components/MoveSheet";
import QtyInput, { calcExpr } from "@/components/QtyInput";
import ConfirmModal from "@/components/ConfirmModal";
import DuplicateWarningModal from "@/components/DuplicateWarningModal";
import BatchPickerModal from "@/components/BatchPickerModal";
import { Dialog, EmptyState, Field } from "@/components/ui";
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

  // Auto-scroll refs
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

  const resolveProductNames = async (query: string): Promise<Product[]> => {
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
  };

  const handleSelectSuggestion = (product: Product) => {
    setNewProductForm((prev) => ({
      ...prev,
      productName: product.productName,
      sku: product.sku,
      batch: "",
      barcode: product.barcode || prev.barcode,
    }));
    // Munculkan pop-up pilih batch (model chip) terlebih dahulu sebelum fokus ke input Qty
    setShowAddFormBatchModal(true);
  };

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
        setActiveTab("all");
        setFilterQuery("");
        handleOpenRowBatchPicker(matched, isNew);
        setTimeout(() => {
          const rowEl = productListRef.current?.querySelector(
            `[data-product-idx="${matchIdx}"]`
          ) as HTMLElement | null;
          rowEl?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
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
      toast.error("Produk dengan SKU dan Batch ini sudah ada di daftar. Silakan edit kuantitasnya langsung.");
      setShowAddForm(false);
      scrollToNextProduct(existingIndex - 1);
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
        setTimeout(() => {
          const rowEl = productListRef.current?.querySelector(
            `[data-product-key="${existingKey}"]`
          ) as HTMLElement | null;
          rowEl?.scrollIntoView({ behavior: "smooth", block: "center" });
          const qtyInput = rowEl?.querySelector('input[type="text"]') as HTMLInputElement | null;
          qtyInput?.focus();
          qtyInput?.select();
        }, 120);
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
    setTimeout(() => {
      const rowEl = productListRef.current?.querySelector(
        `[data-product-key="${targetKey}"]`
      ) as HTMLElement | null;
      rowEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const qtyInput = rowEl?.querySelector('input[type="text"]') as HTMLInputElement | null;
      qtyInput?.focus();
      qtyInput?.select();
    }, 120);
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
      .filter(({ product, isNew }) => {
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
        const qty = quantities[k] || 0;

        if (activeTab === "pending") return !isItemCounted;
        if (activeTab === "completed") return isItemCounted;
        return true;
      });
  }, [allProducts, products.length, filterQuery, activeTab, counted, quantities]);

  const handleFinishRowQty = () => {
    setExpandedRowKey(null);
  };

  const scrollToNextProduct = (currentGlobalIdx: number) => {
    const totalCount = allProducts.length;
    if (currentGlobalIdx < totalCount - 1) {
      const nextCard = productListRef.current?.querySelector(
        `[data-product-idx="${currentGlobalIdx + 1}"]`
      ) as HTMLElement | null;
      if (nextCard) {
        setTimeout(() => {
          nextCard.scrollIntoView({ behavior: "smooth", block: "center" });
          const nextInput = nextCard.querySelector('input[type="text"]') as HTMLInputElement | null;
          if (nextInput) nextInput.focus();
        }, 120);
      }
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
    return (
      <div className="max-w-md mx-auto h-dvh flex items-center justify-center bg-[#F8FAFC]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-dvh flex flex-col bg-[#F8FAFC] text-[#0F172A] font-sans antialiased select-none border-x border-slate-200">
      {/* ============================================================== */}
      {/* 1. COMPACT TOP HEADER (Tinggi ~46px, Sticky - Deep Teal)       */}
      {/* ============================================================== */}
      <header className="h-11 min-h-[46px] sticky top-0 bg-[#0D5C63] text-white border-b border-[#083B40] px-2.5 flex items-center justify-between gap-2 shrink-0 z-30">
        {/* Kiri: Back + Kode Lokasi Aktif */}
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={handleBackClick}
            className="w-8 h-8 flex items-center justify-center rounded text-white/90 hover:bg-white/10 active:bg-white/20 transition-colors shrink-0"
            aria-label="Kembali ke halaman scan"
            title="Kembali"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>

          <span
            className="font-mono text-xs font-bold bg-white/15 border border-white/25 text-white px-2 py-0.5 rounded tracking-wide truncate tnum"
            title={`Lokasi Aktif: ${location}`}
          >
            {location}
          </span>
        </div>

        {/* Kanan: Progress Counter + Status Jaringan + Menu Tindakan */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="font-mono text-xs font-bold text-white tabular-nums tnum">
            {countedCount}/{allProducts.length}{" "}
            <span className="font-sans text-[11px] font-medium text-teal-100/80">Item</span>
          </div>

          <span className="text-white/25">|</span>

          <div
            className="flex items-center gap-1 text-[11px] font-medium text-teal-100/90"
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
              className={`w-2 h-2 rounded-full shrink-0 ${
                draftError
                  ? "bg-red-400"
                  : online
                  ? "bg-[#4ADE80]"
                  : "bg-[#FBBF24]"
              }`}
            />
            <span className="hidden xs:inline truncate max-w-[70px]">
              {hasUnsavedChanges ? "Tersimpan" : online ? "Online" : "Offline"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="h-7 px-2 bg-white/15 hover:bg-white/25 active:bg-white/30 border border-white/25 rounded text-[11px] font-semibold text-white flex items-center gap-1 transition-colors"
            title="Tambah Produk Baru ke Rak Ini"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span>Produk</span>
          </button>

          <button
            type="button"
            onClick={() => setShowActions(!showActions)}
            aria-expanded={showActions}
            aria-label="Menu tindakan lokasi"
            className="w-7 h-7 bg-white/15 hover:bg-white/25 active:bg-white/30 border border-white/25 rounded text-xs font-bold text-white flex items-center justify-center transition-colors"
          >
            ⋯
          </button>
        </div>
      </header>

      {/* Dropdown Tindakan Cepat Lokasi */}
      {showActions && (
        <div className="bg-white border-b border-slate-300 px-3 py-2 space-y-1.5 shrink-0 z-30 text-xs">
          <div className="flex items-center justify-between text-[11px] text-slate-500 pb-1 border-b border-slate-100">
            <span>
              Total Kuantitas:{" "}
              <strong className="font-mono font-bold text-slate-900 tnum">{totalItems} Pcs</strong>
            </span>
            <span>Operator: {user?.name?.split(" ")[0] || "—"}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <button
              type="button"
              disabled={hasUnsavedChanges || !products.length}
              onClick={() => {
                setShowMoveModal(true);
                setShowActions(false);
              }}
              className="h-8 px-2.5 rounded border border-slate-300 bg-slate-50 font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-40 text-left truncate"
            >
              ⇄ Pindah ke Rak Lain
            </button>
            <button
              type="button"
              disabled={!allProducts.length}
              onClick={() => {
                setShowZeroConfirm(true);
                setShowActions(false);
              }}
              className="h-8 px-2.5 rounded border border-red-200 bg-red-50 font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40 text-left truncate"
            >
              ⊘ Set Semua Stok 0
            </button>
          </div>
          {hasUnsavedChanges && (
            <p className="text-[11px] text-amber-700">
              * Simpan hitungan terlebih dahulu sebelum memindahkan produk.
            </p>
          )}
        </div>
      )}

      {/* Banner Error Draft (Hanya tampil jika ada kendala storage) */}
      {draftError && (
        <div
          role="alert"
          className="bg-red-50 border-b border-red-200 px-3 py-1 text-[11px] font-medium text-red-700 shrink-0"
        >
          {draftError}
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. SEARCH & FILTER BAR PADAT (Tinggi ~80px, Sticky)            */}
      {/* ============================================================== */}
      <div className="bg-white border-b border-slate-200 px-3 py-2 space-y-1.5 shrink-0 z-20 sticky top-11">
        {/* Baris 1: Input pencarian tipis (h-9 text-sm) + tombol kamera di dalamnya */}
        <div className="relative flex items-center">
          <SearchIcon className="w-4 h-4 text-slate-400 absolute left-2.5 pointer-events-none" />
          <input
            ref={searchInputRef}
            id="input-filter"
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Cari nama / scan SKU..."
            autoComplete="off"
            className="w-full h-9 pl-8 pr-16 bg-slate-50 border border-slate-300 rounded text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-slate-900 transition-colors"
          />
          {filterQuery && (
            <button
              type="button"
              onClick={() => setFilterQuery("")}
              className="absolute right-9 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-700 text-xs font-mono"
              aria-label="Bersihkan pencarian"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setScannerMode("quick");
              setShowBarcodeScanner(true);
            }}
            className="absolute right-1.5 w-7 h-7 flex items-center justify-center rounded bg-slate-200/80 hover:bg-slate-300 text-slate-700 active:bg-slate-400 transition-colors"
            title="Scan Barcode"
            aria-label="Scan barcode dengan kamera"
          >
            <CameraIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Baris 2: Segmented filter tabs ukuran compact (h-7 text-xs font-medium - 3 Kolom) */}
        <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-100 rounded h-7 items-center text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`h-6 rounded flex items-center justify-center gap-1 transition-colors ${
              activeTab === "all"
                ? "bg-white text-slate-900 font-semibold shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>Semua</span>
            <span className="font-mono text-[11px] tabular-nums tnum">({allProducts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={`h-6 rounded flex items-center justify-center gap-1 transition-colors ${
              activeTab === "pending"
                ? "bg-white text-slate-900 font-semibold shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>Belum</span>
            <span className="font-mono text-[11px] tabular-nums tnum">({pendingCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("completed")}
            className={`h-6 rounded flex items-center justify-center gap-1 transition-colors ${
              activeTab === "completed"
                ? "bg-white text-[#16A34A] font-semibold shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>Selesai</span>
            <span className="font-mono text-[11px] tabular-nums tnum">({countedCount})</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. DENSE ITEM LIST (Flexible Height - Follows Items)           */}
      {/* ============================================================== */}
      <div
        ref={productListRef}
        className="divide-y divide-slate-200 bg-[#F8FAFC]"
      >
        {allProducts.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<BoxIcon className="w-6 h-6" />}
              title="Belum ada produk di lokasi ini"
              description="Ketuk tombol + Produk di kanan atas atau Scan Barcode di bawah untuk menambahkan barang."
              action={
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="h-9 px-4 bg-[#0D5C63] hover:bg-[#14727A] text-white rounded font-semibold text-xs"
                >
                  + Tambah Produk
                </button>
              }
            />
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <p className="text-sm font-semibold text-slate-700">Tidak ada barang yang cocok</p>
            <p className="text-xs text-slate-500 mt-1">
              Ubah kata kunci pencarian atau pilih tab filter lainnya.
            </p>
            {(filterQuery || activeTab !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setFilterQuery("");
                  setActiveTab("all");
                }}
                className="mt-3 h-8 px-3 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700"
              >
                Reset Filter
              </button>
            )}
          </div>
        ) : (
          visibleProducts.map(({ product, idx, isNew }) => {
            const k = productKey(product.sku, product.batch);
            const isItemCounted = Boolean(counted[k]);
            const qty = quantities[k] ?? 0;
            const formula = formulas[k] || "";
            const isExpanded = expandedRowKey === k;
            const isBatchModalOpenForRow =
              batchModalTarget?.sku === product.sku &&
              batchModalTarget?.batch === product.batch &&
              batchModalTarget?.isNew === isNew;

            // Status visual sesuai palet High Contrast Light Mode:
            // - Belum dihitung: bg-white + border-l-4 #CBD5E1
            // - Sudah dihitung (>0): bg-slate-100/70 + border-l-4 #16A34A
            // - Selisih / Stok 0 / Baru: bg-slate-100/70 + border-l-4 #D97706 / #DC2626
            const rowBorderAndBg = !isItemCounted
              ? "bg-white border-l-4 border-l-[#CBD5E1]"
              : qty === 0
              ? "bg-slate-100/70 border-l-4 border-l-[#DC2626]"
              : isNew
              ? "bg-slate-100/70 border-l-4 border-l-[#D97706]"
              : "bg-slate-100/70 border-l-4 border-l-[#16A34A]";

            const dotColor = !isItemCounted
              ? "bg-[#CBD5E1]"
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
                className={`${rowBorderAndBg} transition-colors`}
              >
                {/* Main Compact Row (~58px) */}
                <div className="px-3 py-2 flex items-center justify-between gap-2 min-h-[58px]">
                  {/* Sisi Kiri: Info Barang */}
                  <div
                    className={`min-w-0 flex-1 pr-1.5 ${
                      !isItemCounted && !isExpanded ? "cursor-pointer" : ""
                    }`}
                    onClick={() => {
                      if (!isItemCounted && !isExpanded) {
                        handleOpenRowBatchPicker(product, isNew);
                      }
                    }}
                  >
                    {/* Baris 1: Nama Produk Utama di Atas */}
                    <h3 className="text-sm font-semibold text-[#0F172A] leading-tight break-words">
                      {product.productName}
                    </h3>

                    {/* Baris 2: Titik Status + SKU + Model Chip Batch + Rumus jika ada */}
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-[#475569] leading-none flex-wrap">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                      <span className="font-mono text-xs text-[#475569] tabular-nums tnum">
                        {product.sku}
                      </span>
                      <span className="text-slate-300">•</span>

                      {/* Chip Batch/Lot — Membuka Pop-up Pilih Batch */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenRowBatchPicker(product, isNew);
                        }}
                        title="Klik untuk pilih / ubah Batch"
                        className={`h-5 px-1.5 rounded font-mono text-[11px] font-semibold border transition flex items-center gap-1 ${
                          isBatchModalOpenForRow
                            ? "bg-[#0D5C63] text-white border-[#0D5C63]"
                            : "bg-[#E6F3F4] text-[#0D5C63] border-[#A8D3D6] hover:bg-[#D0EBED]"
                        }`}
                      >
                        <span>{product.batch || "NO-BATCH"}</span>
                        <ChevronDownIcon className="w-3 h-3 opacity-70" />
                      </button>

                      {formula ? (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="font-mono text-[11px] text-slate-600 font-semibold tnum">
                            ={formula}
                          </span>
                        </>
                      ) : null}

                      {isItemCounted && qty === 0 && (
                        <span className="font-mono text-[10px] font-bold bg-red-100 text-[#DC2626] px-1 py-0.5 rounded tnum">
                          STOK 0
                        </span>
                      )}
                      {isNew && (
                        <span className="font-mono text-[10px] font-bold bg-amber-100 text-[#D97706] px-1 py-0.5 rounded">
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
                          // Belum dihitung: munculkan Pop-up Pilih Batch (Chip) terlebih dahulu sebelum input Qty
                          handleOpenRowBatchPicker(product, isNew);
                        } else {
                          setExpandedRowKey(k);
                        }
                      }}
                      className={`h-8 px-2.5 rounded font-mono text-xs font-bold border transition flex items-center justify-center gap-1 tabular-nums tnum shadow-sm active:scale-95 touch-manipulation ${
                        isItemCounted
                          ? "bg-[#E6F3F4] text-[#0D5C63] border-[#A8D3D6] hover:bg-[#D0EBED]"
                          : "bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200"
                      }`}
                      title={
                        isItemCounted
                          ? `Kuantitas: ${qty} Pcs. Klik untuk buka kalkulator/opsi.`
                          : "Klik untuk pilih batch lalu input qty"
                      }
                    >
                      <span>{isItemCounted ? `${qty} Pcs` : "Hitung"}</span>
                      <ChevronDownIcon
                        className={`w-3.5 h-3.5 text-current opacity-70 transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Inline Mini Drawer: Kalkulator Rumus + Tandai 0 + Reset + Hapus */}
                {isExpanded && (
                  <div className="px-3 py-2 bg-slate-100/90 border-t border-slate-200 space-y-2">
                    <QtyInput
                      wide
                      value={qty}
                      unfilled={!isItemCounted}
                      onChange={(v) => handleQuantityChange(k, v)}
                      onExprCommit={(expr) => handleExprCommit(k, expr)}
                      onCommit={handleFinishRowQty}
                      ariaLabel={`Kalkulator kuantitas ${product.productName}`}
                    />
                    <div className="flex items-center justify-between gap-1.5 pt-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            handleQuantityChange(k, 0);
                            handleFinishRowQty();
                          }}
                          className="h-7 px-2.5 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50"
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
                            className="h-7 px-2.5 bg-white border border-slate-300 rounded text-xs font-medium text-slate-600 hover:bg-slate-50"
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
                        className="h-7 px-2.5 bg-red-50 border border-red-200 rounded text-xs font-semibold text-red-700 hover:bg-red-100 flex items-center gap-1"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ============================================================== */}
      {/* 4. BOTTOM ACTION DOCK (Flexible directly under product items)  */}
      {/* ============================================================== */}
      <footer className="mt-3 mb-8 bg-white border-y border-slate-200 px-3 py-2 flex items-center gap-2 shrink-0 z-30 shadow-sm">
        {/* Tombol Utama (70% lebar): [ 📷 SCAN BARCODE ] */}
        <button
          type="button"
          onClick={() => {
            setScannerMode("quick");
            setShowBarcodeScanner(true);
          }}
          className="w-[70%] h-10 bg-[#0D5C63] hover:bg-[#14727A] active:bg-[#083B40] text-white font-semibold text-sm rounded flex items-center justify-center gap-2 transition-colors touch-manipulation"
        >
          <CameraIcon className="w-4 h-4" />
          <span>SCAN BARCODE</span>
        </button>

        {/* Tombol Sekunder (30% lebar): [ ✓ Submit ] */}
        <button
          type="button"
          onClick={handleSaveClick}
          disabled={saving || countedCount === 0}
          className="w-[30%] h-10 bg-[#16A34A] hover:bg-[#15803D] active:bg-[#166534] disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm rounded flex items-center justify-center gap-1.5 transition-colors touch-manipulation"
        >
          <CheckIcon className="w-4 h-4" />
          <span>{saving ? "..." : "Submit"}</span>
        </button>
      </footer>

      {/* ============================================================== */}
      {/* DIALOG TAMBAH PRODUK BARU KE LOKASI INI                        */}
      {/* ============================================================== */}
      <Dialog
        isOpen={showAddForm}
        onClose={() => setShowAddForm(false)}
        title={`Tambah Produk — ${location}`}
      >
        <div className="space-y-3">
          {/* Barcode */}
          <Field
            id="add-barcode"
            label="Barcode (opsional)"
            hint="Pindai atau ketik lalu tekan Enter."
          >
            <div className="relative flex items-center">
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
                className="w-full h-10 pl-3 pr-20 bg-slate-50 border border-slate-300 rounded font-mono text-sm text-slate-900"
                placeholder="Scan / ketik barcode…"
                autoComplete="off"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
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
                  className="w-8 h-8 rounded bg-white border border-slate-300 flex items-center justify-center text-slate-700 disabled:opacity-40"
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
                  className="w-8 h-8 rounded bg-[#0D5C63] hover:bg-[#14727A] text-white flex items-center justify-center disabled:opacity-40"
                  aria-label="Pindai barcode dengan kamera"
                >
                  <CameraIcon className="w-4 h-4" />
                </button>
              </div>
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
                <p className="font-semibold text-slate-900 text-sm">{p.productName}</p>
                <p className="font-mono text-xs text-slate-500">
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
          <div className="grid grid-cols-2 gap-2.5">
            <Field id="add-sku" label="SKU" required>
              <input
                id="add-sku"
                type="text"
                value={newProductForm.sku}
                onChange={(e) =>
                  setNewProductForm({ ...newProductForm, sku: e.target.value })
                }
                className="w-full h-10 px-3 bg-slate-50 border border-slate-300 rounded font-mono text-sm font-semibold text-slate-900"
                placeholder="SKU…"
              />
            </Field>

            <Field id="add-batch" label="Nomor Batch" required>
              <button
                id="add-batch"
                type="button"
                onClick={() => setShowAddFormBatchModal(true)}
                className={`w-full h-10 px-3 rounded border flex items-center justify-between gap-1.5 text-left transition ${
                  newProductForm.batch.trim()
                    ? "bg-[#E6F3F4] border-[#0D5C63] text-[#0D5C63] font-mono text-sm font-bold"
                    : "bg-slate-50 border-slate-300 text-slate-500 text-xs font-medium hover:bg-slate-100"
                }`}
              >
                <span className="truncate">
                  {newProductForm.batch.trim() || "Pilih Batch..."}
                </span>
                <ChevronDownIcon className="w-4 h-4 shrink-0 opacity-75" />
              </button>
            </Field>
          </div>

          {/* Qty Input */}
          <Field id="add-qty" label="Quantity" required>
            <div ref={addFormQtyRef}>
              <QtyInput
                value={newProductForm.qty}
                onChange={(v) => setNewProductForm((prev) => ({ ...prev, qty: v }))}
                onExprCommit={(expr) => setNewProductFormula(expr)}
                wide
              />
            </div>
          </Field>

          <div className="pt-2 space-y-2">
            <button
              type="button"
              onClick={handleAddNewProduct}
              className="w-full h-10 bg-[#0D5C63] hover:bg-[#14727A] text-white rounded font-semibold text-sm active:bg-[#083B40] transition-colors"
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
              className="w-full h-9 bg-slate-100 border border-slate-300 text-slate-800 rounded font-semibold text-xs hover:bg-slate-200 disabled:opacity-50"
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
            addFormQtyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            const qtyInput = addFormQtyRef.current?.querySelector(
              'input[type="text"]'
            ) as HTMLInputElement | null;
            qtyInput?.focus();
            qtyInput?.select();
          }, 120);
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
    <Suspense
      fallback={
        <div className="max-w-md mx-auto h-dvh flex items-center justify-center bg-[#F8FAFC]">
          <LoadingSpinner />
        </div>
      }
    >
      <InputPageContent />
    </Suspense>
  );
}
