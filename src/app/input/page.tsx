"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import BottomNav from "@/components/BottomNav";
import LoadingSpinner from "@/components/LoadingSpinner";
import BarcodeScanner from "@/components/BarcodeScanner";
import QtyInput from "@/components/QtyInput";
import { calcExpr } from "@/components/QtyInput";
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
  const [moveLocSearchTimer, setMoveLocSearchTimer] =
    useState<NodeJS.Timeout | null>(null);
  const moveLocRef = useRef<HTMLDivElement>(null);

  // Unique key per product row: SKU + batch combination
  const productKey = (sku: string, batch: string) => `${sku}__${batch}`;
  // All products cached locally for instant client-side search
  const allProductsRef = useRef<Product[] | null>(null);

  // Normalize product fields: Google Sheets may return numbers instead of strings
  const normalizeProduct = (p: any): Product => ({
    ...p,
    productName: String(p.productName ?? ""),
    sku: String(p.sku ?? ""),
    batch: String(p.batch ?? ""),
    barcode: String(p.barcode ?? ""),
  });

  // Get unique batches for current SKU from allProducts
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
    // Also include batches from loaded products for current location
    products.forEach((p) => {
      if (p.sku.trim().toLowerCase() === sku && p.batch) {
        batchSet.add(p.batch);
      }
    });
    return Array.from(batchSet).sort();
  }, [newProductForm.sku, products]);

  // Filtered batches based on current input
  const filteredBatches = useMemo(() => {
    const q = newProductForm.batch.trim().toLowerCase();
    if (!q) return batchesForSku;
    // If current value exactly matches an existing batch, show ALL batches so user can switch
    if (batchesForSku.some((b) => b.toLowerCase() === q)) return batchesForSku;
    return batchesForSku.filter((b) => b.toLowerCase().includes(q));
  }, [newProductForm.batch, batchesForSku]);

  // Get unique batches for inline batch edit SKU
  const inlineBatchesForSku = useMemo(() => {
    const sku = String(editingBatchSku || "")
      .trim()
      .toLowerCase();
    if (!sku) return [];
    const all = allProductsRef.current || [];
    const batchSet = new Set<string>();
    all.forEach((p) => {
      if (String(p.sku).trim().toLowerCase() === sku && p.batch) {
        batchSet.add(String(p.batch));
      }
    });
    // Also include batches from loaded products for current location
    [...products, ...newProducts].forEach((p) => {
      if (String(p.sku).trim().toLowerCase() === sku && p.batch) {
        batchSet.add(String(p.batch));
      }
    });
    return Array.from(batchSet).sort();
  }, [editingBatchSku, products, newProducts]);

  // Filtered batches for inline edit
  const inlineFilteredBatches = useMemo(() => {
    const q = editingBatchValue.trim().toLowerCase();
    if (!q) return inlineBatchesForSku;
    if (inlineBatchesForSku.some((b) => b.toLowerCase() === q))
      return inlineBatchesForSku;
    return inlineBatchesForSku.filter((b) => b.toLowerCase().includes(q));
  }, [editingBatchValue, inlineBatchesForSku]);

  // Close batch dropdown on outside click (add form)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        batchDropdownRef.current &&
        !batchDropdownRef.current.contains(e.target as Node)
      ) {
        setShowBatchDropdown(false);
      }
    };
    if (showBatchDropdown)
      document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showBatchDropdown]);

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
    warmupCacheApi().catch(() => {});
    // Preload history for instant tab switch
    if (user?.email) preloadHistory(user.email);
    // Load all products for instant client-side search
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
      } catch {
        // Fall back to server-side search
      }
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

    // AppSheet-style: show cached products INSTANTLY
    const cached = getCache<Product[]>(ck);
    if (cached) {
      const normalized = cached.data.map(normalizeProduct);
      setProducts(normalized);
      const init: Record<string, number> = {};
      normalized.forEach((p) => (init[productKey(p.sku, p.batch)] = 0));
      setQuantities(init);
      setLoading(false); // UI langsung tampil!
    }

    // Background refresh
    try {
      const result = await getProductsApi(location);
      if (result.success && result.products) {
        const normalized = result.products.map(normalizeProduct);
        setProducts(normalized);
        setCache(ck, normalized);
        // Only set qty for NEW products (don't overwrite user input)
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
    setQuantities((prev) => ({
      ...prev,
      [key]: qty,
    }));
  };

  const handleExprCommit = (key: string, expr: string) => {
    setFormulas((prev) => ({
      ...prev,
      [key]: expr,
    }));
  };

  const handleDeleteProduct = async (sku: string, batch: string) => {
    const confirmDelete = window.confirm(
      "Hapus produk ini dari lokasi? Data juga akan dihapus dari Master Data.",
    );
    if (!confirmDelete) return;

    // AppSheet-style: optimistic delete
    const prevProducts = [...products];
    const prevNewProducts = [...newProducts];
    const prevQuantities = { ...quantities };

    setProducts((prev) =>
      prev.filter((p) => !(p.sku === sku && p.batch === batch)),
    );
    setNewProducts((prev) =>
      prev.filter((p) => !(p.sku === sku && p.batch === batch)),
    );
    setQuantities((prev) => {
      const copy = { ...prev };
      delete copy[productKey(sku, batch)];
      return copy;
    });
    toast.success("Produk berhasil dihapus");

    // Update product cache
    const ck = `products:${location}`;
    setCache(
      ck,
      products.filter((p) => !(p.sku === sku && p.batch === batch)),
    );
    clearCache("history:"); // invalidate history cache

    // Background sync
    try {
      const result = await deleteProductApi(location, sku, batch);
      if (!result.success) {
        setProducts(prevProducts);
        setNewProducts(prevNewProducts);
        setQuantities(prevQuantities);
        setCache(ck, prevProducts);
        toast.error(result.message || "Gagal menghapus, data dikembalikan");
      }
    } catch (error) {
      console.error("Delete error:", error);
      setProducts(prevProducts);
      setNewProducts(prevNewProducts);
      setQuantities(prevQuantities);
      setCache(ck, prevProducts);
      toast.error("Gagal menghapus, data dikembalikan");
    }
  };

  const handleDeleteNewProduct = (sku: string, batch: string) => {
    setNewProducts((prev) =>
      prev.filter((p) => !(p.sku === sku && p.batch === batch)),
    );
    setQuantities((prev) => {
      const copy = { ...prev };
      delete copy[productKey(sku, batch)];
      return copy;
    });
    toast.success("Produk baru dihapus dari daftar");
  };

  const handleProductNameSearch = (value: string) => {
    setNewProductForm((prev) => ({ ...prev, productName: value }));

    if (searchTimer) clearTimeout(searchTimer);

    if (value.trim().length < 2) {
      setSearchResults([]);
      setShowSuggestions(false);
      return;
    }

    // CLIENT-SIDE filtering if we have all products (INSTANT — 0ms)
    if (allProductsRef.current) {
      const q = value.trim().toLowerCase();
      const filtered = allProductsRef.current
        .filter((p) =>
          String(p.productName || "")
            .toLowerCase()
            .includes(q),
        )
        .slice(0, 10);
      setSearchResults(filtered);
      setShowSuggestions(filtered.length > 0);
      return;
    }

    // Fallback: server-side search
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
      } else {
        // Barcode not found, just fill the barcode field
        setNewProductForm((prev) => ({
          ...prev,
          barcode: barcode,
        }));
        toast.error(result.message || "Produk tidak ditemukan, isi manual");
      }
    } catch (error) {
      console.error("Barcode lookup error:", error);
      setNewProductForm((prev) => ({
        ...prev,
        barcode: barcode,
      }));
      toast.error("Gagal lookup barcode, isi data manual");
    } finally {
      setScanningBarcode(false);
    }
  };

  const handleAddNewProduct = () => {
    if (
      !newProductForm.productName ||
      !newProductForm.sku ||
      !newProductForm.batch
    ) {
      toast.error("Nama Produk, SKU, dan Batch harus diisi");
      return;
    }

    if (newProductForm.qty <= 0) {
      toast.error("Quantity harus lebih dari 0");
      return;
    }

    // Check if SKU + Batch already exists
    const allProducts = [...products, ...newProducts];
    if (
      allProducts.some(
        (p) => p.sku === newProductForm.sku && p.batch === newProductForm.batch,
      )
    ) {
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
    setQuantities((prev) => ({
      ...prev,
      [nk]: newProductForm.qty,
    }));
    if (newProductFormula) {
      setFormulas((prev) => ({ ...prev, [nk]: newProductFormula }));
    }

    // Reset form
    setNewProductForm({
      productName: "",
      sku: "",
      batch: "",
      barcode: "",
      qty: 0,
    });
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
    if (newBatch === oldBatch) return; // no change

    // Update the product's batch — match by BOTH sku and oldBatch
    if (isNew) {
      setNewProducts((prev) =>
        prev.map((p) =>
          p.sku === sku && p.batch === oldBatch ? { ...p, batch: newBatch } : p,
        ),
      );
    } else {
      setProducts((prev) =>
        prev.map((p) =>
          p.sku === sku && p.batch === oldBatch ? { ...p, batch: newBatch } : p,
        ),
      );
    }

    // Migrate qty/formula from old key to new key
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

  // ── Move Location handlers ──
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
          // Filter out current location
          setMoveLocSuggestions(
            result.locations.filter(
              (l) => l.locationCode.toUpperCase() !== location.toUpperCase(),
            ),
          );
          setShowMoveLocSuggestions(true);
        }
      } catch {
        /* ignore */
      }
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
        // Reload products for current location
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
      .filter(
        (product) => quantities[productKey(product.sku, product.batch)] > 0,
      )
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
      .filter(
        (product) => quantities[productKey(product.sku, product.batch)] > 0,
      )
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

    // ── Optimistic update: inject new entries into localStorage cache ──
    // This makes scan terakhir & history show new data INSTANTLY
    // instead of waiting for server round-trip (GAS cold start = 3-10s)
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
    const updatedHistory = [
      ...optimisticEntries,
      ...(cachedHistory?.data || []),
    ];
    setCache(historyCacheKey, updatedHistory);

    // Fire save in background — don't await
    saveStockOpnameApi(sessionId, user?.email || "", location, timestamp, items)
      .then((result) => {
        if (!result.success)
          toast.error(result.message || "Gagal sinkron ke server");
      })
      .catch(() => toast.error("Gagal sinkron ke server"));

    // Mark save timestamp so other pages know not to overwrite optimistic data
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lastSaveTs", String(Date.now()));
    }

    // Navigate immediately — memCache invalidated so background refresh gets real data
    invalidateMemCache("getHistory");
    clearCache("products:");
    toast.success("Stock opname berhasil disimpan!");
    router.push("/scan");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--primary-bg)]">
        <LoadingSpinner />
      </div>
    );
  }

  const allProducts = [...products, ...newProducts];
  const totalItems = Object.values(quantities).reduce(
    (sum, qty) => sum + qty,
    0,
  );

  return (
    <div className="min-h-screen pb-44 bg-[var(--primary-bg)]">
      {/* ── Header ── */}
      <div className="bg-white px-5 pt-6 pb-4 shadow-card">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => router.push("/scan")}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
          >
            <svg
              className="w-4 h-4 text-text-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-bold text-text-primary">
              Input Quantity
            </h1>
            <p className="text-xs text-text-secondary">
              Lokasi:{" "}
              <span className="font-semibold text-primary">{location}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        {/* ── Stats Card ── */}
        <div className="bg-white rounded-2xl p-4 mb-3 shadow-card border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-primary"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Total Produk</p>
                <p className="text-lg font-bold text-text-primary">
                  {allProducts.length}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-secondary">Total Item</p>
              <p className="text-lg font-bold text-primary">{totalItems}</p>
            </div>
          </div>
        </div>

        {/* ── Add New Product & Move Location Buttons ── */}
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex-1 bg-primary text-white py-3 rounded-2xl font-semibold hover:bg-primary-light transition text-sm shadow-card active:scale-[0.98]"
          >
            {showAddForm ? "✕ Tutup Form" : "+ Tambah Produk"}
          </button>
          {products.length > 0 && (
            <button
              onClick={openMoveModal}
              className="bg-amber-500 text-white px-4 py-3 rounded-2xl font-semibold hover:bg-amber-600 transition text-sm shadow-card active:scale-[0.98] flex items-center gap-1.5"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              Pindah
            </button>
          )}
        </div>

        {/* ── Add New Product Form ── */}
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
              {/* Barcode */}
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">
                  Barcode
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
                    <path d="M7 12h10" />
                  </svg>
                  <input
                    type="text"
                    value={newProductForm.barcode}
                    onChange={(e) =>
                      setNewProductForm({
                        ...newProductForm,
                        barcode: e.target.value.trim(),
                      })
                    }
                    onKeyDown={(e) => {
                      const barcodeVal = String(
                        newProductForm.barcode || "",
                      ).trim();
                      if (e.key === "Enter" && barcodeVal) {
                        e.preventDefault();
                        handleBarcodeScan(barcodeVal);
                      }
                    }}
                    className="w-full pl-10 pr-20 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary bg-gray-50 text-sm"
                    placeholder="Scan / ketik barcode produk"
                    autoComplete="off"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const barcodeVal = String(
                          newProductForm.barcode || "",
                        ).trim();
                        if (barcodeVal) handleBarcodeScan(barcodeVal);
                      }}
                      disabled={
                        !String(newProductForm.barcode || "").trim() ||
                        scanningBarcode
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
                  value={newProductForm.productName}
                  onChange={(e) => handleProductNameSearch(e.target.value)}
                  onFocus={() => {
                    if (searchResults.length > 0) setShowSuggestions(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  className="w-full px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  placeholder="Ketik min. 2 huruf untuk cari produk..."
                  autoComplete="off"
                />
                {showSuggestions && searchResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.map((p, idx) => (
                      <button
                        key={`${p.sku}-${idx}`}
                        type="button"
                        className="w-full text-left px-3 py-2.5 hover:bg-primary-pale transition border-b border-border last:border-b-0"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectSuggestion(p)}
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
                  value={newProductForm.sku}
                  onChange={(e) =>
                    setNewProductForm({
                      ...newProductForm,
                      sku: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  placeholder="Masukkan SKU"
                />
              </div>

              {/* Batch */}
              <div ref={batchDropdownRef} className="relative">
                <label className="block text-xs font-medium text-text-primary mb-1">
                  Batch
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={newProductForm.batch}
                    onChange={(e) => {
                      setNewProductForm({
                        ...newProductForm,
                        batch: e.target.value,
                      });
                      setShowBatchDropdown(true);
                    }}
                    onFocus={() => {
                      if (newProductForm.sku.trim()) setShowBatchDropdown(true);
                    }}
                    className="w-full px-3 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm pr-8"
                    placeholder={
                      batchesForSku.length > 0
                        ? "Pilih atau ketik batch baru..."
                        : "Masukkan batch"
                    }
                  />
                  {batchesForSku.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowBatchDropdown(!showBatchDropdown)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-primary p-0.5"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${showBatchDropdown ? "rotate-180" : ""}`}
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
                {/* Batch dropdown */}
                {showBatchDropdown && newProductForm.sku.trim() && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
                    {filteredBatches.length > 0 ? (
                      <div className="max-h-40 overflow-y-auto">
                        {filteredBatches.map((batch) => (
                          <button
                            key={batch}
                            type="button"
                            onClick={() => {
                              setNewProductForm({ ...newProductForm, batch });
                              setShowBatchDropdown(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-primary-pale/50 transition border-b border-border last:border-b-0 ${
                              newProductForm.batch === batch
                                ? "bg-primary/10 text-primary font-semibold"
                                : "text-text-primary"
                            }`}
                          >
                            {batch}
                          </button>
                        ))}
                      </div>
                    ) : newProductForm.batch.trim() ? (
                      <div className="px-3 py-2 text-xs text-text-secondary">
                        <span className="text-primary font-medium">
                          &quot;{newProductForm.batch.trim()}&quot;
                        </span>{" "}
                        — batch baru
                      </div>
                    ) : (
                      <div className="px-3 py-2 text-xs text-text-secondary">
                        Tidak ada batch untuk SKU ini
                      </div>
                    )}
                    {newProductForm.batch.trim() &&
                      !batchesForSku.includes(newProductForm.batch.trim()) &&
                      filteredBatches.length > 0 && (
                        <div className="border-t border-border px-3 py-2 bg-gray-50">
                          <button
                            type="button"
                            onClick={() => setShowBatchDropdown(false)}
                            className="text-xs text-primary font-medium hover:underline"
                          >
                            + Gunakan &quot;{newProductForm.batch.trim()}&quot;
                            sebagai batch baru
                          </button>
                        </div>
                      )}
                  </div>
                )}
              </div>

              {/* Qty */}
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">
                  Quantity
                </label>
                <QtyInput
                  value={newProductForm.qty}
                  onChange={(v) =>
                    setNewProductForm((prev) => ({ ...prev, qty: v }))
                  }
                  onExprCommit={(expr) => setNewProductFormula(expr)}
                  wide
                />
              </div>

              <button
                onClick={handleAddNewProduct}
                className="w-full bg-primary text-white py-3 rounded-xl font-semibold hover:bg-primary-light transition text-sm active:scale-[0.98]"
              >
                Tambahkan Produk
              </button>

              {/* Divider */}
              <div className="relative flex items-center gap-2 py-1">
                <div className="flex-1 border-t border-border" />
                <span className="text-[10px] text-text-secondary">atau</span>
                <div className="flex-1 border-t border-border" />
              </div>

              {/* Simpan ke Master Data saja */}
              <button
                onClick={async () => {
                  if (
                    !newProductForm.productName ||
                    !newProductForm.sku ||
                    !newProductForm.batch
                  ) {
                    toast.error("Nama Produk, SKU, dan Batch harus diisi");
                    return;
                  }
                  const allProds = [...products, ...newProducts];
                  if (
                    allProds.some(
                      (p) =>
                        p.sku === newProductForm.sku &&
                        p.batch === newProductForm.batch,
                    )
                  ) {
                    toast.error(
                      "Produk dengan SKU dan Batch yang sama sudah ada",
                    );
                    return;
                  }
                  setSavingMasterData(true);
                  try {
                    const result = await addMasterProductApi(
                      location,
                      newProductForm.productName,
                      newProductForm.sku,
                      newProductForm.batch,
                      newProductForm.barcode,
                    );
                    if (result.success) {
                      // Add to local products list
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
                      // Update cache
                      const ck = `products:${location}`;
                      setCache(ck, [...products, newProd]);
                      // Reset form
                      setNewProductForm({
                        productName: "",
                        sku: "",
                        batch: "",
                        barcode: "",
                        qty: 0,
                      });
                      setNewProductFormula("");
                      setShowAddForm(false);
                      toast.success(
                        "Produk berhasil ditambahkan ke Master Data",
                      );
                    } else {
                      toast.error(result.message || "Gagal menambahkan produk");
                    }
                  } catch (error) {
                    console.error("Add master product error:", error);
                    toast.error("Gagal menambahkan produk ke Master Data");
                  } finally {
                    setSavingMasterData(false);
                  }
                }}
                disabled={savingMasterData}
                className="w-full bg-white border-2 border-primary text-primary py-3 rounded-xl font-semibold hover:bg-primary-pale transition text-sm active:scale-[0.98] disabled:opacity-50"
              >
                {savingMasterData
                  ? "Menyimpan..."
                  : "Simpan ke Master Data Saja"}
              </button>
              <p className="text-[10px] text-text-secondary text-center -mt-1">
                Menambahkan produk ke daftar lokasi tanpa Stock Opname
              </p>

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
                      onScan={(code) => handleBarcodeScan(code)}
                      active={showBarcodeScanner}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Product Table ── */}
        {allProducts.length > 0 && (
          <div className="mb-4 bg-white rounded-2xl shadow-card overflow-hidden">
            <p className="text-[10px] text-text-secondary px-3 py-1.5 bg-gray-50 border-b border-border flex items-center gap-1">
              <svg
                className="w-3 h-3 text-accent-yellow"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6z" />
                <path d="M11 10h2v5h-2zm0 6h2v2h-2z" />
              </svg>
              Qty bisa pakai rumus: 10+5, 400-100, 10x10+5
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-primary text-white">
                    <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">
                      Produk
                    </th>
                    <th className="text-left px-2 py-2.5 font-semibold whitespace-nowrap">
                      Batch
                    </th>
                    <th className="text-center px-2 py-2.5 font-semibold whitespace-nowrap">
                      Qty
                    </th>
                    <th className="px-1 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {products.map((product, idx) => (
                    <tr
                      key={`${product.sku}-${product.batch}`}
                      className={`hover:bg-primary-pale/50 transition ${idx % 2 === 1 ? "bg-gray-50/50" : "bg-white"}`}
                    >
                      <td className="px-3 py-2 text-text-primary font-medium">
                        <span className="break-words text-[11px] leading-tight">
                          {product.productName}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-text-secondary whitespace-nowrap">
                        <div
                          className="relative"
                          ref={
                            editingBatchKey ===
                            `existing-${product.sku}-${product.batch}`
                              ? inlineBatchDropdownRef
                              : undefined
                          }
                        >
                          {editingBatchKey ===
                          `existing-${product.sku}-${product.batch}` ? (
                            <div className="relative">
                              <div className="flex items-center">
                                <input
                                  type="text"
                                  value={editingBatchValue}
                                  onChange={(e) => {
                                    setEditingBatchValue(e.target.value);
                                    setShowInlineBatchDropdown(true);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                      handleBatchSave(
                                        product.sku,
                                        product.batch,
                                        false,
                                      );
                                    if (e.key === "Escape") {
                                      setEditingBatchKey(null);
                                      setEditingBatchSku("");
                                      setShowInlineBatchDropdown(false);
                                    }
                                  }}
                                  onBlur={() => {
                                    setTimeout(() => {
                                      if (
                                        !inlineBatchDropdownRef.current?.contains(
                                          document.activeElement,
                                        )
                                      )
                                        handleBatchSave(
                                          product.sku,
                                          product.batch,
                                          false,
                                        );
                                    }, 200);
                                  }}
                                  className="w-20 pl-1.5 pr-6 py-0.5 border border-primary rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                  autoFocus
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
                              </div>
                              {showInlineBatchDropdown &&
                                inlineBatchesForSku.length > 0 && (
                                  <div className="absolute z-30 left-0 top-full mt-1 w-40 bg-white border border-border rounded-lg shadow-lg overflow-hidden">
                                    <div className="max-h-36 overflow-y-auto">
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
                                          className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-primary-pale/50 transition border-b border-border last:border-b-0 ${editingBatchValue === b ? "bg-primary/10 text-primary font-semibold" : "text-text-primary"}`}
                                        >
                                          {b}
                                        </button>
                                      ))}
                                    </div>
                                    {editingBatchValue.trim() &&
                                      !inlineBatchesForSku.includes(
                                        editingBatchValue.trim(),
                                      ) && (
                                        <div className="border-t border-border px-2.5 py-1.5 bg-green-50">
                                          <button
                                            type="button"
                                            onMouseDown={(e) =>
                                              e.preventDefault()
                                            }
                                            onClick={() =>
                                              setShowInlineBatchDropdown(false)
                                            }
                                            className="text-[10px] text-green-700 font-medium"
                                          >
                                            + Batch baru: &quot;
                                            {editingBatchValue.trim()}&quot;
                                          </button>
                                        </div>
                                      )}
                                  </div>
                                )}
                            </div>
                          ) : (
                            <span
                              className="flex items-center gap-1 group cursor-pointer"
                              onClick={() =>
                                handleBatchEdit(
                                  `existing-${product.sku}-${product.batch}`,
                                  product.batch,
                                  product.sku,
                                )
                              }
                            >
                              <span className="text-[11px]">
                                {product.batch}
                              </span>
                              <span className="text-[10px] text-text-secondary opacity-0 group-hover:opacity-100 transition">
                                ✏️
                              </span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-1 py-1 text-center">
                        <QtyInput
                          wide
                          value={
                            quantities[
                              productKey(product.sku, product.batch)
                            ] || 0
                          }
                          onChange={(v) =>
                            handleQuantityChange(
                              productKey(product.sku, product.batch),
                              v,
                            )
                          }
                          onExprCommit={(expr) =>
                            handleExprCommit(
                              productKey(product.sku, product.batch),
                              expr,
                            )
                          }
                        />
                      </td>
                      <td className="px-1 py-1 text-center">
                        <button
                          onClick={() =>
                            handleDeleteProduct(product.sku, product.batch)
                          }
                          className="w-6 h-6 rounded-full bg-red-50 text-accent-red hover:bg-accent-red hover:text-white text-[10px] font-bold transition"
                          title="Hapus"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                  {newProducts.length > 0 && (
                    <tr className="bg-primary/5">
                      <td
                        colSpan={4}
                        className="px-3 py-1.5 text-xs font-semibold text-primary"
                      >
                        Produk Baru
                      </td>
                    </tr>
                  )}
                  {newProducts.map((product, idx) => (
                    <tr
                      key={`new-${product.sku}-${product.batch}`}
                      className={`hover:bg-primary-pale/50 transition ${idx % 2 === 1 ? "bg-blue-50/30" : "bg-primary-pale/20"}`}
                    >
                      <td className="px-3 py-2 text-text-primary font-medium">
                        <span className="break-words text-[11px] leading-tight">
                          {product.productName}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-text-secondary whitespace-nowrap">
                        <div
                          className="relative"
                          ref={
                            editingBatchKey ===
                            `new-${product.sku}-${product.batch}`
                              ? inlineBatchDropdownRef
                              : undefined
                          }
                        >
                          {editingBatchKey ===
                          `new-${product.sku}-${product.batch}` ? (
                            <div className="relative">
                              <div className="flex items-center">
                                <input
                                  type="text"
                                  value={editingBatchValue}
                                  onChange={(e) => {
                                    setEditingBatchValue(e.target.value);
                                    setShowInlineBatchDropdown(true);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                      handleBatchSave(
                                        product.sku,
                                        product.batch,
                                        true,
                                      );
                                    if (e.key === "Escape") {
                                      setEditingBatchKey(null);
                                      setEditingBatchSku("");
                                      setShowInlineBatchDropdown(false);
                                    }
                                  }}
                                  onBlur={() => {
                                    setTimeout(() => {
                                      if (
                                        !inlineBatchDropdownRef.current?.contains(
                                          document.activeElement,
                                        )
                                      )
                                        handleBatchSave(
                                          product.sku,
                                          product.batch,
                                          true,
                                        );
                                    }, 200);
                                  }}
                                  className="w-20 pl-1.5 pr-6 py-0.5 border border-primary rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                  autoFocus
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
                              </div>
                              {showInlineBatchDropdown &&
                                inlineBatchesForSku.length > 0 && (
                                  <div className="absolute z-30 left-0 top-full mt-1 w-40 bg-white border border-border rounded-lg shadow-lg overflow-hidden">
                                    <div className="max-h-36 overflow-y-auto">
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
                                          className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-primary-pale/50 transition border-b border-border last:border-b-0 ${editingBatchValue === b ? "bg-primary/10 text-primary font-semibold" : "text-text-primary"}`}
                                        >
                                          {b}
                                        </button>
                                      ))}
                                    </div>
                                    {editingBatchValue.trim() &&
                                      !inlineBatchesForSku.includes(
                                        editingBatchValue.trim(),
                                      ) && (
                                        <div className="border-t border-border px-2.5 py-1.5 bg-green-50">
                                          <button
                                            type="button"
                                            onMouseDown={(e) =>
                                              e.preventDefault()
                                            }
                                            onClick={() =>
                                              setShowInlineBatchDropdown(false)
                                            }
                                            className="text-[10px] text-green-700 font-medium"
                                          >
                                            + Batch baru: &quot;
                                            {editingBatchValue.trim()}&quot;
                                          </button>
                                        </div>
                                      )}
                                  </div>
                                )}
                            </div>
                          ) : (
                            <span
                              className="flex items-center gap-1 group cursor-pointer"
                              onClick={() =>
                                handleBatchEdit(
                                  `new-${product.sku}-${product.batch}`,
                                  product.batch,
                                  product.sku,
                                )
                              }
                            >
                              <span className="text-[11px]">
                                {product.batch}
                              </span>
                              <span className="text-[10px] text-text-secondary opacity-0 group-hover:opacity-100 transition">
                                ✏️
                              </span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-1 py-1 text-center">
                        <QtyInput
                          wide
                          value={
                            quantities[
                              productKey(product.sku, product.batch)
                            ] || 0
                          }
                          onChange={(v) =>
                            handleQuantityChange(
                              productKey(product.sku, product.batch),
                              v,
                            )
                          }
                          onExprCommit={(expr) =>
                            handleExprCommit(
                              productKey(product.sku, product.batch),
                              expr,
                            )
                          }
                        />
                      </td>
                      <td className="px-1 py-1 text-center">
                        <button
                          onClick={() =>
                            handleDeleteNewProduct(product.sku, product.batch)
                          }
                          className="w-6 h-6 rounded-full bg-red-50 text-accent-red hover:bg-accent-red hover:text-white text-[10px] font-bold transition"
                          title="Hapus"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Save Button (Fixed) ── */}
        <div className="fixed bottom-20 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-border">
          <button
            onClick={handleSave}
            disabled={saving || totalItems === 0}
            className="w-full bg-primary text-white py-3.5 rounded-2xl font-semibold hover:bg-primary-light transition disabled:opacity-50 disabled:cursor-not-allowed shadow-card active:scale-[0.98]"
          >
            {saving ? <LoadingSpinner /> : `Simpan (${totalItems} item)`}
          </button>
        </div>
      </div>

      <BottomNav activePage="scan" />

      {/* ── Move Location Modal ── */}
      {showMoveModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowMoveModal(false)}
        >
          <div
            className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 pt-5 pb-3 border-b border-border">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-amber-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  Pindah Lokasi
                </h2>
                <button
                  onClick={() => setShowMoveModal(false)}
                  className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-text-secondary text-sm"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-text-secondary">
                Pindahkan produk dari{" "}
                <span className="font-semibold text-primary">{location}</span>{" "}
                ke lokasi lain
              </p>
            </div>

            {/* Modal Body */}
            <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
              {/* Target Location */}
              <div ref={moveLocRef} className="relative">
                <label className="block text-xs font-medium text-text-primary mb-1">
                  Lokasi Tujuan
                </label>
                <input
                  type="text"
                  value={moveTarget}
                  onChange={(e) => handleMoveLocSearch(e.target.value)}
                  onFocus={() => {
                    if (moveLocSuggestions.length > 0)
                      setShowMoveLocSuggestions(true);
                  }}
                  placeholder="Ketik kode lokasi tujuan..."
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
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
                        className="w-full text-left px-3 py-2 text-sm hover:bg-primary-pale/50 border-b border-border last:border-b-0 flex justify-between"
                      >
                        <span className="font-medium text-text-primary">
                          {loc.locationCode}
                        </span>
                        <span className="text-xs text-text-secondary">
                          {loc.productCount} produk
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Move Mode */}
              <div>
                <label className="block text-xs font-medium text-text-primary mb-2">
                  Mode Pindah
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMoveMode("all")}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition border ${moveMode === "all" ? "bg-amber-500 text-white border-amber-500" : "bg-white text-text-primary border-border hover:border-amber-300"}`}
                  >
                    Semua Produk ({products.length})
                  </button>
                  <button
                    onClick={() => setMoveMode("select")}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition border ${moveMode === "select" ? "bg-amber-500 text-white border-amber-500" : "bg-white text-text-primary border-border hover:border-amber-300"}`}
                  >
                    Pilih Produk
                  </button>
                </div>
              </div>

              {/* Product Selection (when mode=select) */}
              {moveMode === "select" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-text-primary">
                      Pilih Produk ({moveSelected.size}/{products.length})
                    </label>
                    <button
                      onClick={() => {
                        if (moveSelected.size === products.length) {
                          setMoveSelected(new Set());
                        } else {
                          setMoveSelected(
                            new Set(
                              products.map((p) => productKey(p.sku, p.batch)),
                            ),
                          );
                        }
                      }}
                      className="text-[10px] text-primary font-medium hover:underline"
                    >
                      {moveSelected.size === products.length
                        ? "Batal Semua"
                        : "Pilih Semua"}
                    </button>
                  </div>
                  <div className="border border-border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {products.map((product, idx) => {
                      const key = productKey(product.sku, product.batch);
                      const isSelected = moveSelected.has(key);
                      return (
                        <button
                          key={key}
                          onClick={() =>
                            toggleMoveSelect(product.sku, product.batch)
                          }
                          className={`w-full text-left px-3 py-2 flex items-center gap-2.5 border-b border-border last:border-b-0 transition ${isSelected ? "bg-amber-50" : idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                        >
                          <div
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition ${isSelected ? "bg-amber-500 border-amber-500" : "border-gray-300"}`}
                          >
                            {isSelected && (
                              <svg
                                className="w-3 h-3 text-white"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                              >
                                <path d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-text-primary truncate">
                              {product.productName}
                            </p>
                            <p className="text-[10px] text-text-secondary">
                              SKU: {product.sku} | Batch: {product.batch}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                <div className="flex items-start gap-2">
                  <svg
                    className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                  <div className="text-[11px] text-amber-800">
                    <p className="font-semibold mb-0.5">
                      {moveMode === "all"
                        ? `${products.length} produk akan dipindah`
                        : `${moveSelected.size} produk akan dipindah`}
                    </p>
                    <p>
                      Dari: <span className="font-semibold">{location}</span>
                    </p>
                    <p>
                      Ke:{" "}
                      <span className="font-semibold">
                        {moveTarget.trim().toUpperCase() || "..."}
                      </span>
                    </p>
                    <p className="mt-1 text-amber-600">
                      Produk yang sudah ada di lokasi tujuan akan dilewati.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 border-t border-border flex gap-3">
              <button
                onClick={() => setShowMoveModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-text-primary hover:bg-gray-50 transition"
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
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {movingProducts ? (
                  <LoadingSpinner />
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                    Pindahkan
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InputPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <LoadingSpinner />
        </div>
      }
    >
      <InputPageContent />
    </Suspense>
  );
}
