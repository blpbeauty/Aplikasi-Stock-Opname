"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Evaluasi ekspresi matematika sederhana secara aman tanpa new Function / eval.
 * Mendukung penjumlahan (+), pengurangan (-), perkalian (* atau x), dan pembagian (/).
 */
export function calcExpr(expr: string): number | null {
  if (!expr || typeof expr !== "string") return null;

  // Normalisasi: ganti x, X, × dengan *, hapus spasi
  const clean = expr.replace(/[xX×]/g, "*").replace(/\s+/g, "");

  // Hanya izinkan karakter angka dan operator dasar
  if (!/^[\d+\-*./]+$/.test(clean)) return null;

  // Harus diawali dan diakhiri dengan angka
  if (!/^\d/.test(clean) || !/\d$/.test(clean)) return null;

  try {
    // Tokenisasi angka dan operator
    const tokens: (number | string)[] = [];
    let currentNum = "";

    for (let i = 0; i < clean.length; i++) {
      const char = clean[i];
      if (/\d|\./.test(char)) {
        currentNum += char;
      } else if (/[+\-*/]/.test(char)) {
        if (currentNum === "") return null;
        tokens.push(parseFloat(currentNum));
        currentNum = "";
        tokens.push(char);
      } else {
        return null;
      }
    }
    if (currentNum !== "") {
      tokens.push(parseFloat(currentNum));
    }

    // Pass 1: Perkalian (*) dan Pembagian (/)
    const pass1: (number | string)[] = [];
    let idx = 0;
    while (idx < tokens.length) {
      const token = tokens[idx];
      if (token === "*" || token === "/") {
        const prevNum = pass1.pop() as number;
        const nextNum = tokens[idx + 1] as number;
        if (typeof prevNum !== "number" || typeof nextNum !== "number") return null;

        const res = token === "*" ? prevNum * nextNum : nextNum !== 0 ? prevNum / nextNum : 0;
        pass1.push(res);
        idx += 2;
      } else {
        pass1.push(token);
        idx++;
      }
    }

    // Pass 2: Penjumlahan (+) dan Pengurangan (-)
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
}

export default function QtyInput({
  value,
  onChange,
  className,
  wide,
  onExprCommit,
  onFocus,
  onCommit,
}: QtyInputProps) {
  const [display, setDisplay] = useState(String(value));
  const [preview, setPreview] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const exprCommittedRef = useRef(false);
  const isExpr = /[+\-*xX×/]/.test(display);

  useEffect(() => {
    setDisplay(String(value));
    setPreview(null);
  }, [value]);

  const handleChange = (raw: string) => {
    exprCommittedRef.current = false;
    setDisplay(raw);
    if (/[+\-*xX×/]/.test(raw)) {
      const result = calcExpr(raw);
      setPreview(result);
    } else {
      setPreview(null);
      const num = parseInt(raw, 10);
      if (!isNaN(num) && num >= 0) onChange(num);
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

  const commit = () => {
    if (exprCommittedRef.current) {
      setFocused(false);
      return;
    }
    if (isExpr) {
      const result = calcExpr(display);
      if (result !== null) {
        if (onExprCommit) onExprCommit(display + "=" + result);
        exprCommittedRef.current = true;
        onChange(result);
        setDisplay(String(result));
        setPreview(null);
        setFocused(false);
        onCommit?.();
        return;
      }
    }
    if (display === "" || isNaN(parseInt(display, 10))) {
      setDisplay("0");
      onChange(0);
      if (onExprCommit) onExprCommit("");
    } else {
      if (onExprCommit) onExprCommit("");
      onCommit?.();
    }
    setPreview(null);
    setFocused(false);
  };

  const defaultCls = wide
    ? "w-full h-10 text-center bg-surface-warm border border-border focus:border-primary focus:bg-white rounded-xl text-base font-bold text-text-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition"
    : "w-16 h-8 text-center bg-surface-warm border border-border focus:border-primary focus:bg-white rounded-lg text-sm font-bold text-text-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition";

  const opBtnCls = wide
    ? "flex-1 h-10 rounded-xl bg-surface-warm border border-border text-text-primary text-base font-bold hover:bg-primary-pale active:bg-primary active:text-white transition select-none flex items-center justify-center shadow-xs"
    : "w-9 h-8 rounded-lg bg-surface-warm border border-border text-text-primary text-sm font-bold hover:bg-primary-pale active:bg-primary active:text-white transition select-none flex items-center justify-center";

  return (
    <div className={`relative inline-flex flex-col items-center gap-1 ${wide ? "w-full" : ""}`}>
      <div className={`flex items-center gap-1.5 ${wide ? "w-full" : ""}`}>
        <input
          ref={inputRef}
          type="text"
          inputMode={textMode ? "text" : "numeric"}
          value={display}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={(e) => {
            if (display === "0") setDisplay("");
            setFocused(true);
            e.target.select();
            onFocus?.();
          }}
          onBlur={() => {
            setTimeout(commit, 150);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={className || defaultCls}
        />
        {wide && focused && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={commit}
            className="h-10 px-4 rounded-xl bg-primary text-white text-sm font-bold whitespace-nowrap active:bg-primary-light transition select-none shadow-sm"
          >
            =
          </button>
        )}
      </div>

      {wide && (
        <div className="flex gap-1.5 w-full items-center mt-0.5">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertOp("+")}
            className={opBtnCls}
          >
            +
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertOp("-")}
            className={opBtnCls}
          >
            −
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertOp("x")}
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
            className={`${opBtnCls} ${textMode ? "!bg-primary !text-white !border-primary" : ""}`}
          >
            {textMode ? "123" : "abc"}
          </button>
        </div>
      )}

      {isExpr && preview !== null && (
        <span className="text-[11px] font-bold text-primary bg-primary-pale px-2.5 py-0.5 rounded-full mt-0.5 border border-primary/20 animate-pulse">
          = {preview}
        </span>
      )}
    </div>
  );
}
