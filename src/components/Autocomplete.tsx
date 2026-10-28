"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { SearchIcon, XIcon } from "@/components/icons";

interface AutocompleteProps<T> {
  id: string;
  label?: string;
  value: string;
  onValueChange: (v: string) => void;
  resolve: (query: string) => Promise<T[]>;
  getKey: (item: T, index: number) => string;
  renderItem: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  placeholder?: string;
  minChars?: number;
  showOnEmpty?: boolean;
  debounceMs?: number;
  emptyText?: string;
  hint?: string;
  error?: string;
  className?: string;
  uppercase?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
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
        if (seq !== seqRef.current) return;
        setItems(result);
        setOpen(true);
        setActiveIdx(-1);
        requestAnimationFrame(() => {
          containerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
        });
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

  const showEmptyState =
    open && !loading && items.length === 0 && value.trim().length >= minChars;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold text-slate-700 mb-1">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <SearchIcon className="absolute left-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
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
          className={`w-full h-9 pl-8 pr-8 bg-slate-50 border rounded focus:bg-white focus:outline-none focus:border-[#0D5C63] text-sm font-medium text-slate-900 placeholder:font-normal placeholder:text-slate-400 transition-colors ${
            error ? "border-[#DC2626]" : "border-slate-300"
          } ${uppercase ? "uppercase font-mono" : ""}`}
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
            className="absolute right-1 w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-slate-700"
            aria-label="Bersihkan isian"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {hint && !error && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
      {error && (
        <p role="alert" className="text-[11px] font-semibold text-[#DC2626] mt-0.5">
          {error}
        </p>
      )}

      {(open || loading) && (items.length > 0 || loading || showEmptyState) && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-slate-300 rounded shadow-md overflow-hidden max-h-52 overflow-y-auto divide-y divide-slate-100"
        >
          {loading && (
            <p className="px-3 py-2 text-xs text-slate-500">Mencari…</p>
          )}
          {items.map((item, idx) => (
            <button
              key={getKey(item, idx)}
              type="button"
              role="option"
              aria-selected={idx === activeIdx}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(item)}
              className={`w-full text-left px-3 py-2 text-xs transition overflow-hidden ${
                idx === activeIdx ? "bg-[#E6F3F4]" : "hover:bg-slate-50"
              }`}
            >
              {renderItem(item)}
            </button>
          ))}
          {showEmptyState && (
            <p className="px-3 py-2.5 text-xs text-slate-500">{emptyText}</p>
          )}
        </div>
      )}
    </div>
  );
}
