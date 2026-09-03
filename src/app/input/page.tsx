"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import LoadingSpinner from "@/components/LoadingSpinner";
import BarcodeScanner from "@/components/BarcodeScanner";
import QtyInput from "@/components/QtyInput";
import ConfirmModal from "@/components/ConfirmModal";
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
  moveProductsApi,
  searchLocationsApi,
  invalidateMemCache,
} from "@/lib/api";
import { Product, HistoryEntry } from "@/lib/types";
import { getCache, setCache, clearCache } from "@/lib/cache";
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

  // Delete confirm modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    sku: string;
    batch: string;
    productName: string;
    isNew: boolean;
  }>({
    isOpen: false,
    sku: "",
    batch: "",
    productName: "",
    isNew: false,
  });

  const [newProductForm, setNewProductForm] = useState({
    productName: "",
    sku: "",
    batch: "",
    barcode: "",
    qty: 0,
  });
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTimer, setSearchTimer] = useState<NodeJS.Timeout | null>(null);
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

  // Move location
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [moveMode, setMoveMode] = useState<"all" | "select">("all");
  const [moveSelected, setMoveSelected] = useState<Set<string>>(new Set());
  const [movingProducts, setMovingProducts] = useState(false);
  const [moveLocSuggestions, setMoveLocSuggestions] = useState<
    Array<{ locationCode: string; productCount: number }>
  >([]);
  const [showMoveLocSuggestions, setShowMoveLocSuggestions] = useState(false);
  const [moveLocSearchTimer, setMoveLocSearchTimer] = useState<NodeJS.Timeout | null>(null);
  const moveLocRef = useRef<HTMLDivElement>(null);

  // Auto-scroll refs
  const addFormQtyRef = useRef<HTMLDivElement>(null);
  const addFormSubmitRef = useRef<HTMLDivElement>(null);
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
    if (user?.email) preloadHistory(user.email);
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

  const promptDeleteProduct = (product: Product, isNew: boolean) => {
    setDeleteModal({
      isOpen: true,
      sku: product.sku,
      batch: product.batch,
      productName: product.productName,
      isNew,
    });
  };

  const confirmDeleteProduct = async () => {
    const { sku, batch, isNew } = deleteModal;
    if (isNew) {
      setNewProducts((prev) => prev.filter((p) => !(p.sku === sku && p.batch === batch)));
      setQuantities((prev) => {
        const copy = { ...prev };
        delete copy[productKey(sku, batch)];
        return copy;
      });
      toast.success("Produk baru dihapus dari daftar");
      return;
    }

    // Optimistic delete
    const prevProducts = [...products];
    const prevNewProducts = [...newProducts];
    const prevQuantities = { ...quantities };

    setProducts((prev) => prev.filter((p) => !(p.sku === sku && p.batch === batch)));
    setQuantities((prev) => {
      const copy = { ...prev };
      delete copy[productKey(sku, batch)];
      return copy;
    });
    toast.success("Produk berhasil dihapus");

    const ck = `products:${location}`;
    setCache(ck, products.filter((p) => !(p.sku === sku && p.batch === batch)));
    clearCache("history:");

    try {
      const result = await deleteProductApi(location, sku, batch);
      if (!result.success) {
        setProducts(prevProducts);
        setNewProducts(prevNewProducts);
        setQuantities(prevQuantities);
        setCache(ck, prevProducts);
        toast.error(result.message || "Gagal menghapus, data dikembalikan");
      }
    } catch {
      setProducts(prevProducts);
      setNewProducts(prevNewProducts);
      setQuantities(prevQuantities);
      setCache(ck, prevProducts);
      toast.error("Gagal menghapus, data dikembalikan");
    }
  };

  const handleProductNameSearch = (value: string) => {
    setNewProductForm((prev) => ({ ...prev, productName: value }));
    if (searchTimer) clearTimeout(searchTimer);
    if (value.trim().length < 2) {
      setSearchResults([]);
      setShowSuggestions(false);
      return;
    }

    if (allProductsRef.current) {
      const q = value.trim().toLowerCase();
      const filtered = allProductsRef.current
        .filter((p) => String(p.productName || "").toLowerCase().includes(q))
        .slice(0, 10);
      setSearchResults(filtered);
      setShowSuggestions(filtered.length > 0);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await searchProductsApi(value.trim());
        if (result.success && result.products) {
          setSearchResults(result.products);
          setShowSuggestions(result.products.length > 0);
        }
      } catch (error) {
        console.error("Search error:", error);
      }
    }, 80);
    setSearchTimer(timer);
  };

  const handleSelectSuggestion = (product: Product) => {
    setNewProductForm((prev) => ({
      ...prev,
      productName: product.productName,
      sku: product.sku,
      batch: product.batch,
      barcode: product.barcode || prev.barcode,
    }));
    setShowSuggestions(false);
    setSearchResults([]);
    toast.success(`Produk dipilih: ${product.productName}`);
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
        toast.success(`Produk ditemukan: ${result.product.productName}`);
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
    toast.success("Produk baru berhasil ditambahkan");
  };

  const handleBatchEdit = (key: string, currentBatch: string, sku: string) => {
    setEditingBatchKey(key);
    setEditingBatchValue(String(currentBatch));
    setEditingBatchSku(sku);
    setShowInlineBatchDropdown(true);
  };

  const handleBatchSave = (sku: string, oldBatch: string, isNew: boolean) => {
    const newBatch = editingBatchValue.trim();
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
    toast.success("Batch diperbarui");
  };

  const openMoveModal = () => {
    setMoveTarget("");
    setMoveMode("all");
    setMoveSelected(new Set());
    setMoveLocSuggestions([]);
    setShowMoveLocSuggestions(false);
    setShowMoveModal(true);
  };

  const handleMoveLocSearch = (query: string) => {
    setMoveTarget(query);
    if (moveLocSearchTimer) clearTimeout(moveLocSearchTimer);
    if (!query.trim()) {
      setMoveLocSuggestions([]);
      setShowMoveLocSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await searchLocationsApi(query.trim());
        if (result.success && result.locations) {
          setMoveLocSuggestions(
            result.locations.filter((l) => l.locationCode.toUpperCase() !== location.toUpperCase())
          );
          setShowMoveLocSuggestions(true);
        }
      } catch {}
    }, 300);
    setMoveLocSearchTimer(timer);
  };

  const toggleMoveSelect = (sku: string, batch: string) => {
    const key = productKey(sku, batch);
    setMoveSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleMoveProducts = async () => {
    const target = moveTarget.trim().toUpperCase();
    if (!target) {
      toast.error("Masukkan lokasi tujuan");
      return;
    }
    if (target === location.toUpperCase()) {
      toast.error("Lokasi tujuan tidak boleh sama");
      return;
    }

    const items =
      moveMode === "select"
        ? products
            .filter((p) => moveSelected.has(productKey(p.sku, p.batch)))
            .map((p) => ({ sku: p.sku, batch: String(p.batch) }))
        : [];

    if (moveMode === "select" && items.length === 0) {
      toast.error("Pilih minimal 1 produk");
      return;
    }

    setMovingProducts(true);
    try {
      const result = await moveProductsApi(location, target, items);
      if (result.success) {
        toast.success(result.message || "Produk berhasil dipindah");
        setShowMoveModal(false);
        clearCache("products:");
        invalidateMemCache("getProducts");
        invalidateMemCache("getAllProducts");
        invalidateMemCache("getAllLocations");
        const refreshed = await getProductsApi(location);
        if (refreshed.success && refreshed.products) {
          setProducts(refreshed.products);
        } else {
          setProducts([]);
        }
      } else {
        toast.error(result.message || "Gagal memindahkan produk");
      }
    } catch {
      toast.error("Gagal memindahkan produk");
    } finally {
      setMovingProducts(false);
    }
  };

  const handleSave = () => {
    const existingItems = products
      .filter((product) => quantities[productKey(product.sku, product.batch)] > 0)
      .map((product) => {
        const k = productKey(product.sku, product.batch);
        return {
          productName: product.productName,
          sku: product.sku,
          batch: product.batch,
          barcode: product.barcode || "",
          qty: quantities[k],
          formula: formulas[k] || "",
          isNew: false,
        };
      });

    const newItems = newProducts
      .filter((product) => quantities[productKey(product.sku, product.batch)] > 0)
      .map((product) => {
        const k = productKey(product.sku, product.batch);
        return {
          productName: product.productName,
          sku: product.sku,
          batch: product.batch,
          barcode: product.barcode || "",
          qty: quantities[k],
          formula: formulas[k] || "",
          isNew: true,
        };
      });

    const items = [...existingItems, ...newItems];
    if (items.length === 0) {
      toast.error("Tidak ada produk dengan quantity > 0");
      return;
    }

    setSaving(true);
    const sessionId = `${user?.email}_${Date.now()}`;
    const timestamp = new Date().toISOString();

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
    const updatedHistory = [...optimisticEntries, ...(cachedHistory?.data || [])];
    setCache(historyCacheKey, updatedHistory);

    saveStockOpnameApi(sessionId, user?.email || "", location, timestamp, items)
      .then((result) => {
        if (!result.success) toast.error(result.message || "Gagal sinkron ke server");
      })
      .catch(() => toast.error("Gagal sinkron ke server"));

    if (typeof window !== "undefined") {
      window.localStorage.setItem("lastSaveTs", String(Date.now()));
    }

    invalidateMemCache("getHistory");
    clearCache("products:");
    toast.success("Stock opname berhasil disimpan!");
    router.push("/scan");
  };

  const allProducts = [...products, ...newProducts];

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

  if (loading) {
    return (
      <div className="mobile-container flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="mobile-container pb-36">
      {/* ── Sticky Top Header ── */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 pt-4 pb-3 border-b border-border shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => router.push("/scan")}
              className="w-9 h-9 rounded-xl bg-surface-warm flex items-center justify-center hover:bg-gray-200 text-text-primary transition active:scale-95 shadow-xs"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <div>
              <h1 className="text-sm font-bold text-text-primary leading-tight">Input Quantity</h1>
              <p className="text-[11px] text-text-secondary">
                Lokasi: <span className="font-bold text-primary">{location}</span>
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold text-text-secondary uppercase">Total Terhitung</span>
            <p className="text-base font-black text-primary leading-none">{totalItems} item</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3 space-y-3">
        {/* ── Action Buttons (+ Tambah & Pindah) ── */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex-1 bg-primary text-white py-2.5 px-3 rounded-xl font-bold hover:bg-primary-light transition text-xs shadow-md active:scale-[0.98] flex items-center justify-center gap-1.5"
          >
            {showAddForm ? (
              <>✕ Tutup Form</>
            ) : (
              <>
                <span className="text-base leading-none">+</span> Tambah Produk
              </>
            )}
          </button>
          {products.length > 0 && (
            <button
              onClick={openMoveModal}
              className="bg-surface-warm border border-border text-text-primary px-3.5 py-2.5 rounded-xl font-bold hover:bg-gray-200 transition text-xs active:scale-[0.98] flex items-center gap-1.5 shadow-xs"
            >
              <span>⇄</span> Pindah
            </button>
          )}
        </div>

        {/* ── Form Tambah Produk Baru ── */}
        {showAddForm && (
          <div className="bg-white border border-border rounded-2xl p-4 shadow-card animate-fadeIn space-y-3">
            <h3 className="text-xs font-bold text-text-primary">Tambah Produk ke Lokasi Ini</h3>

            {/* Barcode Scanner */}
            <div>
              <label className="block text-[11px] font-bold text-text-secondary mb-1">
                Scan Barcode Produk
              </label>
              <div className="relative">
                <input
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
                  className="w-full pl-3 pr-20 py-2 bg-surface-warm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-xs font-semibold"
                  placeholder="Scan / ketik barcode..."
                />
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const b = String(newProductForm.barcode || "").trim();
                      if (b) handleBarcodeScan(b);
                    }}
                    disabled={!String(newProductForm.barcode || "").trim() || scanningBarcode}
                    className="w-7 h-7 rounded-lg bg-white border border-border flex items-center justify-center text-primary disabled:opacity-50"
                  >
                    🔍
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBarcodeScanner(true)}
                    disabled={scanningBarcode}
                    className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center disabled:opacity-50 shadow-xs"
                  >
                    📷
                  </button>
                </div>
              </div>
            </div>

            {/* Nama Produk Search */}
            <div className="relative">
              <label className="block text-[11px] font-bold text-text-secondary mb-1">
                Nama Produk
              </label>
              <input
                type="text"
                value={newProductForm.productName}
                onChange={(e) => handleProductNameSearch(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowSuggestions(true);
                }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                className="w-full px-3 py-2 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-xs font-semibold"
                placeholder="Ketik min. 2 huruf..."
                autoComplete="off"
              />
              {showSuggestions && searchResults.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-xl max-h-44 overflow-y-auto">
                  {searchResults.map((p, idx) => (
                    <button
                      key={`${p.sku}-${idx}`}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-primary-pale border-b border-border last:border-b-0"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectSuggestion(p)}
                    >
                      <p className="font-bold text-text-primary text-xs">{p.productName}</p>
                      <p className="text-[10px] text-text-secondary">
                        SKU: {p.sku} | Batch: {p.batch}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* SKU & Batch */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-text-secondary mb-1">SKU</label>
                <input
                  type="text"
                  value={newProductForm.sku}
                  onChange={(e) =>
                    setNewProductForm({ ...newProductForm, sku: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-xs font-semibold"
                  placeholder="SKU..."
                />
              </div>

              <div ref={batchDropdownRef} className="relative">
                <label className="block text-[11px] font-bold text-text-secondary mb-1">Batch</label>
                <div className="relative">
                  <input
                    type="text"
                    value={newProductForm.batch}
                    onChange={(e) => {
                      setNewProductForm({ ...newProductForm, batch: e.target.value });
                      setShowBatchDropdown(true);
                    }}
                    onFocus={() => {
                      if (newProductForm.sku.trim()) setShowBatchDropdown(true);
                    }}
                    className="w-full px-3 py-2 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-xs font-semibold pr-6"
                    placeholder="Batch..."
                  />
                  {batchesForSku.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowBatchDropdown(!showBatchDropdown)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-primary p-0.5"
                    >
                      ▼
                    </button>
                  )}
                </div>

                {showBatchDropdown && newProductForm.sku.trim() && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg overflow-hidden max-h-36 overflow-y-auto">
                    {filteredBatches.length > 0 ? (
                      filteredBatches.map((batch) => (
                        <button
                          key={batch}
                          type="button"
                          onClick={() => {
                            setNewProductForm({ ...newProductForm, batch });
                            setShowBatchDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-primary-pale border-b border-border last:border-b-0 ${
                            newProductForm.batch === batch ? "bg-primary/10 text-primary font-bold" : ""
                          }`}
                        >
                          {batch}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-[10px] text-text-secondary">
                        Batch baru: &quot;{newProductForm.batch.trim()}&quot;
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Qty Input */}
            <div ref={addFormQtyRef}>
              <label className="block text-[11px] font-bold text-text-secondary mb-1">Quantity</label>
              <QtyInput
                value={newProductForm.qty}
                onChange={(v) => setNewProductForm((prev) => ({ ...prev, qty: v }))}
                onExprCommit={(expr) => setNewProductFormula(expr)}
                wide
              />
            </div>

            <div ref={addFormSubmitRef} className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleAddNewProduct}
                className="w-full bg-primary text-white py-3 rounded-xl font-bold text-xs hover:bg-primary-light transition shadow-md active:scale-[0.98]"
              >
                + Masukkan ke Hitungan Opname
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
                className="w-full bg-surface-warm border border-border text-text-primary py-2.5 rounded-xl font-bold text-xs hover:bg-gray-200 transition active:scale-[0.98]"
              >
                {savingMasterData ? "Menyimpan..." : "Simpan ke Master Data Saja"}
              </button>
            </div>
          </div>
        )}

        {/* ── Product List (Card Layout) ── */}
        <div ref={productListRef} className="space-y-2.5">
          {allProducts.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-border shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-primary-pale text-primary mx-auto flex items-center justify-center text-xl mb-2">
                📦
              </div>
              <p className="text-xs font-bold text-text-primary">Belum ada produk di lokasi ini</p>
              <p className="text-[11px] text-text-secondary mt-1">
                Gunakan tombol &quot;+ Tambah Produk&quot; untuk memasukkan barang
              </p>
            </div>
          ) : (
            allProducts.map((product, idx) => {
              const isNew = idx >= products.length;
              const k = productKey(product.sku, product.batch);
              const qty = quantities[k] || 0;
              const formula = formulas[k] || "";

              return (
                <div
                  key={`${product.sku}-${product.batch}-${idx}`}
                  data-product-idx={idx}
                  className={`bg-white rounded-2xl p-3.5 border transition shadow-card ${
                    qty > 0 ? "border-primary/40 bg-primary-pale/10" : "border-border"
                  }`}
                >
                  {/* Row 1: Header (Product Name + Delete Button) */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      {isNew && (
                        <span className="inline-block px-2 py-0.5 bg-accent-yellow/20 text-accent-yellow text-[9px] font-bold rounded-md mb-1">
                          PRODUK BARU
                        </span>
                      )}
                      <h3 className="text-xs font-bold text-text-primary leading-tight break-words">
                        {product.productName}
                      </h3>
                      <p className="text-[10px] text-text-secondary mt-0.5">
                        SKU: <span className="font-semibold">{product.sku}</span>
                      </p>
                    </div>

                    {/* Delete button (Ergonomic 36x36px target) */}
                    <button
                      type="button"
                      onClick={() => promptDeleteProduct(product, isNew)}
                      className="w-9 h-9 rounded-xl bg-accent-red/10 text-accent-red hover:bg-accent-red hover:text-white transition flex-shrink-0 flex items-center justify-center active:scale-90"
                      title="Hapus produk"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>

                  {/* Row 2: Batch (Inline Edit) */}
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
                        <div className="flex items-center gap-1">
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
                            className="w-32 px-2 py-1 bg-surface-warm border border-primary rounded-lg text-xs font-bold text-text-primary focus:outline-none"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleBatchSave(product.sku, product.batch, isNew)}
                            className="px-2 py-1 bg-primary text-white text-[10px] font-bold rounded-lg"
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
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-warm hover:bg-primary-pale rounded-lg border border-border-subtle transition active:scale-95"
                        >
                          <span className="text-[10px] text-text-secondary">Batch:</span>
                          <span className="text-[11px] font-bold text-text-primary">{product.batch}</span>
                          <span className="text-[10px] text-text-secondary">✏️</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Qty Input */}
                  <div className="pt-1 border-t border-border-subtle">
                    <QtyInput
                      wide
                      value={qty}
                      onChange={(v) => handleQuantityChange(k, v)}
                      onExprCommit={(expr) => handleExprCommit(k, expr)}
                      onCommit={() => scrollToNextProduct(idx)}
                    />
                    {formula && (
                      <p className="text-[10px] text-primary font-bold mt-1 text-center">
                        🧮 Rumus: {formula}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Fixed Floating Bottom Save Bar ── */}
      {!showAddForm && allProducts.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-30 pointer-events-none">
          <div className="max-w-md mx-auto p-4 pointer-events-auto">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || totalItems === 0}
              className="w-full bg-primary text-white py-3.5 px-6 rounded-2xl font-bold text-sm hover:bg-primary-light transition shadow-xl border border-primary-light/30 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] flex items-center justify-between"
            >
              <span>{saving ? "Menyimpan Data..." : "Simpan Hasil Opname"}</span>
              <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-black">
                {totalItems} Item
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── Confirmation Modal Hapus Produk ── */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title="Hapus Produk dari Lokasi?"
        message={`Apakah Anda yakin ingin menghapus "${deleteModal.productName}" (SKU: ${deleteModal.sku}, Batch: ${deleteModal.batch})?`}
        confirmText="Hapus Produk"
        cancelText="Batal"
        isDanger
        onConfirm={confirmDeleteProduct}
        onClose={() => setDeleteModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* ── Move Location Modal ── */}
      {showMoveModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowMoveModal(false)}
        >
          <div
            className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 sm:hidden" />

            <div className="px-5 pt-3 pb-3 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-text-primary">Pindah Lokasi</h2>
                <p className="text-[11px] text-text-secondary">
                  Dari: <span className="font-bold text-primary">{location}</span>
                </p>
              </div>
              <button
                onClick={() => setShowMoveModal(false)}
                className="w-7 h-7 rounded-full bg-surface-warm flex items-center justify-center text-text-secondary text-xs"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-3 overflow-y-auto flex-1 space-y-3">
              {/* Lokasi Tujuan */}
              <div ref={moveLocRef} className="relative">
                <label className="block text-xs font-bold text-text-primary mb-1">
                  Lokasi Tujuan:
                </label>
                <input
                  type="text"
                  value={moveTarget}
                  onChange={(e) => handleMoveLocSearch(e.target.value)}
                  onFocus={() => {
                    if (moveLocSuggestions.length > 0) setShowMoveLocSuggestions(true);
                  }}
                  placeholder="Ketik kode lokasi tujuan..."
                  className="w-full bg-surface-warm border border-border rounded-xl px-3.5 py-2.5 text-xs font-bold uppercase focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {showMoveLocSuggestions && moveLocSuggestions.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg max-h-36 overflow-y-auto">
                    {moveLocSuggestions.map((loc) => (
                      <button
                        key={loc.locationCode}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setMoveTarget(loc.locationCode);
                          setShowMoveLocSuggestions(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-primary-pale border-b border-border last:border-b-0 flex justify-between"
                      >
                        <span className="font-bold text-text-primary">{loc.locationCode}</span>
                        <span className="text-[10px] text-text-secondary">({loc.productCount} produk)</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Mode Pindah */}
              <div>
                <label className="block text-xs font-bold text-text-primary mb-1.5">
                  Pilihan Produk
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMoveMode("all")}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition border ${
                      moveMode === "all"
                        ? "bg-primary text-white border-primary shadow-xs"
                        : "bg-surface-warm text-text-primary border-border"
                    }`}
                  >
                    Semua ({products.length})
                  </button>
                  <button
                    onClick={() => setMoveMode("select")}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition border ${
                      moveMode === "select"
                        ? "bg-primary text-white border-primary shadow-xs"
                        : "bg-surface-warm text-text-primary border-border"
                    }`}
                  >
                    Pilih Produk
                  </button>
                </div>
              </div>

              {/* Selection list */}
              {moveMode === "select" && (
                <div className="border border-border rounded-xl overflow-hidden max-h-40 overflow-y-auto divide-y divide-border-subtle bg-white">
                  {products.map((p) => {
                    const key = productKey(p.sku, p.batch);
                    const isSelected = moveSelected.has(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleMoveSelect(p.sku, p.batch)}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 transition ${
                          isSelected ? "bg-primary-pale/40" : ""
                        }`}
                      >
                        <span className={`text-sm ${isSelected ? "text-primary" : "text-gray-300"}`}>
                          {isSelected ? "☑" : "☐"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-text-primary truncate">{p.productName}</p>
                          <p className="text-[10px] text-text-secondary">
                            SKU: {p.sku} | Batch: {p.batch}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-border flex gap-2.5">
              <button
                onClick={() => setShowMoveModal(false)}
                className="flex-1 py-2.5 bg-surface-warm rounded-xl text-xs font-bold text-text-primary"
              >
                Batal
              </button>
              <button
                onClick={handleMoveProducts}
                disabled={
                  movingProducts ||
                  !moveTarget.trim() ||
                  (moveMode === "select" && moveSelected.size === 0)
                }
                className="flex-1 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-light disabled:opacity-50 shadow-md"
              >
                {movingProducts ? <LoadingSpinner /> : "Pindahkan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      {showBarcodeScanner && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-4 shadow-2xl border border-border">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="font-bold text-text-primary text-sm">Scan Barcode Produk</h3>
              <button
                onClick={() => setShowBarcodeScanner(false)}
                className="w-8 h-8 rounded-full bg-surface-warm flex items-center justify-center text-text-secondary text-xs"
              >
                ✕
              </button>
            </div>
            <BarcodeScanner onScan={handleBarcodeScan} active={showBarcodeScanner} />
          </div>
        </div>
      )}

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
