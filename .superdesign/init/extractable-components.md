# Extractable components — candidates for Superdesign DraftComponents

## Layout Components (appear on most pages)

## BottomNav
- Source: `src/components/BottomNav.tsx`
- Category: layout
- Description: Fixed bottom navigation bar with 3 tabs (Scan, Riwayat, Profil), active tab pill chip behind icon
- Extractable props: `activePage` ("scan" | "history" | "profile", default "scan")
- Hardcoded: tab labels, hrefs, icon set, all CSS

## PageHeader
- Source: `src/components/ui.tsx` (exported `PageHeader`)
- Category: layout
- Description: Sticky page header with back button, bold title, subtitle slot, right action slot
- Extractable props: `title` (string), `subtitle` (ReactNode), `onBack` (fn), `backLabel` (string, default "Kembali"), `right` (ReactNode)
- Hardcoded: chevron icon, all CSS

## LocationBand
- Source: `src/components/ui.tsx` (exported `LocationBand`) + `.location-band` CSS in `src/app/globals.css`
- Category: layout
- Description: Signature dark espresso strip with ochre left border showing active location code in huge uppercase tabular digits
- Extractable props: `code` (string), `sub` (ReactNode)
- Hardcoded: all CSS

## SyncStatusBadge
- Source: `src/components/ui.tsx` (exported `SyncStatusBadge`)
- Category: layout
- Description: Tap-to-retry sync status chip (Menyinkronkan… / Offline / Gagal sinkron / Siap offline / Belum sinkron)
- Extractable props: none (reads DataSync context)
- Hardcoded: labels, tone colors, all CSS

## Basic Components (used across pages)

## Dialog
- Source: `src/components/ui.tsx` (exported `Dialog`)
- Category: basic
- Description: Bottom sheet on mobile / centered dialog on desktop; header with title + close, scrollable body, footer slot; focus trap + Escape + scroll lock
- Extractable props: `isOpen`, `onClose`, `title`, `description`, `children`, `footer`, `size` ("sm" | "md", default "md")
- Hardcoded: backdrop, animations, all CSS

## IconButton
- Source: `src/components/ui.tsx` (exported `IconButton`)
- Category: basic
- Description: 44/48px square icon button with accessible label
- Extractable props: `label`, `onClick`, `variant` ("neutral" | "primary" | "danger"), `size` ("md" | "lg"), `disabled`, `title`
- Hardcoded: variant colors, radius, all CSS

## Field
- Source: `src/components/ui.tsx` (exported `Field`)
- Category: basic
- Description: Form field wrapper with bold label, required marker, hint, error (role=alert)
- Extractable props: `id`, `label`, `hint`, `error`, `required`, `children`
- Hardcoded: typography, spacing, all CSS

## EmptyState
- Source: `src/components/ui.tsx` (exported `EmptyState`)
- Category: basic
- Description: Card-style empty state with icon tile, title, description, action slot
- Extractable props: `icon`, `title`, `description`, `action`
- Hardcoded: icon tile styling, all CSS

## ConfirmModal
- Source: `src/components/ConfirmModal.tsx`
- Category: basic
- Description: Two-button confirmation dialog (cancel / confirm, optional danger + busy state)
- Extractable props: `isOpen`, `title`, `message`, `confirmText`, `cancelText`, `isDanger`, `busy`, `onConfirm`, `onClose`
- Hardcoded: default button labels, all CSS

## QtyInput
- Source: `src/components/QtyInput.tsx`
- Category: basic
- Description: Quantity input supporting safe math expressions (+ − × ÷) with live preview pill, = commit button, operator keypad row, 123/abc toggle
- Extractable props: `value`, `onChange`, `wide` (boolean), `onExprCommit`, `onCommit`, `ariaLabel`
- Hardcoded: operator buttons, preview styling, all CSS

## Autocomplete
- Source: `src/components/Autocomplete.tsx`
- Category: basic
- Description: Debounced async autocomplete input with dropdown results, loading + empty states, clear button
- Extractable props: `id`, `label`, `value`, `onValueChange`, `resolve`, `getKey`, `renderItem`, `onSelect`, `placeholder`, `uppercase`, `minChars`, `debounceMs`, `emptyText`, `hint`, `error`
- Hardcoded: search/clear icons, all CSS

## BrandBLP
- Source: `src/components/BrandBLP.tsx`
- Category: basic
- Description: "BLP STOCK OPNAME" letterspaced wordmark
- Extractable props: `className`, `compact` (boolean)
- Hardcoded: text, tracking, all CSS

## LoadingSpinner
- Source: `src/components/LoadingSpinner.tsx`
- Category: basic
- Description: Centered circular spinner in primary color
- Extractable props: none
- Hardcoded: size, color, all CSS

## Page-specific (not extractable, but redesign-relevant)
- Count row (product count list item with QtyInput) — inline in `src/app/input/page.tsx`
- Stats cards + progress — inline in `src/app/scan/page.tsx` and `src/app/profile/page.tsx`
- Location-group collapsible entry card — inline in `src/app/history/page.tsx`
