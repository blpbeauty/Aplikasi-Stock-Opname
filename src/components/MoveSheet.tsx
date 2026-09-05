"use client";

/**
 * Sheet "Pindahkan produk" bersama — dipakai Scan (quick move satu produk)
 * dan Input (pindah semua / pilih sebagian).
 *
 * Aturan keandalan:
 * - Tujuan WAJIB dipilih dari daftar lokasi valid (tidak bisa kode sembarangan).
 * - Tujuan tidak boleh sama dengan lokasi asal.
 * - Selama menyimpan tombol terkunci; hasil sukses/gagal selalu eksplisit.
 */

import { useState, useEffect, useCallback } from "react";
import { Dialog } from "@/components/ui";
import Autocomplete from "@/components/Autocomplete";
import { CheckSquareIcon, SquareIcon, SwapIcon } from "@/components/icons";
import { moveProductsApi, searchLocationsApi } from "@/lib/api";
import { getCache, setCache, clearCache } from "@/lib/cache";
import toast from "react-hot-toast";

export interface MoveCandidate {
  sku: string;
  batch: string;
  productName: string;
}

interface MoveSheetProps {
  isOpen: boolean;
  onClose: () => void;
  fromLocation: string;
  /** Kandidat produk yang bisa dipindah. */
  items: MoveCandidate[];
  /** Tampilkan pilihan "Semua / Pilih produk" (Input). false = semua items langsung. */
  allowSelection?: boolean;
  /** Dipanggil setelah server mengonfirmasi pemindahan. */
  onMoved?: (movedCount: number) => void;
}

type LocationResult = { locationCode: string; productCount: number };

export default function MoveSheet({
  isOpen,
  onClose,
  fromLocation,
  items,
  allowSelection = false,
  onMoved,
}: MoveSheetProps) {
  const [target, setTarget] = useState("");
  const [targetConfirmed, setTargetConfirmed] = useState<LocationResult | null>(null);
  const [mode, setMode] = useState<"all" | "select">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTarget("");
      setTargetConfirmed(null);
      setMode("all");
      setSelected(new Set());
      setMoving(false);
    }
  }, [isOpen]);

  const resolveLocations = useCallback(async (query: string) => {
    try {
      const result = await searchLocationsApi(query);
      const locations = result.success && result.locations ? result.locations : [];
      return locations.filter(
        (l) => l.locationCode.toUpperCase() !== fromLocation.toUpperCase()
      );
    } catch {
      return [];
    }
  }, [fromLocation]);

  const selectedItems =
    allowSelection && mode === "select"
      ? items.filter((p) => selected.has(`${p.sku}__${p.batch}`))
      : items;

  const canSubmit = !!targetConfirmed && !moving && selectedItems.length > 0;

  const handleMove = async () => {
    if (!targetConfirmed) {
      toast.error("Pilih lokasi tujuan dari daftar");
      return;
    }
    if (targetConfirmed.locationCode.toUpperCase() === fromLocation.toUpperCase()) {
      toast.error("Lokasi tujuan tidak boleh sama");
      return;
    }
    setMoving(true);
    try {
      const result = await moveProductsApi(
        fromLocation,
        targetConfirmed.locationCode,
        selectedItems.map((p) => ({ sku: p.sku, batch: p.batch }))
      );
      if (result.success) {
        // Sinkronkan cache lokal agar tampilan tidak menampilkan data basi
        clearCache("products:");
        const cachedLoc = getCache<LocationResult[]>("allLocations");
        if (cachedLoc) setCache("allLocations", cachedLoc.data);
        onMoved?.(selectedItems.length);
        onClose();
      } else {
        toast.error(result.message || "Gagal memindahkan produk. Coba lagi.");
      }
    } catch {
      toast.error("Gagal memindahkan produk. Periksa koneksi, lalu coba lagi.");
    } finally {
      setMoving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={moving ? () => {} : onClose}
      title="Pindahkan Produk"
      description={`Dari lokasi ${fromLocation} ke lokasi lain`}
      footer={
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={moving}
            className="flex-1 min-h-touch bg-surface-warm rounded-input text-meta font-bold text-text-primary disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleMove}
            disabled={!canSubmit}
            className="flex-1 min-h-touch bg-primary text-ivory rounded-input text-meta font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {moving ? (
              "Memindahkan…"
            ) : (
              <>
                <SwapIcon className="w-4 h-4" /> Pindahkan
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Autocomplete<LocationResult>
          id="move-target-location"
          label="Lokasi tujuan"
          value={target}
          onValueChange={(v) => {
            setTarget(v);
            setTargetConfirmed(null);
          }}
          resolve={resolveLocations}
          getKey={(l) => l.locationCode}
          renderItem={(l) => (
            <div className="flex items-center justify-between gap-2 w-full min-w-0">
              <span className="font-bold text-text-primary uppercase break-all flex-1 min-w-0">{l.locationCode}</span>
              <span className="text-meta text-text-secondary shrink-0 pl-2">{l.productCount} produk</span>
            </div>
          )}
          onSelect={(l) => {
            setTarget(l.locationCode);
            setTargetConfirmed(l);
          }}
          placeholder="Ketik kode lokasi…"
          uppercase
          minChars={1}
          emptyText="Lokasi tidak ditemukan — pilih dari daftar"
          hint={
            targetConfirmed
              ? `Tujuan: ${targetConfirmed.locationCode}`
              : "Pilih dari daftar agar lokasi valid"
          }
        />

        {allowSelection && (
          <div>
            <p className="text-meta font-bold text-text-primary mb-1.5">Produk yang dipindah</p>
            <div className="flex gap-2" role="group" aria-label="Mode pemilihan produk">
              <button
                type="button"
                onClick={() => setMode("all")}
                aria-pressed={mode === "all"}
                className={`flex-1 min-h-touch rounded-input text-meta font-bold border transition ${
                  mode === "all"
                    ? "bg-primary text-ivory border-primary"
                    : "bg-surface-warm text-text-primary border-border"
                }`}
              >
                Semua ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setMode("select")}
                aria-pressed={mode === "select"}
                className={`flex-1 min-h-touch rounded-input text-meta font-bold border transition ${
                  mode === "select"
                    ? "bg-primary text-ivory border-primary"
                    : "bg-surface-warm text-text-primary border-border"
                }`}
              >
                Pilih produk
              </button>
            </div>
          </div>
        )}

        {allowSelection && mode === "select" && (
          <div
            className="border border-border rounded-input overflow-hidden max-h-44 overflow-y-auto divide-y divide-border-subtle bg-paper"
            role="group"
            aria-label="Daftar produk untuk dipilih"
          >
            {items.map((p) => {
              const key = `${p.sku}__${p.batch}`;
              const isSelected = selected.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  aria-pressed={isSelected}
                  className={`w-full min-h-touch text-left px-3 py-2 flex items-center gap-2.5 transition ${
                    isSelected ? "bg-primary-pale/50" : ""
                  }`}
                >
                  <span className={isSelected ? "text-primary" : "text-text-secondary/50"}>
                    {isSelected ? (
                      <CheckSquareIcon className="w-5 h-5" />
                    ) : (
                      <SquareIcon className="w-5 h-5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-meta font-bold text-text-primary leading-snug line-clamp-2">
                      {p.productName}
                    </span>
                    <span className="block text-meta text-text-secondary">
                      SKU {p.sku} · Batch {p.batch || "-"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <p className="text-meta text-text-secondary">
          {selectedItems.length > 0
            ? `${selectedItems.length} produk akan dipindah ke ${targetConfirmed?.locationCode || "lokasi tujuan"}.`
            : "Pilih minimal 1 produk untuk dipindah."}
        </p>
      </div>
    </Dialog>
  );
}
