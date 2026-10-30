"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
  const [submitting, setSubmitting] = useState(false);
  const qtyWrapperRef = useRef<HTMLDivElement>(null);
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
      setScanningBarcode(false);
      setSubmitting(false);
    }
  }, [isOpen, initialLocation]);

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

  const resolveProductNames = async (query: string): Promise<Product[]> => {
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
    try {
      const result = await searchProductsApi(query.trim());
      return result.success && result.products ? dedupBySku(result.products) : [];
    } catch {
      return [];
    }
  };

  const handleSelectProduct = (product: Product) => {
    setProductName(product.productName);
    setSku(product.sku);
    setBatch("");
    if (product.barcode) setBarcode(product.barcode);
    setErrors({});
    setShowBatchModal(true);
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
        setBatch("");
        setShowBatchModal(true);
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

    const nextErrors: typeof errors = {};
    if (!targetLoc) nextErrors.location = "Lokasi wajib diisi";
    if (!targetName) nextErrors.name = "Nama produk wajib diisi";
    if (!targetSku) nextErrors.sku = "SKU wajib diisi";
    if (!targetBatch) nextErrors.batch = "Pilih batch terlebih dahulu";
    if (quantity <= 0) nextErrors.qty = "Quantity harus lebih dari 0";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      if (!targetBatch && targetName && targetSku) {
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
        onClose={submitting || scanningBarcode ? () => {} : onClose}
        title={`Tambah Produk — ${location || "Lokasi"}`}
        description="Catat produk baru ke riwayat opname rak ini."
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 h-9 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded hover:bg-slate-100 transition disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 h-9 bg-[#0D5C63] hover:bg-[#14727A] text-white text-xs font-semibold rounded transition disabled:opacity-50"
            >
              {submitting ? "Menyimpan…" : "Tambah Produk"}
            </button>
          </div>
        }
      >
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
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
              error={errors.location}
            />

            <Field id="add-entry-barcode" label="Scan / Cari Barcode">
              <div className="relative flex items-center">
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
                  className="w-full h-9 pl-2.5 pr-16 bg-slate-50 border border-slate-300 rounded font-mono text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-[#0D5C63]"
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
                    className="w-7 h-7 rounded bg-[#0D5C63] text-white flex items-center justify-center disabled:opacity-40"
                    aria-label="Pindai barcode dengan kamera"
                  >
                    <CameraIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </Field>
          </div>

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
                <p className="font-semibold text-slate-900 text-xs">{p.productName}</p>
                <p className="font-mono text-[11px] text-slate-500">
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
                  setSku(e.target.value);
                  setErrors((er) => ({ ...er, sku: undefined }));
                }}
                placeholder="SKU produk"
                className="w-full h-9 px-2.5 bg-slate-50 border border-slate-300 rounded font-mono text-xs font-bold text-slate-900 uppercase focus:bg-white focus:outline-none focus:border-[#0D5C63]"
              />
            </Field>

            <Field id="add-entry-batch" label="Nomor Batch" required error={errors.batch}>
              <button
                id="add-entry-batch"
                type="button"
                onClick={() => setShowBatchModal(true)}
                className={`w-full h-9 px-2.5 rounded border flex items-center justify-between gap-1.5 text-left transition ${
                  batch.trim()
                    ? "bg-[#E6F3F4] border-[#0D5C63] text-[#0D5C63] font-mono text-xs font-bold"
                    : "bg-slate-50 border-slate-300 text-slate-500 text-xs font-medium hover:bg-slate-100"
                }`}
              >
                <span className="truncate">{batch.trim() || "Pilih Batch..."}</span>
                <ChevronDownIcon className="w-3.5 h-3.5 shrink-0 opacity-75" />
              </button>
            </Field>
          </div>

          <div className="pt-1 border-t border-slate-200" ref={qtyWrapperRef}>
            <p className="text-xs font-semibold text-slate-700 mb-1">Quantity</p>
            <QtyInput
              value={quantity}
              onChange={(v) => {
                setQuantity(v);
                setErrors((e) => ({ ...e, qty: undefined }));
              }}
              onExprCommit={(expr) => setFormula(expr)}
              wide
              ariaLabel="Kuantitas produk"
            />
            {errors.qty && <p className="text-[#DC2626] text-[11px] font-semibold mt-1">{errors.qty}</p>}
            {formula && (
              <p className="inline-flex items-center gap-1 text-xs text-[#0D5C63] mt-1 font-mono font-bold tnum">
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
        onSelectBatch={(selectedBatch) => {
          setBatch(selectedBatch);
          setErrors((er) => ({ ...er, batch: undefined }));
          setShowBatchModal(false);
          setTimeout(() => {
            qtyWrapperRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            const qtyInput = qtyWrapperRef.current?.querySelector(
              'input[type="text"]'
            ) as HTMLInputElement | null;
            qtyInput?.focus();
            qtyInput?.select();
          }, 120);
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
