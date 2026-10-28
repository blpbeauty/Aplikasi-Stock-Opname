"use client";

import { useState, useEffect, useRef } from "react";

export function calcExpr(expr: string): number | null {
  if (!expr || typeof expr !== "string") return null;

  const clean = expr.replace(/[xX×]/g, "*").replace(/\s+/g, "");
  if (!/^[\d+\-*./]+$/.test(clean)) return null;
  if (!/^\d/.test(clean) || !/\d$/.test(clean)) return null;

  try {
    const tokens: (number | string)[] = [];
    let currentNum = "";

    for (let i = 0; i < clean.length; i++) {
      const char = clean[i];
      if (/\d|\./.test(char)) {
        currentNum += char;
      } else if (/[+\-*/]/.test(char)) {
        if (!/^\d+(?:\.\d+)?$/.test(currentNum)) return null;
        tokens.push(parseFloat(currentNum));
        currentNum = "";
        tokens.push(char);
      } else {
        return null;
      }
    }
    if (currentNum !== "") {
      if (!/^\d+(?:\.\d+)?$/.test(currentNum)) return null;
      tokens.push(parseFloat(currentNum));
    }

    const pass1: (number | string)[] = [];
    let idx = 0;
    while (idx < tokens.length) {
      const token = tokens[idx];
      if (token === "*" || token === "/") {
        const prevNum = pass1.pop() as number;
        const nextNum = tokens[idx + 1] as number;
        if (typeof prevNum !== "number" || typeof nextNum !== "number") return null;
        if (token === "/" && nextNum === 0) return null;
        const res = token === "*" ? prevNum * nextNum : prevNum / nextNum;
        pass1.push(res);
        idx += 2;
      } else {
        pass1.push(token);
        idx++;
      }
    }

    let result = pass1[0] as number;
    if (typeof result !== "number") return null;

    let pIdx = 1;
    while (pIdx < pass1.length) {
      const op = pass1[pIdx];
      const nextNum = pass1[pIdx + 1] as number;
      if (typeof nextNum !== "number") return null;

      if (op === "+") {
        result += nextNum;
      } else if (op === "-") {
        result -= nextNum;
      }
      pIdx += 2;
    }

    if (isNaN(result) || !isFinite(result)) return null;
    return Math.max(0, Math.round(result));
  } catch {
    return null;
  }
}

interface QtyInputProps {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  wide?: boolean;
  onExprCommit?: (expr: string) => void;
  onFocus?: () => void;
  onCommit?: () => void;
  ariaLabel?: string;
  unfilled?: boolean;
  onValidityChange?: (valid: boolean) => void;
}

export default function QtyInput({
  value,
  onChange,
  className,
  wide,
  onExprCommit,
  onFocus,
  onCommit,
  ariaLabel,
  unfilled = false,
  onValidityChange,
}: QtyInputProps) {
  const [display, setDisplay] = useState(unfilled ? "" : String(value));
  const [preview, setPreview] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const exprCommittedRef = useRef(false);
  const dirtyRef = useRef(false);
  const isExpr = /[+\-*xX×/]/.test(display);

  useEffect(() => {
    setDisplay(unfilled ? "" : String(value));
    setPreview(null);
  }, [value, unfilled]);

  const handleChange = (raw: string) => {
    dirtyRef.current = true;
    onValidityChange?.(calcExpr(raw) !== null);
    exprCommittedRef.current = false;
    setDisplay(raw);
    if (/[+\-*xX×/]/.test(raw)) {
      const result = calcExpr(raw);
      setPreview(result);
    } else {
      setPreview(null);
      const num = parseInt(raw, 10);
      if (!isNaN(num) && num >= 0) {
        onChange(num);
        onExprCommit?.("");
      }
    }
  };

  const insertOp = (op: string) => {
    exprCommittedRef.current = false;
    const next = display === "0" ? "" : display;
    if (/[+\-*xX×/]$/.test(next)) {
      const replaced = next.slice(0, -1) + op;
      handleChange(replaced);
    } else {
      handleChange(next + op);
    }
    inputRef.current?.focus();
  };

  const commit = (isExplicit = false) => {
    if (!dirtyRef.current && !isExplicit) {
      setFocused(false);
      return;
    }
    if (exprCommittedRef.current && !isExplicit) {
      setFocused(false);
      return;
    }
    if (isExpr) {
      const result = calcExpr(display);
      if (result !== null) {
        if (onExprCommit) onExprCommit(display + "=" + result);
        exprCommittedRef.current = true;
        dirtyRef.current = false;
        onChange(result);
        setDisplay(String(result));
        setPreview(null);
        setFocused(false);
        onCommit?.();
        return;
      }
      setFocused(false);
      return;
    }
    if (unfilled && (display === "" || isNaN(parseInt(display, 10)))) {
      setDisplay("");
      setPreview(null);
      setFocused(false);
      return;
    }
    if (display === "" || isNaN(parseInt(display, 10))) {
      setDisplay("0");
      onChange(0);
      if (onExprCommit) onExprCommit("");
      if (isExplicit) onCommit?.();
    } else {
      const num = parseInt(display, 10);
      if (!isNaN(num) && num >= 0) {
        onChange(num);
      }
      if (onExprCommit) onExprCommit("");
      onCommit?.();
    }
    setPreview(null);
    setFocused(false);
    dirtyRef.current = false;
  };

  const defaultCls = wide
    ? "w-full h-9 text-center bg-white border border-slate-300 focus:border-[#2E5339] rounded font-mono text-base font-bold text-slate-900 tabular-nums tnum [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition"
    : "w-16 h-9 text-center bg-white border border-slate-300 focus:border-[#2E5339] rounded font-mono text-sm font-bold text-slate-900 tabular-nums tnum [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition";

  const opBtnCls = wide
    ? "flex-1 h-8 rounded bg-slate-100 border border-slate-300 text-slate-800 font-mono text-sm font-bold hover:bg-[#EAF2EB] active:bg-[#2E5339] active:text-white transition select-none flex items-center justify-center"
    : "w-8 h-8 rounded bg-slate-100 border border-slate-300 text-slate-800 font-mono text-sm font-bold hover:bg-[#EAF2EB] active:bg-[#2E5339] active:text-white transition select-none flex items-center justify-center";

  return (
    <div className={`relative inline-flex flex-col items-center gap-1 ${wide ? "w-full" : ""}`}>
      <div className={`flex items-center gap-1.5 ${wide ? "w-full" : ""}`}>
        <input
          ref={inputRef}
          type="text"
          inputMode={textMode ? "text" : "numeric"}
          value={display}
          placeholder={unfilled ? "—" : undefined}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={(e) => {
            if (display === "0") setDisplay("");
            setFocused(true);
            e.target.select();
            onFocus?.();
          }}
          onBlur={() => commit(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(true);
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label={ariaLabel}
          className={className || defaultCls}
        />
        {wide && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              commit(true);
            }}
            onClick={() => commit(true)}
            className="h-9 px-3.5 rounded bg-[#2E5339] hover:bg-[#3D6E4C] text-white font-mono text-base font-bold whitespace-nowrap active:bg-[#203B28] transition select-none flex items-center justify-center shrink-0 shadow-sm"
            aria-label="Hitung rumus dan selesai"
            title="Selesai & lanjut ke produk berikutnya"
          >
            =
          </button>
        )}
      </div>

      {wide && (
        <div className="flex gap-1 w-full items-center">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertOp("+")}
            aria-label="Tambah"
            className={opBtnCls}
          >
            +
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertOp("-")}
            aria-label="Kurangi"
            className={opBtnCls}
          >
            −
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertOp("x")}
            aria-label="Kalikan"
            className={opBtnCls}
          >
            ×
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setTextMode((v) => !v);
              inputRef.current?.focus();
            }}
            title={textMode ? "Keypad angka" : "Keyboard penuh (bisa ketik +−×)"}
            aria-label={textMode ? "Ganti ke keypad angka" : "Ganti ke keyboard penuh"}
            aria-pressed={textMode}
            className={`${opBtnCls} ${textMode ? "!bg-[#2E5339] !text-white !border-[#2E5339]" : ""}`}
          >
            {textMode ? "123" : "abc"}
          </button>
        </div>
      )}

      {isExpr && preview !== null && (
        <span
          className="font-mono text-xs font-bold text-[#2E5339] bg-[#EAF2EB] border border-[#BDD7C4] px-2 py-0.5 rounded tnum"
          role="status"
        >
          = {preview}
        </span>
      )}
    </div>
  );
}
