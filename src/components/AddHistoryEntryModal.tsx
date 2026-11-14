"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Product, HistoryEntry } from "@/lib/types";
import {
  lookupBarcodeApi,
  searchProductsApi,
  searchLocationsApi,
  saveStockOpnameApi,
} from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import ScannerModal from "@/components/ScannerModal";
import BatchPickerModal from "@/components/BatchPickerModal";
import QtyInput from "@/components/QtyInput";
import { Dialog, Field } from "@/components/ui";
import Autocomplete from "@/components/Autocomplete";
import { scrollElementCenter } from "@/lib/scroll";
import { getSkuBatchInfo } from "@/lib/batch";
import { CalculatorIcon, CameraIcon, SearchIcon, ChevronDownIcon } from "@/components/icons";
import toast from "react-hot-toast";

interface AddHistoryEntryModalProps {
  isOpen: boolean;
  initialLocation: string;
  onClose: () => void;
  onSuccess: (entry: HistoryEntry) => void;
  allProducts?: Product[];
}

export default function AddHistoryEntryModal({
  isOpen,
  initialLocation,
  onClose,
  onSuccess,
  allProducts,
}: AddHistoryEntryModalProps) {
  const { user } = useAuth();
  const [location, setLocation] = useState(initialLocation);
  const [productName, setProductName] = useState("");
  const [sku, setSku] = useState("");
  const [batch, setBatch] = useState("");
  const [barcode, setBarcode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [formula, setFormula] = useState("");

  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [noBatchConfirmed, setNoBatchConfirmed] = useState(false);
  const [searchTick, setSearchTick] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const qtyWrapperRef = useRef<HTMLDivElement>(null);
  const searchedProductsRef = useRef<Product[]>([]);
  const [errors, setErrors] = useState<{
    location?: string;
    name?: string;
    sku?: string;
    batch?: string;
    qty?: string;
  }>({});

  useEffect(() => {
    if (isOpen) {
      setLocation(initialLocation);
      setProductName("");
      setSku("");
      setBatch("");
      setBarcode("");
      setQuantity(1);
      setFormula("");
      setErrors({});
      setShowBarcodeScanner(false);
      setShowBatchModal(false);
      setNoBatchConfirmed(false);
      setScanningBarcode(false);
      setSubmitting(false);
    }
  }, [isOpen, initialLocation]);

  const skuBatchInfo = useMemo(
    () => getSkuBatchInfo(sku, allProducts, searchedProductsRef.current),
    [sku, allProducts, searchTick]
  );
  const batchesForSku = skuBatchInfo.batches;
  const allowEmptyBatch = skuBatchInfo.allowEmptyBatch;
  const canAutoEmpty = allowEmptyBatch && batchesForSku.length === 0;

  const resolveProductNames = useCallback(
    async (query: string): Promise<Product[]> => {
      const q = query.trim().toLowerCase();
      const dedupBySku = (items: Product[]) => {
        const seen = new Set<string>();
        const out: Product[] = [];
        for (const p of items) {
          const key =
            String(p.sku || "").trim().toLowerCase() ||
            String(p.productName || "").trim().toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            out.push(p);
          }
          if (out.length >= 10) break;
        }
        return out;
      };
      if (allProducts && allProducts.length > 0 && q) {
        const localMatches = dedupBySku(
          allProducts.filter(
            (p) =>
              String(p.productName || "").toLowerCase().includes(q) ||
              String(p.sku || "").toLowerCase().includes(q)
          )
        );
        if (localMatches.length > 0) return localMatches;
      }
      try {
        const result = await searchProductsApi(query.trim());
        if (result.success && result.products) {
          searchedProductsRef.current = result.products;
          setSearchTick((t) => t + 1);
          return dedupBySku(result.products);
        }
        return [];
      } catch {
        return [];
      }
    },
    [allProducts]
  );

  const applySelectedProduct = useCallback(
    (product: Product, scannedBarcode?: string) => {
      const info = getSkuBatchInfo(product.sku, allProducts, searchedProductsRef.current, [
        product,
      ]);
      const autoNoBatch = info.allowEmptyBatch && info.batches.length === 0;
      setProductName(product.productName);
      setSku(product.sku);
      setBatch("");
      if (scannedBarcode || product.barcode) {
        setBarcode(scannedBarcode || product.barcode || "");
      }
      setErrors({});
      setNoBatchConfirmed(autoNoBatch);
      if (autoNoBatch) {
        setShowBatchModal(false);
        setTimeout(() => {
          scrollElementCenter(qtyWrapperRef.current, { focusInput: true, select: true });
        }, 90);
      } else {
        setShowBatchModal(true);
      }
    },
    [allProducts]
  );

  const handleSelectProduct = useCallback(
    (product: Product) => {
      applySelectedProduct(product);
    },
    [applySelectedProduct]
  );

  const handleBarcodeScan = async (barcodeValue: string) => {
    const normalized = String(barcodeValue || "").trim();
    if (!normalized) return;

    setBarcode(normalized);
    setShowBarcodeScanner(false);
    setScanningBarcode(true);
    try {
      const result = await lookupBarcodeApi(normalized);
      if (result.success && result.product) {
        searchedProductsRef.current = [result.product, ...searchedProductsRef.current];
        setSearchTick((t) => t + 1);
        applySelectedProduct(result.product, normalized);
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

  const handleSubmit = async () => {
    const targetLoc = String(location || "").trim().toUpperCase();
    const targetName = String(productName || "").trim();
    const targetSku = String(sku || "").trim();
    const targetBatch = String(batch || "").trim();
    const emptyBatchAllowed =
      !targetBatch && allowEmptyBatch && (noBatchConfirmed || batchesForSku.length === 0);

    const nextErrors: typeof errors = {};
    if (!targetLoc) nextErrors.location = "Lokasi wajib diisi";
    if (!targetName) nextErrors.name = "Nama produk wajib diisi";
    if (!targetSku) nextErrors.sku = "SKU wajib diisi";
    if (!targetBatch && !emptyBatchAllowed) nextErrors.batch = "Pilih batch terlebih dahulu";
    if (quantity <= 0) nextErrors.qty = "Quantity harus lebih dari 0";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      if (!targetBatch && !emptyBatchAllowed && targetName && targetSku) {
        setShowBatchModal(true);
      }
      return;
    }

    const finalBatch = targetBatch;

    setSubmitting(true);
    const sessionId = `${user?.email || "user"}_${Date.now()}`;
    const timestamp = new Date().toISOString();

    const item = {
      productName: targetName,
      sku: targetSku,
      batch: finalBatch,
      qty: quantity,
      isNew: true,
      barcode: barcode.trim() || undefined,
      formula: formula || undefined,
    };

    try {
      const result = await saveStockOpnameApi(
        sessionId,
        user?.email || "",
        targetLoc,
        timestamp,
        [item]
      );

      if (!result.success) {
        toast.error(result.message || "Gagal menyimpan entri ke server");
        setSubmitting(false);
        return;
      }

      const newEntry: HistoryEntry = {
        sessionId: result.sessionId || sessionId,
        rowId: result.rowIds?.[0] || `optimistic_${Date.now()}`,
        timestamp,
        operator: user?.email || "",
        location: targetLoc,
        productName: targetName,
        sku: targetSku,
        batch: finalBatch,
        qty: quantity,
        edited: "",
        editTimestamp: "",
        formula: formula || "",
      };

      toast.success("Entri tersimpan di perangkat, menunggu sinkronisasi");
      onSuccess(newEntry);
      onClose();
    } catch (error) {
      console.error("Save new history entry error:", error);
      toast.error("Terjadi kesalahan saat menyimpan entri");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={submitting || scanningBarcode ? () => { } : onClose}
        title={`Tambah Produk — ${location || "Lokasi"}`}
        description="Catat produk baru ke riwayat opname rak ini."
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 h-9 bg-[#EEFBFB] border border-[#9CE0DF]/80 hover:bg-[#D5F4F3] text-[#0D3B40] text-xs font-semibold rounded-xl transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 h-9 bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white text-xs font-semibold rounded-xl shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)] transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? "Menyimpan…" : "Tambah Produk"}
            </button>
          </div>
        }
      >
        <div className="space-y-2.5">
          <Autocomplete<{ locationCode: string; productCount: number }>
            id="add-entry-location"
            label="Lokasi Rak"
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
            error={errors.location}
          />

          <Field id="add-entry-barcode" label="Scan / Cari Barcode">
            <div className="flex items-center gap-1.5">
              <input
                id="add-entry-barcode"
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

          <Autocomplete<Product>
            id="add-entry-product-name"
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
                <p className="font-semibold text-[#0D3B40] text-sm leading-snug">{p.productName}</p>
                <p className="font-mono text-xs text-[#487277] mt-0.5">
                  SKU: {p.sku}
                </p>
              </>
            )}
            onSelect={handleSelectProduct}
            placeholder="Ketik min. 2 huruf…"
            minChars={2}
            debounceMs={150}
            emptyText="Produk tidak ditemukan di master"
            error={errors.name}
          />

          <div className="grid grid-cols-2 gap-2">
            <Field id="add-entry-sku" label="SKU" required error={errors.sku}>
              <input
                id="add-entry-sku"
                type="text"
                value={sku}
                onChange={(e) => {
                  setNoBatchConfirmed(false);
                  setSku(e.target.value);
                  setErrors((er) => ({ ...er, sku: undefined }));
                }}
                placeholder="SKU produk"
                className="w-full h-9 px-3 bg-[#EEFBFB] border border-[#9CE0DF]/80 rounded-xl font-mono text-[13px] font-semibold text-[#0D3B40] uppercase placeholder:text-[#6B9498] focus:bg-white focus:outline-none focus:border-[#0E838C] focus:ring-2 focus:ring-[#14B8A6]/20"
              />
            </Field>

            <Field
              id="add-entry-batch"
              label="Nomor Batch"
              required={!allowEmptyBatch}
              error={errors.batch}
            >
              <button
                id="add-entry-batch"
                type="button"
                onClick={() => setShowBatchModal(true)}
                className={`w-full h-9 px-3 rounded-xl border flex items-center justify-between gap-1 text-left transition-colors active:scale-[0.98] ${
                  batch.trim() || noBatchConfirmed || canAutoEmpty
                    ? "bg-[#D5F4F3] border-[#7CD4D3] text-[#0B666E] font-mono text-xs font-semibold"
                    : "bg-[#EEFBFB] border-[#9CE0DF]/80 text-[#487277] text-xs font-medium hover:bg-white"
                }`}
              >
                <span className="truncate">
                  {batch.trim() ||
                    (noBatchConfirmed || canAutoEmpty ? "Tanpa Batch" : "Pilih Batch...")}
                </span>
                <ChevronDownIcon className="w-3.5 h-3.5 shrink-0 opacity-75" />
              </button>
            </Field>
          </div>

          <div className="pt-1.5 border-t border-[#9BE0DF]/55 scroll-my-4" ref={qtyWrapperRef}>
            <p className="text-[11px] font-semibold text-[#487277] mb-1">Quantity</p>
            <QtyInput
              value={quantity}
              onChange={(v) => {
                setQuantity(v);
                setErrors((e) => ({ ...e, qty: undefined }));
              }}
              onExprCommit={(expr) => setFormula(expr)}
              onFocus={() => scrollElementCenter(qtyWrapperRef.current)}
              wide
              ariaLabel="Kuantitas produk"
            />
            {errors.qty && <p className="text-[#DC2626] text-[11px] font-semibold mt-1">{errors.qty}</p>}
            {formula && (
              <p className="inline-flex items-center gap-1 text-[11px] text-[#0B666E] mt-1 font-mono font-semibold tnum">
                <CalculatorIcon className="w-3.5 h-3.5" aria-hidden="true" /> Rumus: {formula}
              </p>
            )}
          </div>
        </div>
      </Dialog>

      <BatchPickerModal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        productName={productName || "Produk Baru"}
        sku={sku}
        currentBatch={batch}
        batches={batchesForSku}
        allowEmptyBatch={allowEmptyBatch}
        onSelectBatch={(selectedBatch) => {
          const clean = selectedBatch.trim();
          setNoBatchConfirmed(!clean);
          setBatch(clean);
          setErrors((er) => ({ ...er, batch: undefined }));
          setShowBatchModal(false);
          setTimeout(() => {
            scrollElementCenter(qtyWrapperRef.current, { focusInput: true, select: true });
          }, 90);
        }}
      />

      <ScannerModal
        isOpen={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onScan={handleBarcodeScan}
        title="Pindai Barcode Produk"
      />
    </>
  );
}
