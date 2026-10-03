import { Product } from "./types";

export type InputDraft = {
  version: 1;
  location: string;
  updatedAt: number;
  products: Product[];
  newProducts: Product[];
  quantities: Record<string, number>;
  formulas: Record<string, string>;
  counted: Record<string, boolean>;
  newProductForm: { productName: string; sku: string; batch: string; barcode: string; qty: number };
  newProductFormula: string;
  showAddForm: boolean;
};

const prefix = (email: string) => `opname-draft:v1:${encodeURIComponent(email.toLowerCase())}:`;
const key = (email: string, location: string) => prefix(email) + encodeURIComponent(location.trim().toUpperCase());

function parse(raw: string | null): InputDraft | null {
  try {
    const draft = JSON.parse(raw || "null");
    if (draft?.version !== 1 || !draft.location || !Number.isFinite(draft.updatedAt) ||
      !Array.isArray(draft.products) || !Array.isArray(draft.newProducts) ||
      !draft.quantities || !draft.formulas || !draft.counted || !draft.newProductForm) return null;
    if ([...draft.products, ...draft.newProducts].some(p => !p || typeof p.sku !== "string" || typeof p.batch !== "string")) return null;
    return draft;
  } catch { return null; }
}

export function getDraft(email: string, location: string): InputDraft | null {
  try { return parse(localStorage.getItem(key(email, location))); } catch { return null; }
}

export function listDrafts(email: string): InputDraft[] {
  try {
    const drafts: InputDraft[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (!name?.startsWith(prefix(email))) continue;
      const draft = parse(localStorage.getItem(name));
      if (draft) drafts.push(draft);
    }
    return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

export function saveDraft(email: string, draft: InputDraft): void {
  localStorage.setItem(key(email, draft.location), JSON.stringify(draft));
}

export function removeDraft(email: string, location: string): void {
  localStorage.removeItem(key(email, location));
}
