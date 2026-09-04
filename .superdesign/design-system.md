# Design System — Stock Opname BLP (Redesign 2026: "Clean Industrial")

> Direction chosen by user (2026-09-05): **total new style**, replacing the previous "Label Rak Operasional" (espresso/ivory/ochre) concept. Product unchanged: mobile-first PWA for warehouse operators doing stock opname (inventory count) in Indonesian, often offline, gloves/glint screens, big numbers, speed matters.

## Product context
- Key pages: `/scan` (dashboard), `/input?location=CODE` (count sheet), `/history` (riwayat), `/profile`, `/login`.
- Core jobs: pick/scan a location, count products per location fast, edit history, monitor progress.
- Non-negotiable functional requirements (keep from old system): 44px min touch targets, WCAG AA contrast on all text, tabular numerals (`tnum`) for quantities/SKU/location codes, high-contrast "active location" always visible, honest sync status, reduced-motion support.

## Style direction: "Clean Industrial"
A crisp, modern industrial tool: white/neutral surfaces, deep graphite structure, one high-visibility safety-amber accent. Feels like professional warehouse software (think linear.io clarity × industrial signage), not a consumer app.

### Colors
| Role | Token | Value | Usage |
|---|---|---|---|
| Background | `bg` | `#f4f5f7` | App background (cool neutral gray) |
| Surface | `surface` | `#ffffff` | Cards, sheets, nav bar, inputs |
| Surface alt | `surface-muted` | `#eef0f3` | Secondary buttons, input fills, chips |
| Ink / primary text | `ink` | `#14181f` | Headings, body, primary buttons |
| Ink secondary | `ink-secondary` | `#5a6472` | Meta text, subtitles |
| Ink tertiary | `ink-tertiary` | `#8a93a2` | Placeholders, disabled |
| Border | `border` | `#e2e5ea` | Card & input borders |
| Border strong | `border-strong` | `#c9ced7` | Emphasis borders, dividers |
| Primary (structure) | `primary` | `#14181f` (ink) | Primary buttons, active states; hover `#262d38`; pressed `#0b0e13` |
| Accent (highlight) | `accent` | `#f5a623` (safety amber) | Active tab pill, focus ring, location band border, progress; decorative only, never small text |
| Accent soft | `accent-soft` | `#fdf1dc` | Active chips bg, highlight fills |
| Location band bg | `band` | `#14181f` | Location band: ink bg, white code, amber left border |
| Success | `success` | `#12805c` (+bg `#e2f5ee`) | Success states |
| Danger | `danger` | `#d92d20` (+bg `#fdecea`) | Destructive, errors |
| Info | `info` | `#175cd3` (+bg `#eaf1fd`) | Info/syncing |
| Warning text | `warning-text` | `#93540a` (+bg `#fdf1dc`) | Warnings (AA on light bg) |
| On-primary text | `on-primary` | `#ffffff` | Text on ink/primary buttons |

### Typography
- **Inter** (Google Fonts; 400/500/600/700) — modern geometric UI sans, excellent numerals.
- **JetBrains Mono** (500/700) for location codes, SKU, batch — industrial data feel, tabular by default.
- Scale: display 28–36px (location code), title 20px/700, heading 17px/600, body 15px/1.5, meta 13px/1.4 (min 13px), micro 11px uppercase tracking-wide for labels/eyebrows.

### Radius
- Controls/inputs/buttons: 10px · Cards: 14px · Sheets/dialogs: 20px top corners · Chips/badges/status: full (999px) · Location band: 8px.

### Shadows & elevation
- Card: `0 1px 2px rgba(20,24,31,.06), 0 4px 16px rgba(20,24,31,.06)`
- Subtle: `0 1px 2px rgba(20,24,31,.05)`
- Bottom bar: `0 -4px 20px rgba(20,24,31,.08)`
- Sheet/dialog: `0 12px 48px rgba(20,24,31,.22)`

### Motion
- 150–200ms ease-out; sheets slide up 24px + fade; buttons `active:scale-[0.98]`; skeletons (pulse) instead of spinners for lists where possible; respect `prefers-reduced-motion`.

### Components (signature elements)
- **Location band**: ink background, amber 4px left border, 8px radius; location code in JetBrains Mono 28–36px white uppercase; sub-line in gray-400.
- **Bottom nav**: white bar, top border, 3 tabs; active = amber-soft pill behind icon + ink label (replaces old brown pill).
- **Buttons**: primary = ink bg white text; secondary = surface-muted bg ink text; danger = danger bg white text; all 44px min height, 10px radius.
- **Count row (input page)**: white card, product name 15px/600, SKU·batch in JetBrains Mono 13px ink-secondary, qty in JetBrains Mono on the right; expand chevron; actions as icon buttons.
- **Progress**: amber progress bar on surface-muted track; stats as big JetBrains Mono numerals.
- **Status chips**: pill, semantic bg + text + leading dot/icon (never color-only).

### Icons
Inline SVG stroke icons, 24px grid, stroke-width 2, round caps (same set as current `src/components/icons.tsx`) — reproduce 1:1.
