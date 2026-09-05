"use client";

import { useState, useEffect, useMemo } from "react";
import { Product, HistoryEntry } from "@/lib/types";
import {
  lookupBarcodeApi,
  searchProductsApi,
  searchLocationsApi,
  saveStockOpnameApi,
  addMasterProductApi,
} from "@/lib/api";
import { addHistoryEntryLocal } from "@/lib/localDb";
import { useAuth } from "@/components/AuthProvider";
import ScannerModal from "@/components/ScannerModal";
import QtyInput from "@/components/QtyInput";
import { Dialog, Field } from "@/components/ui";
import Autocomplete from "@/components/Autocomplete";
import { CalculatorIcon, CameraIcon, SearchIcon } from "@/components/icons";
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
  const [saveToMaster, setSaveToMaster] = useState(false);

  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
      setSaveToMaster(false);
      setErrors({});
      setShowBarcodeScanner(false);
      setScanningBarcode(false);
      setSubmitting(false);
    }
  }, [isOpen, initialLocation]);

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
    setBatch(product.batch || "");
    if (product.barcode) setBarcode(product.barcode);
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

  const handleSubmit = async () => {
    const targetLoc = location.trim().toUpperCase();
    const targetName = productName.trim();
    const targetSku = sku.trim();
    const targetBatch = batch.trim();

    const nextErrors: typeof errors = {};
    if (!targetLoc) nextErrors.location = "Lokasi wajib diisi";
    if (!targetName) nextErrors.name = "Nama produk wajib diisi";
    if (!targetSku) nextErrors.sku = "SKU wajib diisi";
    if (quantity <= 0) nextErrors.qty = "Quantity harus lebih dari 0";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // Batch mengikuti master data: boleh kosong bila master tidak punya
    // batch untuk SKU ini; satu batch terisi otomatis; beberapa batch
    // wajib dipilih operator.
    let finalBatch = targetBatch;
    if (!finalBatch) {
      if (batchesForSku.length === 1) finalBatch = batchesForSku[0];
      else if (batchesForSku.length > 1) {
        setErrors({ batch: "Pilih batch — produk ini punya beberapa batch di master" });
        return;
      }
    }

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

      if (saveToMaster) {
        addMasterProductApi(targetLoc, targetName, targetSku, targetBatch, barcode.trim()).catch(
          () => {}
        );
      }

      const newEntry: HistoryEntry = {
        sessionId,
        rowId: `optimistic_${Date.now()}`,
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

      addHistoryEntryLocal(newEntry).catch(() => {});
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
        title={`Tambah Produk di ${location || "Lokasi"}`}
        description="Masukkan data produk yang ingin ditambahkan ke riwayat opname."
        footer={
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 min-h-touch bg-surface-warm text-text-primary text-meta font-bold rounded-input transition active:scale-[0.98] disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 min-h-touch bg-primary text-ivory text-meta font-bold rounded-input transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {submitting ? "Menyimpan…" : "Tambah Produk"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Lokasi */}
          <Autocomplete<{ locationCode: string; productCount: number }>
            id="add-entry-location"
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
            error={errors.location}
          />

          {/* Barcode */}
          <Field id="add-entry-barcode" label="Barcode" hint="Pindai atau ketik untuk mencari otomatis.">
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

          {/* Nama Produk */}
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
                <p className="font-bold text-text-primary text-meta">{p.productName}</p>
                <p className="text-meta text-text-secondary">
                  SKU: {p.sku}
                  {p.batch ? ` · Batch: ${p.batch}` : " · tanpa batch"}
                </p>
              </>
            )}
            onSelect={handleSelectProduct}
            placeholder="Ketik min. 2 huruf untuk mencari…"
            minChars={2}
            debounceMs={180}
            emptyText="Produk tidak ditemukan di master"
            error={errors.name}
          />

          {/* SKU & Batch */}
          <div className="grid grid-cols-2 gap-3">
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
                className="w-full min-h-touch px-3 bg-surface-warm border border-border rounded-input text-meta font-semibold text-text-primary uppercase"
              />
            </Field>

            <Field
              id="add-entry-batch"
              label="Batch"
              hint="Opsional — kosongkan bila produk tanpa batch di master."
              error={errors.batch}
            >
              <div className="relative">
                <input
                  id="add-entry-batch"
                  type="text"
                  value={batch}
                  onChange={(e) => {
                    setBatch(e.target.value);
                    setErrors((er) => ({ ...er, batch: undefined }));
                  }}
                  className="w-full min-h-touch pl-3 pr-10 bg-surface-warm border border-border rounded-input text-meta font-semibold text-text-primary"
                  placeholder="Batch (opsional)"
                />
                {batchesForSku.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const next =
                        filteredBatches[(filteredBatches.indexOf(batch) + 1) % filteredBatches.length];
                      setBatch(next);
                    }}
                    className="absolute right-0.5 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-text-secondary hover:text-primary active:scale-95 transition"
                    aria-label="Pilih batch yang ada"
                  >
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
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
              onChange={(v) => {
                setQuantity(v);
                setErrors((e) => ({ ...e, qty: undefined }));
              }}
              onExprCommit={(expr) => setFormula(expr)}
              wide
              ariaLabel="Kuantitas produk"
            />
            {errors.qty && <p className="text-danger text-meta mt-1">{errors.qty}</p>}
            {formula && (
              <p className="inline-flex items-center gap-1 text-meta text-amber-text mt-1.5 font-bold tnum">
                <CalculatorIcon className="w-4 h-4" aria-hidden="true" /> Rumus: {formula}
              </p>
            )}
          </div>

          {/* Simpan ke Master Data */}
          <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={saveToMaster}
              onChange={(e) => setSaveToMaster(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-meta text-text-secondary font-medium">
              Simpan produk ini ke Master Data lokasi
            </span>
          </label>
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
