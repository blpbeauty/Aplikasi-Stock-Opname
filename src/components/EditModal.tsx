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
    const skuVal = String(sku || "").trim().toLowerCase();
    if (!skuVal || !allProducts) return [];
    const batchSet = new Set<string>();
    allProducts.forEach((p) => {
      if (p && String(p.sku || "").trim().toLowerCase() === skuVal && p.batch) {
        batchSet.add(String(p.batch));
      }
    });
    return Array.from(batchSet).sort();
  }, [sku, allProducts]);

  const filteredBatches = useMemo(() => {
    const q = String(batch || "").trim().toLowerCase();
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
    String(location || "").trim().toUpperCase() !== String(entry?.location || "").trim().toUpperCase();

  const handleSave = () => {
    if (invalidQuantity) return;
    const nextErrors: typeof errors = {};
    const trimmedName = String(productName || "").trim();
    const trimmedSku = String(sku || "").trim();
    const trimmedBatch = String(batch || "").trim();
    const trimmedLoc = String(location || "").trim().toUpperCase();

    if (!trimmedName) nextErrors.name = "Nama produk wajib diisi";
    if (!trimmedSku) nextErrors.sku = "SKU wajib diisi";
    if (locChanged && !trimmedLoc)
      nextErrors.location = "Lokasi tidak boleh kosong";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSave({
      newQty: quantity,
      productName: trimmedName,
      sku: trimmedSku,
      batch: trimmedBatch,
      formula,
      location: locChanged ? trimmedLoc : undefined,
    });
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={scanningBarcode ? () => { } : onClose}
        title="Edit Entri Opname"
        description={`${entry.location} · ${entry.sku}`}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 bg-[#EEFBFB] border border-[#9CE0DF]/80 hover:bg-[#D5F4F3] text-[#0D3B40] text-xs font-semibold rounded-xl transition-all duration-150 active:scale-[0.98]"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={invalidQuantity}
              className="flex-1 h-9 bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white text-xs font-semibold rounded-xl shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)] transition-all duration-150 active:scale-[0.98] disabled:opacity-40"
            >
              Simpan Perubahan
            </button>
          </div>
        }
      >
        <div className="space-y-2.5">
          {/* Lokasi & Scan Barcode (Compact stacked for HP) */}
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
                <span className="font-mono font-semibold text-[#0D3B40] uppercase truncate flex-1 min-w-0">
                  {l.locationCode}
                </span>
                <span className="font-mono text-xs text-[#487277] shrink-0">
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
            <div className="flex items-center gap-1.5">
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
                className="flex-1 min-w-0 h-9 px-3 bg-[#EEFBFB] border border-[#9CE0DF]/80 rounded-xl font-mono text-[13px] text-[#0D3B40] placeholder:text-[#6B9498] focus:bg-white focus:outline-none focus:border-[#0E838C] focus:ring-2 focus:ring-[#14B8A6]/20"
                placeholder="Barcode…"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => barcode && handleBarcodeScan(barcode)}
                disabled={!barcode || scanningBarcode}
                className="w-9 h-9 shrink-0 rounded-xl bg-white border border-[#9CE0DF]/80 hover:bg-[#EEFBFB] flex items-center justify-center text-[#0D3B40] disabled:opacity-40 active:scale-[0.97] transition-all"
                aria-label="Cari barcode"
              >
                <SearchIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowBarcodeScanner(true)}
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
                <p className="font-semibold text-[#0D3B40] text-[13px] leading-snug">{p.productName}</p>
                <p className="font-mono text-[11px] text-[#487277] mt-0.5">
                  SKU: {p.sku} · Batch: {p.batch}
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
                className="w-full h-9 px-3 bg-[#EEFBFB] border border-[#9CE0DF]/80 rounded-xl font-mono text-[13px] font-semibold text-[#0D3B40] focus:bg-white focus:outline-none focus:border-[#0E838C] focus:ring-2 focus:ring-[#14B8A6]/20"
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
                  className="w-full h-9 pl-3 pr-9 bg-[#EEFBFB] border border-[#9CE0DF]/80 rounded-xl font-mono text-[13px] font-semibold text-[#0D3B40] focus:bg-white focus:outline-none focus:border-[#0E838C] focus:ring-2 focus:ring-[#14B8A6]/20"
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
                    className="absolute right-0 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-[#487277] hover:text-[#0E838C]"
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
                  className={`h-7 px-2.5 rounded-lg font-mono text-[11px] font-semibold border transition-colors active:scale-[0.98] ${batch === b
                    ? "bg-gradient-to-r from-[#0E838C] to-[#14B8A6] text-white border-[#0E838C]"
                    : "bg-[#D5F4F3] text-[#0B666E] border-[#82D6D5]/75 hover:bg-[#C2ECEB]"
                    }`}
                >
                  {b}
                </button>
              ))}
            </div>
          )}

          {/* Quantity */}
          <div className="pt-1.5 border-t border-[#9BE0DF]/55">
            <p className="text-[11px] font-semibold text-[#487277] mb-1">
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
              <p className="text-xs font-semibold text-[#DC2626] mt-1.5">
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
