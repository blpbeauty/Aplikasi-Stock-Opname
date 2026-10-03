"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDataSync } from "@/components/DataSyncProvider";
import { InputDraft, getDraft, saveDraft, removeDraft } from "@/lib/drafts";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import LoadingSpinner from "@/components/LoadingSpinner";
import ScannerModal from "@/components/ScannerModal";
import MoveSheet from "@/components/MoveSheet";
import QtyInput from "@/components/QtyInput";
import ConfirmModal from "@/components/ConfirmModal";
import { PageHeader, LocationBand, EmptyState, Field } from "@/components/ui";
import Autocomplete from "@/components/Autocomplete";
import {
  getProductsApi,
  saveStockOpnameApi,
  deleteProductApi,
  addMasterProductApi,
  lookupBarcodeApi,
  searchProductsApi,
  preloadHistory,
  getAllProductsApi,
  invalidateMemCache,
} from "@/lib/api";
import { Product, HistoryEntry } from "@/lib/types";
import { getCache, setCache, clearCache } from "@/lib/cache";
import {
  SearchIcon,
  CameraIcon,
  ChevronDownIcon,
  BoxIcon,
  TrashIcon,
  PencilIcon,
  CalculatorIcon,
  SwapIcon,
  PlusIcon,
} from "@/components/icons";
import toast from "react-hot-toast";

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
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  // Exit (unsaved changes) confirm modal state
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  // Semua-kuantitas-nol: simpan hanya lewat konfirmasi eksplisit
  const [showZeroConfirm, setShowZeroConfirm] = useState(false);

  const [newProductForm, setNewProductForm] = useState({
    productName: "",
    sku: "",
    batch: "",
    barcode: "",
    qty: 0,
  });
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [newProductFormula, setNewProductFormula] = useState("");
  const [savingMasterData, setSavingMasterData] = useState(false);

  // Inline batch editing
  const [editingBatchKey, setEditingBatchKey] = useState<string | null>(null);
  const [editingBatchValue, setEditingBatchValue] = useState("");
  const [editingBatchSku, setEditingBatchSku] = useState("");

  // Batch dropdown (add form)
  const [showBatchDropdown, setShowBatchDropdown] = useState(false);
  const batchDropdownRef = useRef<HTMLDivElement>(null);

  // Batch dropdown (inline edit)
  const [showInlineBatchDropdown, setShowInlineBatchDropdown] = useState(false);
  const inlineBatchDropdownRef = useRef<HTMLDivElement>(null);

  // Move location (shared MoveSheet)
  const [showMoveModal, setShowMoveModal] = useState(false);

  // Auto-scroll refs
  const addFormQtyRef = useRef<HTMLDivElement>(null);
  const productListRef = useRef<HTMLDivElement>(null);

  // Unique key per product row
  const productKey = (sku: string, batch: string) => `${sku}__${batch}`;
  const allProductsRef = useRef<Product[] | null>(null);

  const normalizeProduct = (p: any): Product => ({
    ...p,
    productName: String(p.productName ?? ""),
    sku: String(p.sku ?? ""),
    batch: String(p.batch ?? ""),
    barcode: String(p.barcode ?? ""),
  });

  // Get unique batches for current SKU
  const batchesForSku = useMemo(() => {
    const sku = newProductForm.sku.trim().toLowerCase();
    if (!sku) return [];
    const all = allProductsRef.current || [];
    const batchSet = new Set<string>();
    all.forEach((p) => {
      if (p.sku.trim().toLowerCase() === sku && p.batch) {
        batchSet.add(p.batch);
      }
    });
    products.forEach((p) => {
      if (p.sku.trim().toLowerCase() === sku && p.batch) {
        batchSet.add(p.batch);
      }
    });
    return Array.from(batchSet).sort();
  }, [newProductForm.sku, products]);

  const filteredBatches = useMemo(() => {
    const q = newProductForm.batch.trim().toLowerCase();
    if (!q) return batchesForSku;
    if (batchesForSku.some((b) => b.toLowerCase() === q)) return batchesForSku;
    return batchesForSku.filter((b) => b.toLowerCase().includes(q));
  }, [newProductForm.batch, batchesForSku]);

  // Batches for inline edit
  const inlineBatchesForSku = useMemo(() => {
    const sku = String(editingBatchSku || "").trim().toLowerCase();
    if (!sku) return [];
    const all = allProductsRef.current || [];
    const batchSet = new Set<string>();
    all.forEach((p) => {
      if (String(p.sku).trim().toLowerCase() === sku && p.batch) {
        batchSet.add(String(p.batch));
      }
    });
    [...products, ...newProducts].forEach((p) => {
      if (String(p.sku).trim().toLowerCase() === sku && p.batch) {
        batchSet.add(String(p.batch));
      }
    });
    return Array.from(batchSet).sort();
  }, [editingBatchSku, products, newProducts]);

  const inlineFilteredBatches = useMemo(() => {
    const q = editingBatchValue.trim().toLowerCase();
    if (!q) return inlineBatchesForSku;
    if (inlineBatchesForSku.some((b) => b.toLowerCase() === q)) return inlineBatchesForSku;
    return inlineBatchesForSku.filter((b) => b.toLowerCase().includes(q));
  }, [editingBatchValue, inlineBatchesForSku]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (batchDropdownRef.current && !batchDropdownRef.current.contains(e.target as Node)) {
        setShowBatchDropdown(false);
      }
      if (inlineBatchDropdownRef.current && !inlineBatchDropdownRef.current.contains(e.target as Node)) {
        setShowInlineBatchDropdown(false);
      }
    };
    if (showBatchDropdown || showInlineBatchDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showBatchDropdown, showInlineBatchDropdown]);

  useEffect(() => {
    if (!isReady) return;
    if (user?.email) preloadHistory(user.email, undefined, user?.name);
    const loadAllProducts = async () => {
      const cached = getCache<Product[]>("allProducts");
      if (cached && cached.age < 120) {
        allProductsRef.current = cached.data;
      }
      try {
        const result = await getAllProductsApi();
        if (result.success && result.products) {
          allProductsRef.current = result.products;
          setCache("allProducts", result.products);
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
    const draft = !ignoreDraft && user?.email ? getDraft(user.email, location) : null;
    if (draft) {
      setProducts(draft.products); setNewProducts(draft.newProducts);
      setQuantities(draft.quantities); setFormulas(draft.formulas); setCounted(draft.counted);
      setNewProductForm(draft.newProductForm); setNewProductFormula(draft.newProductFormula || "");
      setShowAddForm(draft.showAddForm); setDraftRestored(true); setDraftDirty(true);
      setLoading(false); setDraftReady(true);
      return;
    }
    setNewProducts([]); setCounted({}); setQuantities({}); setFormulas({}); setDraftDirty(false); setDraftRestored(false);
    setNewProductForm({ productName: "", sku: "", batch: "", barcode: "", qty: 0 }); setNewProductFormula("");
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
    setQuantities((prev) => ({ ...prev, [key]: qty }));
    setCounted(prev => ({ ...prev, [key]: true }));
  };

  const handleExprCommit = (key: string, expr: string) => {
    setFormulas((prev) => ({ ...prev, [key]: expr }));
  };

  /**
   * Hapus produk secara optimistic dengan Undo (8 detik).
   * Hapus ke server dilakukan LANGSUNG supaya Google Sheets selalu
   * sinkron bahkan bila aplikasi ditutup sesudahnya; "Urungkan"
   * membangun ulang baris server lewat addMasterProductApi.
   */
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
    setCounted(prev => { const next = { ...prev }; delete next[key]; return next; });
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
              if (rolledBack) return; // sudah dikembalikan oleh penanganan gagal
              restoreLocal();
              if (isNew) return;
              // Bila hapus server masih berjalan, tunggu dulu; setelah
              // berhasil, buat ulang barisnya di server.
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
    if (allProductsRef.current) {
      const filtered = allProductsRef.current
        .filter((p) => String(p.productName || "").toLowerCase().includes(q))
        .slice(0, 10);
      if (filtered.length > 0) return filtered;
    }
    try {
      const result = await searchProductsApi(query.trim());
      return result.success && result.products ? result.products : [];
    } catch {
      return [];
    }
  };

  const handleSelectSuggestion = (product: Product) => {
    setNewProductForm((prev) => ({
      ...prev,
      productName: product.productName,
      sku: product.sku,
      batch: product.batch,
      barcode: product.barcode || prev.barcode,
    }));
    setTimeout(() => {
      addFormQtyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  };

  const handleBarcodeScan = async (barcode: string) => {
    setShowBarcodeScanner(false);
    setScanningBarcode(true);
    try {
      const result = await lookupBarcodeApi(barcode);
      if (result.success && result.product) {
        setNewProductForm((prev) => ({
          ...prev,
          productName: result.product!.productName,
          sku: result.product!.sku,
          batch: result.product!.batch || "",
          barcode: barcode,
        }));
        setTimeout(() => {
          addFormQtyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 150);
      } else {
        setNewProductForm((prev) => ({ ...prev, barcode }));
        toast.error(result.message || "Produk tidak ditemukan, isi manual");
      }
    } catch {
      setNewProductForm((prev) => ({ ...prev, barcode }));
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
    if (newProductForm.qty <= 0) {
      toast.error("Quantity harus lebih dari 0");
      return;
    }

    // Batch mengikuti master data: SKU tanpa batch di master boleh
    // disimpan tanpa batch; satu batch di master terisi otomatis;
    // beberapa batch — operator wajib memilih.
    let batchValue = newProductForm.batch.trim();
    if (!batchValue) {
      if (batchesForSku.length === 1) batchValue = batchesForSku[0];
      else if (batchesForSku.length > 1) {
        toast.error("Produk ini punya beberapa batch di master — pilih salah satu");
        return;
      }
    }

    const all = [...products, ...newProducts];
    if (all.some((p) => p.sku === newProductForm.sku && p.batch === batchValue)) {
      toast.error("Produk dengan SKU dan Batch yang sama sudah ada");
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
    setCounted(prev => ({ ...prev, [nk]: true }));
    if (newProductFormula) {
      setFormulas((prev) => ({ ...prev, [nk]: newProductFormula }));
    }

    setNewProductForm({ productName: "", sku: "", batch: "", barcode: "", qty: 0 });
    setNewProductFormula("");
    setShowAddForm(false);
  };

  const handleBatchEdit = (key: string, currentBatch: string, sku: string) => {
    setEditingBatchKey(key);
    setEditingBatchValue(String(currentBatch));
    setEditingBatchSku(sku);
    setShowInlineBatchDropdown(true);
  };

  const handleBatchSave = (sku: string, oldBatch: string, isNew: boolean) => {
    const newBatch = editingBatchValue.trim();
    if (!newBatch) {
      toast.error("Batch tidak boleh kosong");
      return;
    }
    const all = [...products, ...newProducts];
    if (
      all.some(
        (p) => p.sku === sku && p.batch === newBatch && String(p.batch) !== oldBatch
      )
    ) {
      toast.error("Batch tersebut sudah dipakai SKU ini di lokasi");
      return;
    }
    setEditingBatchKey(null);
    setEditingBatchValue("");
    setEditingBatchSku("");
    setShowInlineBatchDropdown(false);
    if (newBatch === oldBatch) return;

    if (isNew) {
      setNewProducts((prev) =>
        prev.map((p) => (p.sku === sku && p.batch === oldBatch ? { ...p, batch: newBatch } : p))
      );
    } else {
      setProducts((prev) =>
        prev.map((p) => (p.sku === sku && p.batch === oldBatch ? { ...p, batch: newBatch } : p))
      );
    }

    const oldKey = productKey(sku, oldBatch);
    const newKey = productKey(sku, newBatch);
    setDraftDirty(true);
    if (oldKey !== newKey) {
      setCounted(prev => { const next = { ...prev }; if (next[oldKey]) next[newKey] = true; delete next[oldKey]; return next; });
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
  };

  const handleMoveProducts = () => {
    setShowMoveModal(false);
    // Refetch produk lokasi ini setelah MoveSheet menyelesaikan pemindahan.
    clearCache("products:");
    invalidateMemCache("getProducts");
    invalidateMemCache("getAllProducts");
    invalidateMemCache("getAllLocations");
    fetchProducts(true);
  };

  const doSave = async (zeroMode: boolean) => {
    if (saving) return;
    if (formHasContent) { setShowAddForm(true); toast.error("Masukkan produk dari form ke hitungan sebelum menyimpan hasil."); return; }

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
      ? [...products, ...newProducts].map((p) => buildItem(p, newProducts.includes(p)))
      : [...products, ...newProducts]
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

    setSaving(true);
    setShowZeroConfirm(false);
    const sessionId = `${user?.email}_${Date.now()}`;
    const timestamp = new Date().toISOString();

    // Leave the form only after the outbox and local history commit together.
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

    // Optimistic history cache so new entries appear immediately
    // (Google Sheets replication can lag a few seconds).
    // Stable client IDs are preserved by the server on first save and retry.
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
    // Mirror ke IndexedDB agar Riwayat (semua operator) langsung melihatnya


    if (typeof window !== "undefined") {
      window.localStorage.setItem("lastSaveTs", String(Date.now()));
      window.localStorage.setItem(`lastSaveLocation:${user?.email}`, location);
    }

    saveFinished.current = true;
    latestDraft.current = null;
    if (user?.email) {
      try { removeDraft(user.email, location); } catch { /* Queued save remains durable; draft can be removed later. */ }
    }
    invalidateMemCache("getHistory");
    clearCache("products:");
    toast.success(
      "Tersimpan di perangkat. Status pengiriman tersedia di indikator sinkronisasi."
    );
    router.push("/scan");
  };

  const handleSaveClick = () => {
    if (!Object.values(counted).some(Boolean)) { toast.error("Periksa produk atau tandai stok 0 terlebih dahulu"); return; }
    doSave(false);
  };

  const allProducts = [...products, ...newProducts];

  const visibleProducts = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return allProducts.map((product, idx) => ({ product, idx, isNew: idx >= products.length }));
    return allProducts
      .map((product, idx) => ({ product, idx, isNew: idx >= products.length }))
      .filter(
        ({ product }) =>
          product.productName.toLowerCase().includes(q) ||
          product.sku.toLowerCase().includes(q) ||
          String(product.batch).toLowerCase().includes(q)
      );
  }, [allProducts, products.length, filterQuery]);

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
        }, 200);
      }
    }
  };

  const totalItems = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);
  const countedCount = allProducts.filter(
    (p) => counted[productKey(p.sku, p.batch)]
  ).length;

  const formHasContent = !!(newProductForm.productName || newProductForm.sku || newProductForm.batch || newProductForm.barcode || newProductForm.qty || newProductFormula);
  const hasUnsavedChanges = countedCount > 0 || newProducts.length > 0 || formHasContent || draftDirty;

  useEffect(() => {
    if (!draftReady || !user?.email || saveFinished.current) return;
    if (!hasUnsavedChanges) {
      latestDraft.current = null;
      try { removeDraft(user.email, location); setDraftError(""); }
      catch { setDraftError("Draft lama belum dapat dihapus dari perangkat."); }
      return;
    }
    const draft: InputDraft = { version: 1, location, updatedAt: Date.now(), products, newProducts, quantities, formulas, counted, newProductForm, newProductFormula, showAddForm };
    latestDraft.current = draft;
    try { saveDraft(user.email, draft); setDraftError(""); }
    catch { setDraftError("Draft gagal disimpan di perangkat. Jangan tutup halaman sebelum menyimpan hasil."); }
  }, [draftReady, user?.email, location, products, newProducts, quantities, formulas, counted, newProductForm, newProductFormula, showAddForm, hasUnsavedChanges]);

  useEffect(() => {
    const flushDraft = () => {
      if (!user?.email || !latestDraft.current || saveFinished.current) return;
      try { saveDraft(user.email, latestDraft.current); } catch { /* The visible draft error explains a storage failure. */ }
    };
    window.addEventListener("pagehide", flushDraft);
    return () => { flushDraft(); window.removeEventListener("pagehide", flushDraft); };
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
      <div className="mobile-container flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="mobile-container pb-44">
      <PageHeader
        title="Input Hitung"
        subtitle={`Operator: ${user?.name?.split(" ")[0] || "—"}`}
        onBack={handleBackClick}
        backLabel="Kembali ke halaman scan"
      />

      <div className="px-4 sm:px-6 pt-3 space-y-4">
        {/* ── Location band: lokasi aktif selalu paling menonjol ── */}
        <LocationBand
          code={location}
          sub={`${countedCount}/${allProducts.length} produk sudah dihitung · total ${totalItems} item`}
        />

        <div role="status" className={`text-sm rounded-input px-3 py-2 border ${draftError ? 'bg-danger-bg text-danger border-danger/30' : 'bg-primary-pale border-primary/20'}`}>
          {draftError || (draftRestored ? 'Draft dipulihkan. Lanjutkan hitungan lalu simpan hasil.' : hasUnsavedChanges ? 'Draft tersimpan otomatis di perangkat. Belum dikirim.' : 'Produk yang belum diperiksa tidak ikut disimpan.')}
        </div>
        {/* ── Aksi sekunder ── */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            aria-expanded={showAddForm}
            className="flex-1 min-h-touch bg-surface-warm border border-border text-text-primary rounded-input font-bold text-meta flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
          >
            {showAddForm ? "Tutup Form" : (<><PlusIcon className="w-4 h-4" /> Tambah Produk</>)}
          </button>
          <button className="min-h-touch px-4 border border-border rounded-input font-bold text-sm" onClick={() => setShowActions(!showActions)} aria-expanded={showActions}>Tindakan</button>
        </div>

        {showActions && <div className="rounded-card bg-paper border border-border p-3 space-y-2">
          <button disabled={hasUnsavedChanges || !products.length} onClick={() => { setShowMoveModal(true); setShowActions(false); }} className="w-full min-h-touch text-left px-3 rounded-input border border-border disabled:opacity-50">Pindah produk ke lokasi lain</button>
          {hasUnsavedChanges && <p className="text-sm text-text-secondary">Simpan hitungan sebelum memindahkan produk.</p>}
          <button onClick={() => setShowZeroConfirm(true)} disabled={!allProducts.length} className="w-full min-h-touch text-left px-3 rounded-input border border-border disabled:opacity-50">Simpan semua stok 0</button>
        </div>}
        {/* ── Form Tambah Produk Baru ── */}
        {showAddForm && (
          <div className="bg-paper border border-border rounded-card p-4 shadow-card space-y-3.5">
            <h2 className="text-base2 font-bold text-text-primary">Tambah Produk ke Lokasi Ini</h2>

            {/* Barcode */}
            <Field
              id="add-barcode"
              label="Barcode (opsional)"
              hint="Pindai, atau ketik lalu tekan Enter untuk mencari produk."
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
                      handleBarcodeScan(b);
                    }
                  }}
                  className="w-full min-h-touch pl-3 pr-24 bg-surface-warm border border-border rounded-input text-meta font-semibold text-text-primary"
                  placeholder="Scan / ketik barcode…"
                  autoComplete="off"
                />
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const b = String(newProductForm.barcode || "").trim();
                      if (b) handleBarcodeScan(b);
                    }}
                    disabled={!String(newProductForm.barcode || "").trim() || scanningBarcode}
                    className="w-11 h-11 rounded-input bg-paper border border-border flex items-center justify-center text-primary disabled:opacity-50 active:scale-95 transition"
                    aria-label="Cari produk berdasarkan barcode"
                  >
                    <SearchIcon className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBarcodeScanner(true)}
                    disabled={scanningBarcode}
                    className="w-11 h-11 rounded-input bg-primary text-ivory flex items-center justify-center disabled:opacity-50 active:scale-95 transition"
                    aria-label="Pindai barcode dengan kamera"
                  >
                    <CameraIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Field>

            {/* Nama Produk dengan autocomplete */}
            <Autocomplete<Product>
              id="add-product-name"
              label="Nama Produk"
              value={newProductForm.productName}
              onValueChange={(v) => setNewProductForm((prev) => ({ ...prev, productName: v }))}
              resolve={resolveProductNames}
              getKey={(p, i) => `${p.sku}-${i}`}
              renderItem={(p) => (
                <>
                  <p className="font-bold text-text-primary text-meta">{p.productName}</p>
                  <p className="text-meta text-text-secondary">
                    SKU: {p.sku} | Batch: {p.batch}
                  </p>
                </>
              )}
              onSelect={handleSelectSuggestion}
              placeholder="Ketik min. 2 huruf…"
              minChars={2}
              debounceMs={120}
              emptyText="Produk tidak ditemukan — isi manual"
            />

            {/* SKU & Batch */}
            <div className="grid grid-cols-2 gap-3">
              <Field id="add-sku" label="SKU" required>
                <input
                  id="add-sku"
                  type="text"
                  value={newProductForm.sku}
                  onChange={(e) =>
                    setNewProductForm({ ...newProductForm, sku: e.target.value })
                  }
                  className="w-full min-h-touch px-3 bg-surface-warm border border-border rounded-input text-meta font-semibold text-text-primary"
                  placeholder="SKU…"
                />
              </Field>

              <Field
                id="add-batch"
                label="Batch"
                hint="Opsional — kosongkan bila produk tanpa batch di master."
              >
                <div className="relative" ref={batchDropdownRef}>
                  <input
                    id="add-batch"
                    type="text"
                    value={newProductForm.batch}
                    onChange={(e) => {
                      setNewProductForm({ ...newProductForm, batch: e.target.value });
                      setShowBatchDropdown(true);
                    }}
                    onFocus={() => {
                      if (newProductForm.sku.trim()) setShowBatchDropdown(true);
                    }}
                    className="w-full min-h-touch pl-3 pr-10 bg-surface-warm border border-border rounded-input text-meta font-semibold text-text-primary"
                    placeholder="Batch (opsional)…"
                  />
                  {batchesForSku.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowBatchDropdown(!showBatchDropdown)}
                      className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-text-secondary hover:text-primary active:scale-95 transition"
                      aria-label="Tampilkan pilihan batch"
                      aria-expanded={showBatchDropdown}
                    >
                      <ChevronDownIcon className="w-4 h-4" />
                    </button>
                  )}

                  {showBatchDropdown && newProductForm.sku.trim() && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-paper border border-border rounded-input shadow-card overflow-hidden max-h-36 overflow-y-auto">
                      {filteredBatches.length > 0 ? (
                        filteredBatches.map((batch) => (
                          <button
                            key={batch}
                            type="button"
                            onClick={() => {
                              setNewProductForm({ ...newProductForm, batch });
                              setShowBatchDropdown(false);
                            }}
                            className={`w-full min-h-touch text-left px-3 py-2 text-meta hover:bg-primary-pale border-b border-border-subtle last:border-b-0 ${
                              newProductForm.batch === batch ? "bg-primary-pale/60 text-primary font-bold" : ""
                            }`}
                          >
                            {batch}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-meta text-text-secondary">
                          Batch baru: “{newProductForm.batch.trim()}”
                        </div>
                      )}
                    </div>
                  )}
                </div>
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

            <div className="pt-1 space-y-2">
              <button
                type="button"
                onClick={handleAddNewProduct}
                className="w-full min-h-touch bg-primary text-ivory rounded-input font-bold text-meta active:scale-[0.98] transition"
              >
                Masukkan ke Hitungan Opname
              </button>

              <details className="border border-border rounded-input p-3">
                <summary className="min-h-touch flex items-center cursor-pointer font-bold text-sm">Tindakan lainnya</summary>
              <button
                type="button"
                onClick={async () => {
                  if (!newProductForm.productName || !newProductForm.sku) {
                    toast.error("Nama Produk dan SKU harus diisi");
                    return;
                  }
                  let batchValue = newProductForm.batch.trim();
                  if (!batchValue) {
                    if (batchesForSku.length === 1) batchValue = batchesForSku[0];
                    else if (batchesForSku.length > 1) {
                      toast.error("Produk ini punya beberapa batch di master — pilih salah satu");
                      return;
                    }
                  }
                  if (
                    (allProductsRef.current || []).some(
                      (p) => p.sku === newProductForm.sku && (p.batch || "") === batchValue
                    )
                  ) {
                    toast.error("SKU dan Batch ini sudah ada di Master Data");
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
                      setQuantities((prev) => ({
                        ...prev,
                        [productKey(newProd.sku, newProd.batch)]: 0,
                      }));
                      setNewProductForm({ productName: "", sku: "", batch: "", barcode: "", qty: 0 });
                      setShowAddForm(false);
                      setNewProductFormula("");
                      toast.success("Produk tersimpan di perangkat, menunggu sinkronisasi Master Data");
                    } else {
                      toast.error(result.message || "Gagal menyimpan");
                    }
                  } catch {
                    toast.error("Gagal menambahkan ke Master Data");
                  } finally {
                    setSavingMasterData(false);
                  }
                }}
                disabled={savingMasterData}
                className="w-full min-h-touch bg-surface-warm border border-border text-text-primary rounded-input font-bold text-meta active:scale-[0.98] transition disabled:opacity-50"
              >
                {savingMasterData ? "Menyimpan…" : "Simpan ke Master Data Saja"}
              </button>
              </details>
            </div>
          </div>
        )}

        {/* ── Filter produk dalam lokasi ── */}
        {allProducts.length > 6 && (
          <div className="relative">
            <label htmlFor="input-filter" className="sr-only">
              Filter produk dalam daftar
            </label>
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
            <input
              id="input-filter"
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter produk di lokasi ini…"
              className="w-full min-h-touch pl-9 pr-3 bg-surface-warm border border-border rounded-input text-meta font-semibold text-text-primary"
              autoComplete="off"
            />
          </div>
        )}

        {/* ── Daftar produk ── */}
        <div ref={productListRef} className="space-y-2.5">
          {allProducts.length === 0 ? (
            <EmptyState
              icon={<BoxIcon className="w-6 h-6" />}
              title="Belum ada produk di lokasi ini"
              description="Gunakan tombol Tambah Produk untuk memasukkan barang yang ada di rak."
              action={
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="min-h-touch px-5 bg-primary text-ivory rounded-input font-bold text-meta"
                >
                  + Tambah Produk
                </button>
              }
            />
          ) : visibleProducts.length === 0 ? (
            <EmptyState
              icon={<SearchIcon className="w-6 h-6" />}
              title="Tidak ada produk yang cocok"
              description={`Tidak ada produk yang cocok dengan “${filterQuery}”.`}
              action={
                <button
                  type="button"
                  onClick={() => setFilterQuery("")}
                  className="min-h-touch px-5 bg-surface-warm border border-border rounded-input font-bold text-meta"
                >
                  Bersihkan filter
                </button>
              }
            />
          ) : (
            visibleProducts.map(({ product, idx, isNew }) => {
              const k = productKey(product.sku, product.batch);
              const qty = quantities[k] || 0;
              const formula = formulas[k] || "";

              return (
                <div
                  key={`${product.sku}-${product.batch}-${idx}`}
                  data-product-idx={idx}
                  className={`bg-paper rounded-card border p-3.5 transition shadow-subtle ${
                    counted[k] ? "border-primary/50" : "border-border"
                  }`}
                >
                  {/* Baris 1: nama produk + tindakan sekunder */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-text-primary leading-snug break-words">
                        {product.productName}
                      </h3>
                      <p className="text-meta text-text-secondary mt-0.5 tnum">
                        SKU: <span className="font-semibold text-text-primary">{product.sku}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isNew && (
                        <span className="px-2 py-1 bg-amber-bg text-amber-text text-meta font-bold rounded-label">
                          Baru
                        </span>
                      )}
                      <details className="relative">
                        <summary className="min-h-touch px-3 flex items-center border border-border rounded-input cursor-pointer text-sm" aria-label={`Tindakan untuk ${product.productName}`}>Tindakan</summary>
                        <div className="absolute right-0 z-20 w-56 bg-paper border border-border rounded-input shadow-card p-1">
                          <button className="w-full min-h-touch text-left px-3 text-danger" onClick={() => handleDeleteProduct(product, isNew)}>Hapus produk</button>
                          <button className="w-full min-h-touch text-left px-3" onClick={() => {
                            setCounted(prev => { const next = { ...prev }; delete next[k]; return next; });
                            setQuantities(prev => ({ ...prev, [k]: 0 })); setFormulas(prev => ({ ...prev, [k]: '' }));
                          }}>Batalkan hitungan produk</button>
                        </div>
                      </details>
                    </div>
                  </div>

                  {/* Baris 2: batch (edit inline, aksi sekunder) */}
                  <div className="mb-2.5">
                    <div
                      className="relative inline-block"
                      ref={
                        editingBatchKey === `${isNew ? "new" : "exist"}-${product.sku}-${product.batch}`
                          ? inlineBatchDropdownRef
                          : undefined
                      }
                    >
                      {editingBatchKey === `${isNew ? "new" : "exist"}-${product.sku}-${product.batch}` ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editingBatchValue}
                            onChange={(e) => {
                              setEditingBatchValue(e.target.value);
                              setShowInlineBatchDropdown(true);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleBatchSave(product.sku, product.batch, isNew);
                              if (e.key === "Escape") setEditingBatchKey(null);
                            }}
                            aria-label={`Batch untuk ${product.productName}`}
                            className="w-32 min-h-touch px-2 bg-surface-warm border border-primary rounded-input text-meta font-bold text-text-primary"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleBatchSave(product.sku, product.batch, isNew)}
                            className="min-h-touch px-3 bg-primary text-ivory text-meta font-bold rounded-input"
                          >
                            Simpan
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            handleBatchEdit(
                              `${isNew ? "new" : "exist"}-${product.sku}-${product.batch}`,
                              product.batch,
                              product.sku
                            )
                          }
                          className="flex items-center gap-1.5 min-h-touch px-2.5 bg-surface-warm hover:bg-primary-pale rounded-label border border-border-subtle transition active:scale-95"
                          aria-label={`Edit batch ${product.batch} untuk ${product.productName}`}
                        >
                          <span className="text-meta text-text-secondary">
                            {product.batch ? "Batch:" : "Tanpa batch"}
                          </span>
                          {product.batch && (
                            <span className="text-meta font-bold text-text-primary">{product.batch}</span>
                          )}
                          <PencilIcon className="w-3.5 h-3.5 text-text-secondary" />
                        </button>
                      )}

                      {editingBatchKey === `${isNew ? "new" : "exist"}-${product.sku}-${product.batch}` &&
                        showInlineBatchDropdown &&
                        inlineBatchesForSku.length > 0 && (
                          <div className="absolute z-20 left-0 right-0 mt-1 bg-paper border border-border rounded-input shadow-card overflow-hidden max-h-36 overflow-y-auto">
                            {inlineFilteredBatches.length > 0 ? (
                              inlineFilteredBatches.map((batch) => (
                                <button
                                  key={batch}
                                  type="button"
                                  onClick={() => {
                                    setEditingBatchValue(batch);
                                    setShowInlineBatchDropdown(false);
                                    handleBatchSave(product.sku, product.batch, isNew);
                                  }}
                                  className={`w-full min-h-touch text-left px-3 py-2 text-meta hover:bg-primary-pale border-b border-border-subtle last:border-b-0 ${
                                    editingBatchValue === batch ? "bg-primary-pale/60 text-primary font-bold" : ""
                                  }`}
                                >
                                  {batch}
                                </button>
                              ))
                            ) : (
                              <div className="px-3 py-2 text-meta text-text-secondary">
                                Batch baru: “{editingBatchValue.trim()}”
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                    <span data-count-status={counted[k] ? 'counted' : 'uncounted'} className={`text-sm font-bold ${counted[k] ? 'text-primary' : 'text-text-secondary'}`}>
                      {counted[k] ? `Sudah dihitung: ${qty}` : 'Belum dihitung'}
                    </span>
                    {!counted[k] && <button className="min-h-touch px-3 border border-border rounded-input text-sm font-bold" onClick={() => handleQuantityChange(k, 0)}>Tandai stok 0</button>}
                  </div>
                  {/* Baris 3: kuantitas — fokus utama kartu */}
                  <div className="pt-2 border-t border-border-subtle">
                    <QtyInput
                      wide
                      value={qty}
                      unfilled={!counted[k]}
                      onChange={(v) => handleQuantityChange(k, v)}
                      onExprCommit={(expr) => handleExprCommit(k, expr)}
                      onCommit={() => scrollToNextProduct(idx)}
                      ariaLabel={`Kuantitas ${product.productName}, batch ${product.batch}`}
                    />
                    {formula && (
                      <p className="inline-flex items-center gap-1 text-meta text-amber-text font-bold mt-1.5">
                        <CalculatorIcon className="w-4 h-4" aria-hidden="true" /> Rumus: {formula}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Sticky save bar — di atas bottom nav, aman dari keyboard ── */}
      {!showAddForm && allProducts.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-30 pointer-events-none">
          <div className="max-w-[480px] mx-auto p-3 pointer-events-auto">
            <div className="bg-paper border border-border rounded-card p-2 shadow-card">
            <p className="text-sm text-center text-text-secondary mb-2">{countedCount}/{allProducts.length} produk diperiksa · {totalItems} item</p>
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={saving || countedCount === 0}
              className="w-full min-h-touch bg-primary text-ivory px-5 rounded-input font-bold text-base disabled:opacity-50 active:scale-[0.99] transition"
            >
              <span>{saving ? "Menyimpan…" : "Simpan Hasil Hitung"}</span>

            </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Konfirmasi keluar tanpa menyimpan ── */}
      <ConfirmModal
        isOpen={showExitConfirm}
        title="Keluar Tanpa Menyimpan?"
        message={`Hitungan lokasi ${location} belum dikirim. Draft akan tetap tersedia saat Anda kembali.`}
        confirmText="Simpan Draft & Kembali"
        cancelText="Tetap di Halaman"
        isDanger
        onConfirm={() => router.push("/scan")}
        onClose={() => setShowExitConfirm(false)}
      />

      {/* ── Konfirmasi simpan semua-nol ── */}
      <ConfirmModal
        isOpen={showZeroConfirm}
        title="Simpan dengan Semua Kuantitas Nol?"
        message={`Semua ${allProducts.length} produk di lokasi ${location} akan dicatat dengan kuantitas 0, termasuk produk yang belum diperiksa. Lanjutkan hanya jika seluruh stok sudah dipastikan kosong.`}
        confirmText="Ya, Semua 0"
        cancelText="Batal"
        onConfirm={() => doSave(true)}
        onClose={() => setShowZeroConfirm(false)}
      />

      {/* ── Sheet pindah lokasi (bersama) ── */}
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

      {/* ── Scanner modal ── */}
      <ScannerModal
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onScan={handleBarcodeScan}
        title="Pindai Barcode Produk"
      />

      <BottomNav activePage="scan" />
    </div>
  );
}

export default function InputPage() {
  return (
    <Suspense
      fallback={
        <div className="mobile-container flex items-center justify-center min-h-screen">
          <LoadingSpinner />
        </div>
      }
    >
      <InputPageContent />
    </Suspense>
  );
}
