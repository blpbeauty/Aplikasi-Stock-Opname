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
            className="flex-1 min-h-[44px] bg-[#EEFBFB] border border-[#9CE0DF]/80 hover:bg-[#D5F4F3] rounded-xl text-sm font-semibold text-[#0D3B40] disabled:opacity-50 active:scale-[0.98] transition-all duration-150"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleMove}
            disabled={!canSubmit}
            className="flex-1 min-h-[44px] bg-gradient-to-r from-[#0E838C] to-[#14B8A6] hover:from-[#0B6F77] hover:to-[#0D9488] text-white rounded-xl text-sm font-semibold shadow-[0_6px_16px_-4px_rgba(14,131,140,0.28)] disabled:opacity-50 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-1.5"
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
      <div className="space-y-3.5">
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
              <span className="font-mono font-semibold text-[#0D3B40] uppercase break-all flex-1 min-w-0">{l.locationCode}</span>
              <span className="text-xs text-[#487277] shrink-0 pl-2">{l.productCount} produk</span>
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
            <p className="text-xs font-semibold text-[#487277] mb-1.5">Produk yang dipindah</p>
            <div className="p-1 bg-[#D8F3F2] border border-[#9BE0DF]/65 rounded-xl grid grid-cols-2 gap-1" role="group" aria-label="Mode pemilihan produk">
              <button
                type="button"
                onClick={() => setMode("all")}
                aria-pressed={mode === "all"}
                className={`min-h-[44px] rounded-lg text-xs font-semibold transition-all active:scale-[0.98] ${
                  mode === "all"
                    ? "bg-gradient-to-r from-[#0E838C] to-[#14B8A6] text-white shadow-subtle"
                    : "text-[#487277] hover:text-[#0D3B40]"
                }`}
              >
                Semua ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setMode("select")}
                aria-pressed={mode === "select"}
                className={`min-h-[44px] rounded-lg text-xs font-semibold transition-all active:scale-[0.98] ${
                  mode === "select"
                    ? "bg-gradient-to-r from-[#0E838C] to-[#14B8A6] text-white shadow-subtle"
                    : "text-[#487277] hover:text-[#0D3B40]"
                }`}
              >
                Pilih produk
              </button>
            </div>
          </div>
        )}

        {allowSelection && mode === "select" && (
          <div
            className="border border-[#9BE0DF]/75 rounded-2xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-[#9BE0DF]/40 bg-white"
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
                  className={`w-full min-h-[48px] text-left px-3.5 py-2.5 flex items-center gap-2.5 transition-colors ${
                    isSelected ? "bg-[#D5F4F3]/75" : "hover:bg-[#EEFBFB]"
                  }`}
                >
                  <span className={isSelected ? "text-[#0E838C]" : "text-[#487277]/50"}>
                    {isSelected ? (
                      <CheckSquareIcon className="w-5 h-5" />
                    ) : (
                      <SquareIcon className="w-5 h-5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-[#0D3B40] leading-snug line-clamp-2">
                      {p.productName}
                    </span>
                    <span className="block text-xs text-[#487277] mt-0.5">
                      {p.batch ? `SKU ${p.sku} · Batch ${p.batch}` : `SKU ${p.sku} · tanpa batch`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <p className="text-xs text-[#487277]">
          {selectedItems.length > 0
            ? `${selectedItems.length} produk akan dipindah ke ${targetConfirmed?.locationCode || "lokasi tujuan"}.`
            : "Pilih minimal 1 produk untuk dipindah."}
        </p>
      </div>
    </Dialog>
  );
}
