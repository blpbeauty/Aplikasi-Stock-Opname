"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import LoadingSpinner from "@/components/LoadingSpinner";
import ScannerModal from "@/components/ScannerModal";
import MoveSheet from "@/components/MoveSheet";
import QtyInput from "@/components/QtyInput";
import ConfirmModal from "@/components/ConfirmModal";
import { PageHeader, LocationBand, EmptyState, Field, IconButton } from "@/components/ui";
import Autocomplete from "@/components/Autocomplete";
import {
  getProductsApi,
  saveStockOpnameApi,
  deleteProductApi,
  addMasterProductApi,
  lookupBarcodeApi,
  searchProductsApi,
  warmupCacheApi,
  preloadHistory,
  getAllProductsApi,
  invalidateMemCache,
} from "@/lib/api";
import { Product, HistoryEntry } from "@/lib/types";
import { getCache, setCache, clearCache } from "@/lib/cache";
import { addHistoryEntryLocal } from "@/lib/localDb";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const location = searchParams.get("location") || "";

  const [products, setProducts] = useState<Product[]>([]);
  const [newProducts, setNewProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
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
    warmupCacheApi().catch(() => {});
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
  }, [user]);

  useEffect(() => {
    if (!location) {
      router.push("/scan");
      return;
    }
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, router]);

  const fetchProducts = async () => {
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
    }
  };

  const handleQuantityChange = (key: string, qty: number) => {
    setQuantities((prev) => ({ ...prev, [key]: qty }));
  };

  const handleExprCommit = (key: string, expr: string) => {
    setFormulas((prev) => ({ ...prev, [key]: expr }));
  };

  /**
   * Hapus produk secara optimistic dengan Undo (8 detik).
   * Server baru dipanggil setelah jendela undo berlalu, sehingga
   * "Urungkan" tidak perlu mengembalikan data ke server.
   */
  const handleDeleteProduct = (product: Product, isNew: boolean) => {
    const key = productKey(product.sku, product.batch);
    const prevProducts = [...products];
    const prevNewProducts = [...newProducts];
    const prevQuantities = { ...quantities };
    const prevFormulas = { ...formulas };

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
      setCache(ck, prevProducts);
    };

    const undoState = { cancelled: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    toast(
      (t) => (
        <span className="flex items-center gap-3 min-w-0">
          <span className="min-w-0 truncate">Dihapus: {product.productName}</span>
          <button
            type="button"
            onClick={() => {
              undoState.cancelled = true;
              clearTimeout(timer);
              restoreLocal();
              toast.dismiss(t.id);
            }}
            className="shrink-0 font-bold text-primary underline underline-offset-2"
          >
            Urungkan
          </button>
        </span>
      ),
      { duration: 8000 }
    );

    if (isNew) return;

    timer = setTimeout(async () => {
      if (undoState.cancelled) return;
      try {
        const result = await deleteProductApi(location, product.sku, product.batch);
        if (!result.success) {
          restoreLocal();
          toast.error(result.message || "Gagal menghapus, data dikembalikan");
        }
      } catch {
        restoreLocal();
        toast.error("Gagal menghapus, data dikembalikan");
      }
    }, 8000);
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
    if (!newProductForm.productName || !newProductForm.sku || !newProductForm.batch) {
      toast.error("Nama Produk, SKU, dan Batch harus diisi");
      return;
    }
    if (newProductForm.qty <= 0) {
      toast.error("Quantity harus lebih dari 0");
      return;
    }

    const all = [...products, ...newProducts];
    if (all.some((p) => p.sku === newProductForm.sku && p.batch === newProductForm.batch)) {
      toast.error("Produk dengan SKU dan Batch yang sama sudah ada");
      return;
    }

    const newProduct: Product = {
      productName: newProductForm.productName,
      sku: newProductForm.sku,
      batch: newProductForm.batch,
      barcode: newProductForm.barcode || undefined,
    };

    setNewProducts((prev) => [...prev, newProduct]);
    const nk = productKey(newProduct.sku, newProduct.batch);
    setQuantities((prev) => ({ ...prev, [nk]: newProductForm.qty }));
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
    if (oldKey !== newKey) {
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
    fetchProducts();
  };

  const doSave = async (zeroMode: boolean) => {
    if (saving) return;

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
      ? products.map((p) => buildItem(p, false))
      : [...products, ...newProducts]
          .filter((product) => quantities[productKey(product.sku, product.batch)] > 0)
          .map((p) =>
            buildItem(
              p,
              newProducts.some((n) => n.sku === p.sku && n.batch === p.batch)
            )
          );

    if (items.length === 0) {
      toast.error("Tidak ada produk dengan quantity > 0");
      return;
    }

    setSaving(true);
    setShowZeroConfirm(false);
    const sessionId = `${user?.email}_${Date.now()}`;
    const timestamp = new Date().toISOString();

    // Tunggu server benar-benar menyimpan sebelum mengklaim sukses.
    // Jika gagal, tetap di halaman ini agar operator bisa mencoba lagi
    // tanpa mengetik ulang.
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
    } catch {
      toast.error("Gagal menyimpan ke server. Data masih ada, coba lagi.");
      setSaving(false);
      return;
    }

    // Optimistic history cache so new entries appear immediately
    // (Google Sheets replication can lag a few seconds)
    const historyCacheKey = `history:${user?.email}:all`;
    const cachedHistory = getCache<HistoryEntry[]>(historyCacheKey);
    const optimisticEntries: HistoryEntry[] = items.map((item, idx) => ({
      sessionId,
      rowId: `optimistic_${Date.now()}_${idx}`,
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
    optimisticEntries.forEach((entry) => addHistoryEntryLocal(entry).catch(() => {}));

    if (typeof window !== "undefined") {
      window.localStorage.setItem("lastSaveTs", String(Date.now()));
    }

    invalidateMemCache("getHistory");
    clearCache("products:");
    toast.success(
      zeroMode ? "Disimpan: semua kuantitas 0 untuk lokasi ini" : "Stock opname berhasil disimpan!"
    );
    router.push("/scan");
  };

  const handleSaveClick = () => {
    if (totalItems === 0) {
      // Lokasi boleh selesai dengan seluruh kuantitas nol, lewat konfirmasi eksplisit
      setShowZeroConfirm(true);
      return;
    }
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
    (p) => (quantities[productKey(p.sku, p.batch)] || 0) > 0
  ).length;

  const hasUnsavedChanges = totalItems > 0 || newProducts.length > 0;

  const handleBackClick = () => {
    if (hasUnsavedChanges) {
      setShowExitConfirm(true);
    } else {
      router.push("/scan");
    }
  };

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

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

        {/* ── Aksi sekunder ── */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            aria-expanded={showAddForm}
            className="flex-1 min-h-touch bg-surface-warm border border-border text-text-primary rounded-input font-bold text-meta flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
          >
            {showAddForm ? "Tutup Form" : (<><PlusIcon className="w-4 h-4" /> Tambah Produk</>)}
          </button>
          {products.length > 0 && (
            <button
              onClick={() => setShowMoveModal(true)}
              className="min-h-touch bg-surface-warm border border-border text-text-primary px-4 rounded-input font-bold text-meta flex items-center gap-1.5 active:scale-[0.98] transition"
            >
              <SwapIcon className="w-4 h-4" /> Pindah
            </button>
          )}
        </div>

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

              <Field id="add-batch" label="Batch" required>
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
                    placeholder="Batch…"
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

              <button
                type="button"
                onClick={async () => {
                  if (!newProductForm.productName || !newProductForm.sku || !newProductForm.batch) {
                    toast.error("Nama Produk, SKU, dan Batch harus diisi");
                    return;
                  }
                  setSavingMasterData(true);
                  try {
                    const result = await addMasterProductApi(
                      location,
                      newProductForm.productName,
                      newProductForm.sku,
                      newProductForm.batch,
                      newProductForm.barcode
                    );
                    if (result.success) {
                      const newProd: Product = {
                        productName: newProductForm.productName,
                        sku: newProductForm.sku,
                        batch: newProductForm.batch,
                        barcode: newProductForm.barcode || undefined,
                      };
                      setProducts((prev) => [...prev, newProd]);
                      setQuantities((prev) => ({
                        ...prev,
                        [productKey(newProd.sku, newProd.batch)]: 0,
                      }));
                      setNewProductForm({ productName: "", sku: "", batch: "", barcode: "", qty: 0 });
                      setShowAddForm(false);
                      toast.success("Produk tersimpan di Master Data");
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
                    qty > 0 ? "border-primary/50" : "border-border"
                  }`}
                >
                  {/* Baris 1: nama produk + tindakan sekunder */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-meta font-bold text-text-primary leading-snug break-words">
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
                      <IconButton
                        label={`Hapus ${product.productName}`}
                        variant="danger"
                        size="md"
                        onClick={() => handleDeleteProduct(product, isNew)}
                      >
                        <TrashIcon className="w-4 h-4" />
                      </IconButton>
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
                          <span className="text-meta text-text-secondary">Batch:</span>
                          <span className="text-meta font-bold text-text-primary">{product.batch}</span>
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

                  {/* Baris 3: kuantitas — fokus utama kartu */}
                  <div className="pt-2 border-t border-border-subtle">
                    <QtyInput
                      wide
                      value={qty}
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
          <div className="max-w-[720px] mx-auto p-3 pointer-events-auto">
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={saving}
              className="w-full min-h-touch bg-primary text-ivory px-5 rounded-card font-bold text-base2 shadow-card disabled:opacity-50 active:scale-[0.99] transition flex items-center justify-between gap-3"
            >
              <span>{saving ? "Menyimpan…" : "Simpan Hasil Hitung"}</span>
              <span className="bg-ivory/20 px-3 py-1 rounded-full text-meta font-bold tnum">
                {totalItems} item
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── Konfirmasi keluar tanpa menyimpan ── */}
      <ConfirmModal
        isOpen={showExitConfirm}
        title="Keluar Tanpa Menyimpan?"
        message={`Ada ${totalItems} item yang sudah dihitung di lokasi ${location} tetapi belum disimpan. Jika keluar sekarang, hitungan tersebut akan hilang.`}
        confirmText="Buang & Keluar"
        cancelText="Tetap di Halaman"
        isDanger
        onConfirm={() => router.push("/scan")}
        onClose={() => setShowExitConfirm(false)}
      />

      {/* ── Konfirmasi simpan semua-nol ── */}
      <ConfirmModal
        isOpen={showZeroConfirm}
        title="Simpan dengan Semua Kuantitas Nol?"
        message={`Semua ${products.length} produk di lokasi ${location} akan dicatat dengan kuantitas 0 (stok kosong). Lanjutkan?`}
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
