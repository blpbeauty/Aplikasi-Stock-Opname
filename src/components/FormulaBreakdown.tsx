"use client";

import { calcExpr } from "./QtyInput";
import { CalculatorIcon } from "./icons";

export default function FormulaBreakdown({ formula, quantity }: { formula: string; quantity: number }) {
  if (!formula.trim()) return null;
  const expression = formula.split("=")[0].trim();
  const result = calcExpr(expression);
  const readable = expression.replace(/[xX*×]/g, " × ").replace(/\//g, " ÷ ")
    .replace(/\+/g, " + ").replace(/-/g, " − ").replace(/\s+/g, " ").trim();
  return (
    <div className="formula-breakdown" data-formula={formula}>
      <div className="formula-caption"><CalculatorIcon className="w-3.5 h-3.5" /> Rumus perhitungan</div>
      <div className="formula-equation">
        <span className="formula-expression">{readable}</span>
        {result !== null && <span className="formula-result">= {result.toLocaleString("id-ID")} <span>pcs</span></span>}
      </div>
      {result !== null && result !== quantity && (
        <p className="mt-2 text-meta text-amber-text font-semibold">Jumlah tersimpan {quantity.toLocaleString("id-ID")} pcs berbeda dari hasil rumus.</p>
      )}
    </div>
  );
}
