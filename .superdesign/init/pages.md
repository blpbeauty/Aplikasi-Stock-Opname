# Pages — component dependency trees

All pages are client components. Shared imports (`react-hot-toast` toasts, `@/lib/api`, `@/lib/cache`, `@/lib/types`, `@/components/icons`) omitted per tree for brevity; trees show local UI components.

## /scan (Scan Dashboard — main screen)
Entry: `src/app/scan/page.tsx` (608 lines)
Dependencies:
- `src/components/BottomNav.tsx`
- `src/components/ScannerModal.tsx`
  - `src/components/BarcodeScanner.tsx` (html5-qrcode camera)
  - `src/components/ui.tsx` (Dialog)
- `src/components/MoveSheet.tsx`
  - `src/components/ui.tsx` (Dialog)
  - `src/components/Autocomplete.tsx`
- `src/components/ui.tsx` (Dialog, EmptyState, SyncStatusBadge)
- `src/components/Autocomplete.tsx`
- `src/components/LoadingSpinner.tsx`
- `src/components/AuthProvider.tsx` (useAuth)
- `src/components/DataSyncProvider.tsx` (useDataSync)

Renders: greeting + `SyncStatusBadge`; location picker (Autocomplete + camera scan); stats cards row (total/scanned/pending + progress %); pending locations modal (Dialog list); recent scans list (last 5 locations with time + count); global product finder (search + camera); quick move via MoveSheet.

## /input?location=CODE (Count sheet per location — most complex page)
Entry: `src/app/input/page.tsx` (1204 lines, wrapped in Suspense for useSearchParams)
Dependencies:
- `src/components/BottomNav.tsx`
- `src/components/LoadingSpinner.tsx`
- `src/components/ScannerModal.tsx`
  - `src/components/BarcodeScanner.tsx`
  - `src/components/ui.tsx` (Dialog)
- `src/components/MoveSheet.tsx`
- `src/components/QtyInput.tsx` (wide, with expression keypad)
- `src/components/ConfirmModal.tsx`
- `src/components/ui.tsx` (PageHeader, LocationBand, EmptyState, Field, IconButton)
- `src/components/Autocomplete.tsx`
- `src/components/AuthProvider.tsx` (useAuth)

Renders: `PageHeader` (back to /scan, right slot: move-all button) + `LocationBand` (active location code); search filter; list of master products for the location as count rows (name, SKU, batch chips incl. inline batch edit, expand/collapse details, wide QtyInput per row with formula tracking, delete/edit icon actions); "add new product" collapsible form (barcode scan, product autocomplete, SKU/batch/qty, save to master); save bar with unsaved-changes and all-zero `ConfirmModal`s; new-product success toast.

## /history (Riwayat)
Entry: `src/app/history/page.tsx` (868 lines)
Dependencies:
- `src/components/BottomNav.tsx`
- `src/components/EditModal.tsx`
  - `src/components/ScannerModal.tsx`, `src/components/QtyInput.tsx`, `src/components/ui.tsx` (Dialog, Field), `src/components/Autocomplete.tsx`
- `src/components/AddHistoryEntryModal.tsx`
  - `src/components/ScannerModal.tsx`, `src/components/QtyInput.tsx`, `src/components/ui.tsx` (Dialog, Field), `src/components/Autocomplete.tsx`
- `src/components/LoadingSpinner.tsx`
- `src/components/QtyInput.tsx` (inline qty edit)
- `src/components/ConfirmModal.tsx`
- `src/components/ui.tsx` (EmptyState, IconButton)
- `src/components/AuthProvider.tsx` (useAuth)

Renders: header with add (+) and refresh IconButtons; search input; date-range filter; tab bar (Semua/Hari ini/Pekan ini/Bulan ini); location multi-filter chips; entries grouped by location (collapsible group headers with count); per-entry card: product name, SKU/batch/location meta, qty (inline editable via QtyInput), formula note, edit (EditModal) + delete (ConfirmModal) actions.

## /profile
Entry: `src/app/profile/page.tsx` (246 lines)
Dependencies:
- `src/components/BottomNav.tsx`
- `src/components/ConfirmModal.tsx`
- `src/components/AuthProvider.tsx` (useAuth: user, logout)

Renders: user identity card (name/email); stats (lokasi discan, total items, total entri); location-group progress section (grouped by prefix e.g. CEN/PARAS, progress per group); location list with MapPin; info block; logout button → ConfirmModal.

## /login
Entry: `src/app/login/page.tsx` (114 lines)
Dependencies:
- `src/components/ui.tsx` (Field)
- `src/components/AuthProvider.tsx` (useAuth: login)

Renders: centered max-w-sm; `location-band` brand block ("Stock Opname" / "Gudang BLP"); card with form: email + password Fields, danger error alert, full-width submit "Masuk".

## / (redirector) & 404
- `src/app/page.tsx` (25 lines): session check → redirect /scan or /login; LoadingSpinner centered.
- `src/app/not-found.tsx` (23 lines): simple message + link home.
