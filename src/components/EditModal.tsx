"use client";

import { useState, useEffect, useMemo } from "react";
import { HistoryEntry, Product } from "@/lib/types";
import { lookupBarcodeApi, searchProductsApi, searchLocationsApi } from "@/lib/api";
import ScannerModal from "@/components/ScannerModal";
import QtyInput from "@/components/QtyInput";
import { Dialog, Field } from "@/components/ui";
import Autocomplete from "@/components/Autocomplete";
import { CalculatorIcon } from "@/components/icons";
import toast from "react-hot-toast";

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
  const [barcode, setBarcode] = useState("");
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; sku?: string; batch?: string; location?: string }>({});

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

  useEffect(() => {
    if (isOpen) {
      setQuantity(entry.qty);
      setFormula(entry.formula || "");
      setProductName(entry.productName);
      setSku(entry.sku);
      setBatch(entry.batch);
      setLocation(entry.location);
      setBarcode("");
      setErrors({});
      setShowBarcodeScanner(false);
      setScanningBarcode(false);
    }
  }, [entry, isOpen]);

  const resolveProductNames = async (query: string): Promise<Product[]> => {
    try {
      const result = await searchProductsApi(query.trim());
      return result.success && result.products ? result.products : [];
    } catch {
      return [];
    }
  };

  const handleSelectProduct = (product: Product) => {
    setProductName(product.productName);
    setSku(product.sku);
    setBatch(product.batch);
    setErrors({});
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
      } else {
        toast.error(result.message || "Barcode tidak ditemukan");
      }
    } catch (error) {
      console.error("Barcode lookup error:", error);
      toast.error("Gagal mencari barcode");
    } finally {
      setScanningBarcode(false);
    }
  };

  const locChanged = location.trim().toUpperCase() !== entry.location.trim().toUpperCase();

  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!productName.trim()) nextErrors.name = "Nama produk wajib diisi";
    if (!sku.trim()) nextErrors.sku = "SKU wajib diisi";
    if (!batch.trim()) nextErrors.batch = "Batch wajib diisi (isi - bila memang tanpa batch)";
    if (locChanged && !location.trim()) nextErrors.location = "Lokasi tidak boleh kosong";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSave({
      newQty: quantity,
      productName: productName.trim(),
      sku: sku.trim(),
      batch: batch.trim(),
      formula,
      location: locChanged ? location.trim().toUpperCase() : undefined,
    });
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={scanningBarcode ? () => {} : onClose}
        title="Edit Entri Opname"
        description={entry.productName}
        footer={
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-touch bg-surface-warm text-text-primary text-meta font-bold rounded-input transition active:scale-[0.98]"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 min-h-touch bg-primary text-ivory text-meta font-bold rounded-input transition active:scale-[0.98]"
            >
              Simpan Perubahan
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Lokasi */}
          <Autocomplete<{ locationCode: string; productCount: number }>
            id="edit-location"
            label="Lokasi"
            value={location}
            onValueChange={(v) => {
              setLocation(v);
              setErrors((e) => ({ ...e, location: undefined }));
            }}
            resolve={async (q) => {
              try {
                const result = await searchLocationsApi(q);
                return result.success && result.locations ? result.locations : [];
              } catch {
                return [];
              }
            }}
            getKey={(l) => l.locationCode}
            renderItem={(l) => (
              <div className="flex items-center justify-between gap-2 w-full min-w-0">
                <span className="font-bold text-text-primary uppercase truncate flex-1 min-w-0">{l.locationCode}</span>
                <span className="text-meta text-text-secondary shrink-0 pl-2">{l.productCount} produk</span>
              </div>
            )}
            onSelect={(l) => setLocation(l.locationCode)}
            placeholder="Kode lokasi"
            uppercase
            minChars={1}
            emptyText="Lokasi tidak ditemukan"
            hint={
              locChanged
                ? `Lokasi berubah: ${entry.location} → ${location.trim().toUpperCase()}`
                : undefined
            }
            error={errors.location}
          />

          {/* Barcode */}
          <Field id="edit-barcode" label="Barcode" hint="Pindai atau ketik untuk mencari produk.">
            <div className="relative flex items-center">
              <input
                id="edit-barcode"
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value.trim())}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && barcode) {
                    e.preventDefault();
                    handleBarcodeScan(barcode);
                  }
                }}
                className="w-full min-h-touch pl-3 pr-24 bg-surface-warm border border-border rounded-input text-meta font-semibold text-text-primary"
                placeholder="Scan / ketik barcode"
                autoComplete="off"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => barcode && handleBarcodeScan(barcode)}
                  disabled={!barcode || scanningBarcode}
                  className="w-11 h-11 rounded-input bg-paper border border-border flex items-center justify-center text-primary disabled:opacity-50 active:scale-95 transition"
                  aria-label="Cari barcode"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setShowBarcodeScanner(true)}
                  disabled={scanningBarcode}
                  className="w-11 h-11 rounded-input bg-primary text-ivory flex items-center justify-center disabled:opacity-50 active:scale-95 transition"
                  aria-label="Pindai barcode dengan kamera"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </button>
              </div>
            </div>
          </Field>

          {/* Nama Produk */}
          <Autocomplete<Product>
            id="edit-product-name"
            label="Nama Produk"
            value={productName}
            onValueChange={(v) => {
              setProductName(v);
              setErrors((e) => ({ ...e, name: undefined }));
            }}
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
            onSelect={handleSelectProduct}
            placeholder="Ketik min. 2 huruf untuk mencari…"
            minChars={2}
            debounceMs={180}
            emptyText="Produk tidak ditemukan"
            error={errors.name}
          />

          {/* SKU & Batch */}
          <div className="grid grid-cols-2 gap-3">
            <Field id="edit-sku" label="SKU" required error={errors.sku}>
              <input
                id="edit-sku"
                type="text"
                value={sku}
                onChange={(e) => {
                  setSku(e.target.value);
                  setErrors((er) => ({ ...er, sku: undefined }));
                }}
                className="w-full min-h-touch px-3 bg-surface-warm border border-border rounded-input text-meta font-semibold text-text-primary"
              />
            </Field>

            <Field id="edit-batch" label="Batch" required error={errors.batch}>
              <div className="relative">
                <input
                  id="edit-batch"
                  type="text"
                  value={batch}
                  onChange={(e) => {
                    setBatch(e.target.value);
                    setErrors((er) => ({ ...er, batch: undefined }));
                  }}
                  className="w-full min-h-touch pl-3 pr-10 bg-surface-warm border border-border rounded-input text-meta font-semibold text-text-primary"
                  placeholder="Batch"
                />
                {batchesForSku.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      // pilih batch pertama yang tersedia, siklus berikutnya
                      const next = filteredBatches[(filteredBatches.indexOf(batch) + 1) % filteredBatches.length];
                      setBatch(next);
                    }}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-text-secondary hover:text-primary active:scale-95 transition"
                    aria-label="Tampilkan pilihan batch"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                )}

                {batchesForSku.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {filteredBatches.slice(0, 4).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBatch(b)}
                        className={`px-2 py-1 rounded-label text-meta font-bold border ${
                          batch === b
                            ? "bg-primary text-ivory border-primary"
                            : "bg-surface-warm text-text-primary border-border"
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Field>
          </div>

          {/* Quantity */}
          <div>
            <p className="text-meta font-bold text-text-primary mb-1">Quantity</p>
            <QtyInput
              value={quantity}
              onChange={(v) => setQuantity(v)}
              onExprCommit={(expr) => setFormula(expr)}
              wide
              ariaLabel="Kuantitas entri"
            />
            {formula && (
              <p className="inline-flex items-center gap-1 text-meta text-amber-text mt-1.5 font-bold tnum">
                <CalculatorIcon className="w-4 h-4" aria-hidden="true" /> Rumus: {formula}
              </p>
            )}
          </div>
        </div>
      </Dialog>

      <ScannerModal
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onScan={handleBarcodeScan}
        title="Pindai Barcode Produk"
      />
    </>
  );
}
