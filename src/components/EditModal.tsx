"use client";

import { useState, useEffect, useMemo } from "react";
import { HistoryEntry, Product } from "@/lib/types";
import { lookupBarcodeApi, searchProductsApi, searchLocationsApi } from "@/lib/api";
import ScannerModal from "@/components/ScannerModal";
import QtyInput from "@/components/QtyInput";
import { Dialog, Field } from "@/components/ui";
import Autocomplete from "@/components/Autocomplete";
import FormulaBreakdown from "@/components/FormulaBreakdown";
import { CameraIcon, SearchIcon, ChevronDownIcon } from "@/components/icons";
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
  const [invalidQuantity, setInvalidQuantity] = useState(false);
  const [productName, setProductName] = useState(entry.productName);
  const [sku, setSku] = useState(entry.sku);
  const [batch, setBatch] = useState(entry.batch);
  const [location, setLocation] = useState(entry.location);
  const [barcode, setBarcode] = useState("");
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    sku?: string;
    batch?: string;
    location?: string;
  }>({});

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

  const filteredBatches = useMemo(() => {
    const q = batch.trim().toLowerCase();
    if (!q) return batchesForSku;
    if (batchesForSku.some((b) => b.toLowerCase() === q)) return batchesForSku;
    return batchesForSku.filter((b) => b.toLowerCase().includes(q));
  }, [batch, batchesForSku]);

  useEffect(() => {
    if (isOpen) {
      setQuantity(entry.qty);
      setInvalidQuantity(false);
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

  const locChanged =
    location.trim().toUpperCase() !== entry.location.trim().toUpperCase();

  const handleSave = () => {
    if (invalidQuantity) return;
    const nextErrors: typeof errors = {};
    if (!productName.trim()) nextErrors.name = "Nama produk wajib diisi";
    if (!sku.trim()) nextErrors.sku = "SKU wajib diisi";
    if (locChanged && !location.trim())
      nextErrors.location = "Lokasi tidak boleh kosong";
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
        description={`${entry.location} · ${entry.sku}`}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded hover:bg-slate-100 transition"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={invalidQuantity}
              className="flex-1 h-9 bg-[#2E5339] hover:bg-[#3D6E4C] text-white text-xs font-semibold rounded transition disabled:opacity-40"
            >
              Simpan Perubahan
            </button>
          </div>
        }
      >
        <div className="space-y-2.5">
          {/* Lokasi & Barcode dalam 2 kolom padat atau berurutan */}
          <div className="grid grid-cols-2 gap-2">
            <Autocomplete<{ locationCode: string; productCount: number }>
              id="edit-location"
              label="Lokasi Rak"
              value={location}
              onValueChange={(v) => {
                setLocation(v);
                setErrors((e) => ({ ...e, location: undefined }));
              }}
              resolve={async (q) => {
                try {
                  const result = await searchLocationsApi(q);
                  return result.success && result.locations
                    ? result.locations
                    : [];
                } catch {
                  return [];
                }
              }}
              getKey={(l) => l.locationCode}
              renderItem={(l) => (
                <div className="flex items-center justify-between gap-2 w-full min-w-0">
                  <span className="font-mono font-bold text-slate-900 uppercase truncate flex-1 min-w-0">
                    {l.locationCode}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 shrink-0">
                    {l.productCount}
                  </span>
                </div>
              )}
              onSelect={(l) => setLocation(l.locationCode)}
              placeholder="Kode rak"
              uppercase
              minChars={1}
              emptyText="Lokasi tidak ditemukan"
              hint={
                locChanged
                  ? `${entry.location} → ${location.trim().toUpperCase()}`
                  : undefined
              }
              error={errors.location}
            />

            <Field id="edit-barcode" label="Scan / Cari Barcode">
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
                  className="w-full h-9 pl-2.5 pr-16 bg-slate-50 border border-slate-300 rounded font-mono text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-[#2E5339]"
                  placeholder="Barcode…"
                  autoComplete="off"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => barcode && handleBarcodeScan(barcode)}
                    disabled={!barcode || scanningBarcode}
                    className="w-7 h-7 rounded bg-white border border-slate-300 flex items-center justify-center text-slate-700 disabled:opacity-40"
                    aria-label="Cari barcode"
                  >
                    <SearchIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBarcodeScanner(true)}
                    disabled={scanningBarcode}
                    className="w-7 h-7 rounded bg-[#2E5339] text-white flex items-center justify-center disabled:opacity-40"
                    aria-label="Pindai barcode dengan kamera"
                  >
                    <CameraIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </Field>
          </div>

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
                <p className="font-semibold text-slate-900 text-xs">{p.productName}</p>
                <p className="font-mono text-[11px] text-slate-500">
                  SKU: {p.sku} | Batch: {p.batch}
                </p>
              </>
            )}
            onSelect={handleSelectProduct}
            placeholder="Ketik min. 2 huruf…"
            minChars={2}
            debounceMs={150}
            emptyText="Produk tidak ditemukan"
            error={errors.name}
          />

          {/* SKU & Batch */}
          <div className="grid grid-cols-2 gap-2">
            <Field id="edit-sku" label="SKU" required error={errors.sku}>
              <input
                id="edit-sku"
                type="text"
                value={sku}
                onChange={(e) => {
                  setSku(e.target.value);
                  setErrors((er) => ({ ...er, sku: undefined }));
                }}
                className="w-full h-9 px-2.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-[#2E5339]"
              />
            </Field>

            <Field id="edit-batch" label="Batch" error={errors.batch}>
              <div className="relative">
                <input
                  id="edit-batch"
                  type="text"
                  value={batch}
                  onChange={(e) => {
                    setBatch(e.target.value);
                    setErrors((er) => ({ ...er, batch: undefined }));
                  }}
                  className="w-full h-9 pl-2.5 pr-8 bg-slate-50 border border-slate-300 rounded font-mono text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-[#2E5339]"
                  placeholder="Batch"
                />
                {batchesForSku.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const next =
                        filteredBatches[
                          (filteredBatches.indexOf(batch) + 1) %
                            filteredBatches.length
                        ];
                      setBatch(next);
                    }}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-slate-500 hover:text-[#2E5339]"
                    aria-label="Siklus pilihan batch"
                  >
                    <ChevronDownIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </Field>
          </div>

          {batchesForSku.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {filteredBatches.slice(0, 5).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBatch(b)}
                  className={`h-6 px-2 rounded font-mono text-[11px] font-semibold border transition ${
                    batch === b
                      ? "bg-[#2E5339] text-white border-[#2E5339]"
                      : "bg-[#EAF2EB] text-[#2E5339] border-[#BDD7C4] hover:bg-[#D6E8DC]"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          )}

          {/* Quantity */}
          <div className="pt-1 border-t border-slate-200">
            <p className="text-xs font-semibold text-slate-700 mb-1">
              Jumlah / Rumus Hitung
            </p>
            <QtyInput
              value={quantity}
              onChange={(v) => setQuantity(v)}
              onExprCommit={(expr) => setFormula(expr)}
              onValidityChange={(valid) => setInvalidQuantity(!valid)}
              wide
              ariaLabel="Kuantitas entri"
            />
            {invalidQuantity && (
              <p className="text-[11px] font-semibold text-[#DC2626] mt-1">
                Lengkapi angka dan rumus sebelum menyimpan.
              </p>
            )}
            <FormulaBreakdown formula={formula} quantity={quantity} />
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
