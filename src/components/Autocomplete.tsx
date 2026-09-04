"use client";

/**
 * Autocomplete bersama untuk pencarian produk / lokasi / batch
 * yang sebelumnya berulang di Scan, Input, dan EditModal.
 *
 * Semantik combobox dasar: input dengan aria-expanded/aria-controls,
 * daftar role="listbox", navigasi panah, Enter memilih, Escape menutup.
 */

import {
  useEffect,
  useRef,
  useState,
  useId,
  useCallback,
  ReactNode,
} from "react";
import { SearchIcon, XIcon } from "@/components/icons";

interface AutocompleteProps<T> {
  id: string;
  label?: string;
  value: string;
  onValueChange: (v: string) => void;
  /** Ambil kandidat hasil untuk query (sudah termasuk debounce bila perlu). */
  resolve: (query: string) => Promise<T[]>;
  /** Nilai unik tiap item. */
  getKey: (item: T, index: number) => string;
  /** Render isi satu baris hasil. */
  renderItem: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  placeholder?: string;
  /** Minimal karakter sebelum resolve dipanggil. Default 1. */
  minChars?: number;
  /** Tampilkan hasil saat input difokus walau query kosong (mis. daftar lokasi). */
  showOnEmpty?: boolean;
  /** Debounce resolve dalam ms. Default 200. */
  debounceMs?: number;
  /** Teks saat tidak ada hasil. */
  emptyText?: string;
  /** Teks bawah input (di luar dropdown). */
  hint?: string;
  /** Pesan error validasi (ditampilkan + aria-invalid). */
  error?: string;
  className?: string;
  uppercase?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Dipanggil saat query berubah (mis. untuk sinkron state form). */
  onQueryChange?: (q: string) => void;
}

export default function Autocomplete<T>({
  id,
  label,
  value,
  onValueChange,
  resolve,
  getKey,
  renderItem,
  onSelect,
  placeholder,
  minChars = 1,
  showOnEmpty = false,
  debounceMs = 200,
  emptyText = "Tidak ditemukan",
  hint,
  error,
  className = "",
  uppercase = false,
  autoFocus,
  disabled,
  onQueryChange,
}: AutocompleteProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = `${id}-listbox`;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const runResolve = useCallback(
    async (query: string) => {
      const seq = ++seqRef.current;
      setLoading(true);
      try {
        const result = await resolve(query);
        if (seq !== seqRef.current) return; // kedaluwarsa
        setItems(result);
        setOpen(true);
        setActiveIdx(-1);
      } catch {
        if (seq === seqRef.current) {
          setItems([]);
        }
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    },
    [resolve]
  );

  const handleChange = (v: string) => {
    onValueChange(v);
    onQueryChange?.(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = v.trim();
    if (q.length < minChars && !(showOnEmpty && q.length === 0)) {
      setItems([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    timerRef.current = setTimeout(() => runResolve(q), debounceMs);
  };

  const select = (item: T) => {
    onSelect(item);
    setOpen(false);
    setItems([]);
    setActiveIdx(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      select(items[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showEmptyState = open && !loading && items.length === 0 && value.trim().length >= minChars;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-meta font-bold text-text-primary mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <SearchIcon className="absolute left-3 w-4 h-4 text-text-secondary pointer-events-none top-1/2 -translate-y-1/2" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open && (items.length > 0 || showEmptyState)}
          aria-controls={listId}
          aria-autocomplete="list"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (showOnEmpty && value.trim().length === 0) runResolve("");
            else if (items.length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={!!error}
          className={`w-full tap pl-9 pr-9 bg-surface-warm border rounded-input focus:bg-paper text-base2 font-semibold text-text-primary placeholder:font-normal placeholder:text-text-secondary ${
            error ? "border-danger" : "border-border"
          } ${uppercase ? "uppercase" : ""}`}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => {
              onValueChange("");
              onQueryChange?.("");
              setItems([]);
              setOpen(false);
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-text-secondary hover:bg-primary-pale"
            aria-label="Bersihkan isian"
          >
            <XIcon className="w-4 h-4" />
          </button>
        )}
      </div>
      {hint && !error && <p className="text-meta text-text-secondary mt-1">{hint}</p>}
      {error && (
        <p role="alert" className="text-meta font-semibold text-danger mt-1">
          {error}
        </p>
      )}

      {(open || loading) && (items.length > 0 || loading || showEmptyState) && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-20 left-0 right-0 mt-1 bg-paper border border-border rounded-input shadow-card overflow-hidden max-h-60 overflow-y-auto"
        >
          {loading && (
            <p className="px-3 py-2 text-meta text-text-secondary">Mencari…</p>
          )}
          {items.map((item, idx) => (
            <button
              key={getKey(item, idx)}
              type="button"
              role="option"
              aria-selected={idx === activeIdx}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(item)}
              className={`w-full text-left px-3 py-2.5 border-b border-border-subtle last:border-b-0 transition ${
                idx === activeIdx ? "bg-primary-pale" : "hover:bg-primary-pale/60"
              }`}
            >
              {renderItem(item)}
            </button>
          ))}
          {showEmptyState && (
            <p className="px-3 py-3 text-meta text-text-secondary">{emptyText}</p>
          )}
        </div>
      )}
    </div>
  );
}
