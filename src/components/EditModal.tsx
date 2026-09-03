"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { HistoryEntry, Product } from "@/lib/types";
import { lookupBarcodeApi, searchProductsApi, searchLocationsApi } from "@/lib/api";
import BarcodeScanner from "./BarcodeScanner";
import QtyInput from "./QtyInput";

export interface EditData {
  newQty: number;
  productName: string;
  sku: string;
  batch: string;
  formula?: string;
  location?: string;
}

interface EditModalProps {
  entry: HistoryEntry;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: EditData) => void;
  allProducts?: Product[];
}

export default function EditModal({
  entry,
  isOpen,
  onClose,
  onSave,
  allProducts,
}: EditModalProps) {
  const [quantity, setQuantity] = useState(entry.qty);
  const [formula, setFormula] = useState(entry.formula || "");
  const [productName, setProductName] = useState(entry.productName);
  const [sku, setSku] = useState(entry.sku);
  const [batch, setBatch] = useState(entry.batch);
  const [location, setLocation] = useState(entry.location);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTimer, setSearchTimer] = useState<NodeJS.Timeout | null>(null);
  const [barcode, setBarcode] = useState("");
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [showBatchDropdown, setShowBatchDropdown] = useState(false);
  const batchDropdownRef = useRef<HTMLDivElement>(null);
  const [locSuggestions, setLocSuggestions] = useState<{ locationCode: string; productCount: number }[]>([]);
  const [showLocSuggestions, setShowLocSuggestions] = useState(false);
  const [locSearchTimer, setLocSearchTimer] = useState<NodeJS.Timeout | null>(null);
  const locRef = useRef<HTMLDivElement>(null);

  // Get unique batches for current SKU from allProducts
  const batchesForSku = useMemo(() => {
    const skuVal = sku.trim().toLowerCase();
    if (!skuVal || !allProducts) return [];
    const batchSet = new Set<string>();
    allProducts.forEach((p) => {
      if (p.sku.trim().toLowerCase() === skuVal && p.batch) {
        batchSet.add(p.batch);
      }
    });
    return Array.from(batchSet).sort();
  }, [sku, allProducts]);

  // Filtered batches based on current input
  const filteredBatches = useMemo(() => {
    const q = batch.trim().toLowerCase();
    if (!q) return batchesForSku;
    if (batchesForSku.some((b) => b.toLowerCase() === q)) return batchesForSku;
    return batchesForSku.filter((b) => b.toLowerCase().includes(q));
  }, [batch, batchesForSku]);

  // Close batch dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (batchDropdownRef.current && !batchDropdownRef.current.contains(e.target as Node)) {
        setShowBatchDropdown(false);
      }
      if (locRef.current && !locRef.current.contains(e.target as Node)) {
        setShowLocSuggestions(false);
      }
    };
    if (showBatchDropdown || showLocSuggestions) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showBatchDropdown, showLocSuggestions]);

  useEffect(() => {
    setQuantity(entry.qty);
    setFormula(entry.formula || "");
    setProductName(entry.productName);
    setSku(entry.sku);
    setBatch(entry.batch);
    setLocation(entry.location);
    setBarcode("");
    setShowBarcodeScanner(false);
    setShowBatchDropdown(false);
    setLocSuggestions([]);
    setShowLocSuggestions(false);
  }, [entry]);

  if (!isOpen) return null;

  const handleProductSearch = (value: string) => {
    setProductName(value);
    if (searchTimer) clearTimeout(searchTimer);
    if (value.trim().length < 2) {
      setSearchResults([]);
      setShowSuggestions(false);
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
    }, 180);
    setSearchTimer(timer);
  };

  const handleSelectProduct = (product: Product) => {
    setProductName(product.productName);
    setSku(product.sku);
    setBatch(product.batch);
    setShowSuggestions(false);
    setSearchResults([]);
  };

  const handleBarcodeScan = async (barcodeValue: string) => {
    const normalized = String(barcodeValue || "").trim();
    if (!normalized) return;

    setBarcode(normalized);
    setShowBarcodeScanner(false);
    setScanningBarcode(true);
    try {
      const result = await lookupBarcodeApi(normalized);
      if (result.success && result.product) {
        setProductName(result.product.productName);
        setSku(result.product.sku);
        setBatch(result.product.batch || "");
      }
    } catch (error) {
      console.error("Barcode lookup error:", error);
    } finally {
      setScanningBarcode(false);
    }
  };

  const handleLocSearch = (value: string) => {
    setLocation(value);
    if (locSearchTimer) clearTimeout(locSearchTimer);
    if (value.trim().length < 2) {
      setLocSuggestions([]);
      setShowLocSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await searchLocationsApi(value.trim());
        if (result.success && result.locations) {
          setLocSuggestions(result.locations);
          setShowLocSuggestions(result.locations.length > 0);
        }
      } catch (err) {
        console.error("Location search error:", err);
      }
    }, 200);
    setLocSearchTimer(timer);
  };

  const handleSave = () => {
    if (quantity < 0) return;
    const locChanged = location.trim().toUpperCase() !== entry.location.trim().toUpperCase();
    onSave({
      newQty: quantity,
      productName,
      sku,
      batch,
      formula,
      location: locChanged ? location.trim().toUpperCase() : undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-3 sm:hidden" />

        <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">Edit Entri Opname</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-warm hover:bg-gray-200 text-text-secondary flex items-center justify-center text-sm transition active:scale-95"
          >
            ✕
          </button>
        </div>

        {/* Lokasi */}
        <div ref={locRef} className="mb-3 relative">
          <label className="block text-xs font-semibold text-text-primary mb-1">Lokasi:</label>
          <input
            type="text"
            value={location}
            onChange={(e) => handleLocSearch(e.target.value)}
            onFocus={() => {
              if (locSuggestions.length > 0) setShowLocSuggestions(true);
            }}
            className="w-full px-3 py-2.5 bg-surface-warm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary uppercase text-sm font-semibold"
            placeholder="Kode lokasi"
          />
          {location.trim().toUpperCase() !== entry.location.trim().toUpperCase() && (
            <p className="text-[11px] text-accent-yellow mt-1 font-medium">
              ⚠️ Lokasi berubah: {entry.location} → {location.trim().toUpperCase()}
            </p>
          )}
          {showLocSuggestions && locSuggestions.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg max-h-40 overflow-y-auto">
              {locSuggestions.map((loc) => (
                <button
                  key={loc.locationCode}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setLocation(loc.locationCode);
                    setShowLocSuggestions(false);
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-primary-pale transition border-b border-border last:border-b-0 flex justify-between items-center ${
                    location.trim().toUpperCase() === loc.locationCode.toUpperCase() ? "bg-primary/10 text-primary font-bold" : ""
                  }`}
                >
                  <span className="font-semibold text-xs">{loc.locationCode}</span>
                  <span className="text-[10px] text-text-secondary">({loc.productCount} produk)</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Barcode & Nama Produk */}
        <div className="mb-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">Barcode</label>
            <div className="relative">
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value.trim())}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && barcode) {
                    e.preventDefault();
                    handleBarcodeScan(barcode);
                  }
                }}
                className="w-full pl-3 pr-20 py-2 bg-surface-warm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-xs"
                placeholder="Scan / ketik barcode"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleBarcodeScan(barcode)}
                  disabled={!barcode || scanningBarcode}
                  className="w-7 h-7 rounded-lg bg-white border border-border flex items-center justify-center text-primary disabled:opacity-50"
                  title="Cari"
                >
                  🔍
                </button>
                <button
                  type="button"
                  onClick={() => setShowBarcodeScanner(true)}
                  disabled={scanningBarcode}
                  className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center disabled:opacity-50"
                  title="Scan"
                >
                  📷
                </button>
              </div>
            </div>
          </div>

          <div className="relative">
            <label className="block text-xs font-semibold text-text-primary mb-1">Nama Produk:</label>
            <input
              type="text"
              value={productName}
              onChange={(e) => handleProductSearch(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setShowSuggestions(true);
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="w-full px-3 py-2 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-xs"
              placeholder="Ketik min. 2 huruf untuk cari..."
              autoComplete="off"
            />
            {showSuggestions && searchResults.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg max-h-40 overflow-y-auto">
                {searchResults.map((p, idx) => (
                  <button
                    key={`${p.sku}-${idx}`}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-primary-pale transition border-b border-border last:border-b-0"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectProduct(p)}
                  >
                    <p className="font-semibold text-text-primary text-xs">{p.productName}</p>
                    <p className="text-[10px] text-text-secondary">
                      SKU: {p.sku} | Batch: {p.batch}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">SKU:</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-xs"
              />
            </div>

            <div ref={batchDropdownRef} className="relative">
              <label className="block text-xs font-semibold text-text-primary mb-1">Batch:</label>
              <div className="relative">
                <input
                  type="text"
                  value={batch}
                  onChange={(e) => {
                    setBatch(e.target.value);
                    setShowBatchDropdown(true);
                  }}
                  onFocus={() => {
                    if (sku.trim()) setShowBatchDropdown(true);
                  }}
                  className="w-full px-3 py-2 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-xs pr-7"
                  placeholder="Batch"
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
              {showBatchDropdown && sku.trim() && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
                  {filteredBatches.length > 0 ? (
                    <div className="max-h-36 overflow-y-auto">
                      {filteredBatches.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => {
                            setBatch(b);
                            setShowBatchDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-primary-pale transition border-b border-border last:border-b-0 ${
                            batch === b ? "bg-primary/10 text-primary font-bold" : "text-text-primary"
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-2 text-[11px] text-text-secondary">Batch baru: &quot;{batch.trim()}&quot;</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">Quantity:</label>
            <QtyInput
              value={quantity}
              onChange={(v) => setQuantity(v)}
              onExprCommit={(expr) => setFormula(expr)}
              wide
            />
            {formula && (
              <p className="text-[11px] text-primary mt-1 font-semibold">🧮 Rumus: {formula}</p>
            )}
          </div>
        </div>

        <div className="flex gap-2.5 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-surface-warm text-text-primary text-sm font-semibold rounded-xl hover:bg-gray-200 transition active:scale-[0.98]"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-3 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary-light transition shadow-md active:scale-[0.98]"
          >
            Simpan Perubahan
          </button>
        </div>

        {showBarcodeScanner && (
          <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl p-4 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-text-primary text-sm">Scan Barcode Produk</h3>
                <button
                  onClick={() => setShowBarcodeScanner(false)}
                  className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
                >
                  ✕
                </button>
              </div>
              <BarcodeScanner onScan={handleBarcodeScan} active={showBarcodeScanner} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
