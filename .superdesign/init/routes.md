# Routes — Aplikasi Stock Opname (Next.js App Router)

Meta-framework: Next.js 16 (App Router, file-based routing under `src/app/`).
All pages are client components (`"use client"`). Auth-gated: pages redirect to `/login` when no session (via `AuthProvider` + per-page `useEffect`).

| Route | File | Layout | Description |
|---|---|---|---|
| `/` | `src/app/page.tsx` | root | Redirector only: session → `/scan`, else → `/login`. Renders `LoadingSpinner` centered. |
| `/login` | `src/app/login/page.tsx` | root | Login form for warehouse operators (email + password). Uses `location-band` branding block "Stock Opname / Gudang BLP", card form with `Field`, error alert, full-width submit button. |
| `/scan` | `src/app/scan/page.tsx` | root + `BottomNav` | **Scan dashboard** (main screen). Location search/scan entry, progress stats (total/scanned/pending/progress %), pending locations modal, recent scans list (last 5), global product finder (search + camera scan), quick-move product via `MoveSheet`. |
| `/input?location=CODE` | `src/app/input/page.tsx` | root + `BottomNav` | **Per-location count sheet**. `LocationBand` header showing active location, filter search, product list with `QtyInput` per row, add-new-product form (with barcode scan + autocomplete), inline batch editing, move-all via `MoveSheet`, save with zero-qty confirm + unsaved-changes confirm (`ConfirmModal`). |
| `/history` | `src/app/history/page.tsx` | root + `BottomNav` | **Riwayat (History)**. Search + date-range filter + tabs (all/today/week/month) + location filter, entries grouped by location (collapsible), inline edit qty/batch (`QtyInput`), edit via `EditModal`, add entry via `AddHistoryEntryModal`, delete via `ConfirmModal`. |
| `/profile` | `src/app/profile/page.tsx` | root + `BottomNav` | User info, stats (locations scanned, total items, entries), location-group progress bars (CEN/PARAS etc.), location list, logout via `ConfirmModal`. |
| `*` (404) | `src/app/not-found.tsx` | root | Simple not-found page with link home. |

No separate route config file — routing is purely file-based. `BottomNav` tabs: Scan (`/scan`), Riwayat (`/history`), Profil (`/profile`).
