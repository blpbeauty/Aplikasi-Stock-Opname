# Theme — "Label Rak Operasional" Design System

Mobile-first PWA untuk stock opname gudang (warehouse inventory count). Bahasa UI: Indonesia.

## Part 1 — Compact token summary

**Concept:** "Operational Shelf Label" — warehouse shelving-label aesthetic. Espresso brown = text/headers/primary buttons; Ivory = app background; Paper = surfaces (inputs, lists, modals); Ochre = decorative accent only; semantic colors tuned for WCAG AA on light backgrounds.

### Colors (CSS variables, light-only — no dark mode)
| Token | Value | Usage |
|---|---|---|
| `--espresso` / `--primary` | `#2f2119` | Primary text, headers, primary buttons |
| `--primary-light` | `#4a382c` | Hover on primary |
| `--primary-dark` | `#1d140e` | Pressed |
| `--primary-pale` | `#efe6d4` | Active-tab chip, subtle fills |
| `--cocoa` | `#654c3e` | Secondary text |
| `--ivory` / `--primary-bg` | `#f7f3ea` | App background; text on primary buttons |
| `--paper` / `--surface` | `#fffdf8` | Cards, inputs, modals, nav bar |
| `--surface-warm` | `#f2ecdf` | Input backgrounds, secondary buttons |
| `--ochre` / `--accent-yellow` | `#d49b4b` | Decorative accent, focus outline (NOT small text) |
| `--amber-text` / `--warning-text` | `#7a4b08` | Warning/status text on light bg |
| `--warning` / `--amber-bg` | `#fdf3e0` | Warning background |
| `--success` / `--accent-green` | `#1e6b33` (+ bg `#e6f1e8`) | Success |
| `--danger` / `--error` / `--accent-red` | `#b3261e` (+ bg `#fbeae8`) | Danger/destructive |
| `--info` | `#1f4e79` (+ bg `#e7eef6`) | Info/syncing |
| `--text-primary` | `#2f2119` | Body text |
| `--text-secondary` | `#5f4b3e` | Secondary text |
| `--border` | `#e3dac8` | Borders |
| `--border-subtle` | `#eee7d8` | Dividers |
| focus ring | `0 0 0 3px rgba(212,155,75,.65)`, outline `2px solid var(--ochre)` | Keyboard focus |

### Typography
- Font: **Atkinson Hyperlegible** (local woff2 400/700, via `next/font/local`, variable `--font-atkinson`, fallback Arial). Chosen for legibility of numbers/SKU and look-alike chars (I/l/1, O/0) in warehouse conditions.
- Scale: `text-meta` = 0.875rem/1.35 (metadata, min size), `text-base2` = 1rem/1.45 (body/forms, min size), then Tailwind defaults (`text-base` 1rem for headings via bold, `text-xl`, `text-lg`).
- `.tnum` utility: `font-variant-numeric: tabular-nums` for quantities & location codes.

### Radius (function-based)
| Token | Value | Usage |
|---|---|---|
| `rounded-label` | 4px (0.25rem) | Status badges, small chips |
| `rounded-input` | 10px (0.625rem) | Inputs, buttons, icon buttons |
| `rounded-card` | 14px (0.875rem) | Cards |
| `rounded-sheet` | 20px (1.25rem) | Bottom sheets / dialogs |

### Shadows
- `shadow-card`: `0 1px 3px rgba(45,30,20,.08), 0 4px 14px rgba(45,30,20,.06)`
- `shadow-subtle`: `0 1px 2px rgba(45,30,20,.05)`
- `shadow-bar`: `0 -4px 20px rgba(45,30,20,.08)` (bottom nav)
- `shadow-sheet`: `0 -8px 40px rgba(30,20,12,.25)` (dialogs/sheets)

### Layout & touch
- App shell max-width **720px** (`45rem`, `.app-shell`/`.mobile-container`), centered; mobile-first.
- Touch targets min **44px** (`.tap`, `min-h-touch` = 2.75rem, `min-h-touchLg` = 3rem).
- `pb-safe` = `env(safe-area-inset-bottom)`. Bottom nav fixed, 4rem min height.
- Animations: `animate-fadeIn` (0.2s), `animate-slideUp` (0.25s, sheets/dialogs); `prefers-reduced-motion` respected.

## Part 2 — Raw source dumps

### `tailwind.config.ts`
```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Palet inti "Label Rak Operasional" */
        espresso: "var(--espresso)",
        cocoa: "var(--cocoa)",
        ivory: "var(--ivory)",
        paper: "var(--paper)",
        ochre: "var(--ochre)",
        amber: {
          text: "var(--amber-text)",
          bg: "var(--warning)",
        },

        /* Warna semantik */
        success: {
          DEFAULT: "var(--success)",
          bg: "var(--success-bg)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          bg: "var(--danger-bg)",
        },
        info: {
          DEFAULT: "var(--info)",
          bg: "var(--info-bg)",
        },

        /* Alias yang sudah dipakai luas di aplikasi */
        primary: {
          DEFAULT: "var(--primary)",
          light: "var(--primary-light)",
          dark: "var(--primary-dark)",
          pale: "var(--primary-pale)",
          bg: "var(--primary-bg)",
        },
        surface: {
          DEFAULT: "var(--surface)",
          warm: "var(--surface-warm)",
        },
        accent: {
          yellow: "var(--accent-yellow)",
          red: "var(--accent-red)",
          green: "var(--accent-green)",
        },
        error: "var(--error)",
        warning: {
          DEFAULT: "var(--warning)",
          text: "var(--warning-text)",
        },
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        border: {
          DEFAULT: "var(--border)",
          subtle: "var(--border-subtle)",
        },
      },
      fontSize: {
        /* Skala minimum: 16px isi/form, 14px metadata */
        meta: ["0.875rem", { lineHeight: "1.35" }],
        base2: ["1rem", { lineHeight: "1.45" }],
      },
      boxShadow: {
        card: "0 1px 3px rgba(45, 30, 20, 0.08), 0 4px 14px rgba(45, 30, 20, 0.06)",
        subtle: "0 1px 2px rgba(45, 30, 20, 0.05)",
        bar: "0 -4px 20px rgba(45, 30, 20, 0.08)",
        sheet: "0 -8px 40px rgba(30, 20, 12, 0.25)",
      },
      borderRadius: {
        /* Radius berbeda berdasar fungsi: input 10px, kartu 14px,
           lembar/sheet 20px, label/status 4px. */
        input: "0.625rem",
        card: "0.875rem",
        sheet: "1.25rem",
        label: "0.25rem",
      },
      minHeight: {
        touch: "2.75rem", /* 44px */
        touchLg: "3rem", /* 48px */
      },
    },
  },
  plugins: [],
};
export default config;
```

### `src/app/globals.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* ── Konsep "Label Rak Operasional" ──
     Espresso = teks/header/tombol primer. Cocoa = teks sekunder.
     Ivory = latar aplikasi. Paper = permukaan input/daftar/modal.
     Ochre = aksen dekoratif saja (bukan teks kecil).
     Amber text = teks status/peringatan di latar terang (WCAG AA). */
  --espresso: #2f2119;
  --cocoa: #654c3e;
  --ivory: #f7f3ea;
  --paper: #fffdf8;
  --ochre: #d49b4b;
  --amber-text: #7a4b08;

  /* Warna semantik (kontras AA di atas latar terang) */
  --success: #1e6b33;
  --success-bg: #e6f1e8;
  --danger: #b3261e;
  --danger-bg: #fbeae8;
  --info: #1f4e79;
  --info-bg: #e7eef6;
  --warning: #fdf3e0;
  --warning-text: #7a4b08;

  /* Alias yang dipakai luas di seluruh aplikasi */
  --primary: #2f2119;
  --primary-light: #4a382c;
  --primary-dark: #1d140e;
  --primary-pale: #efe6d4;
  --primary-bg: #f7f3ea;
  --surface: #fffdf8;
  --surface-warm: #f2ecdf;

  --accent-yellow: #d49b4b;
  --accent-red: #b3261e;
  --accent-green: #1e6b33;
  --error: #b3261e;

  --text-primary: #2f2119;
  --text-secondary: #5f4b3e;
  --border: #e3dac8;
  --border-subtle: #eee7d8;

  --focus-ring: 0 0 0 3px rgba(212, 155, 75, 0.65);
}

/* Base styles */
body {
  background-color: var(--primary-bg);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior-y: none;
}

html {
  scroll-behavior: smooth;
}

/* Angka kuantitas & kode lokasi: digit selebar sama agar mudah dibandingkan */
.tnum {
  font-variant-numeric: tabular-nums;
}

/* ── Shell aplikasi ──
   Ponsel tetap prioritas, tapi desktop/tablet tidak memperkecil
   konten ke 448px: konten utama maksimum 720px. */
.app-shell {
  width: 100%;
  max-width: 45rem; /* 720px */
  margin-left: auto;
  margin-right: auto;
  min-height: 100vh;
  min-height: 100dvh;
  position: relative;
  background-color: var(--primary-bg);
}

.mobile-container {
  width: 100%;
  max-width: 45rem;
  margin-left: auto;
  margin-right: auto;
  min-height: 100vh;
  min-height: 100dvh;
  position: relative;
  background-color: var(--primary-bg);
}

/* ── Location band: pita lokasi bergaya label rak ──
   Selalu menjawab "saya sedang bekerja di lokasi mana?". */
.location-band {
  background-color: var(--espresso);
  color: var(--ivory);
  border-left: 6px solid var(--ochre);
  border-radius: 4px;
  padding: 0.75rem 1rem;
}
.location-band .location-band-code {
  font-size: 1.75rem; /* 28px — tetap terbaca di 320px */
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  word-break: break-all;
  font-variant-numeric: tabular-nums;
}
@media (min-width: 640px) {
  .location-band .location-band-code {
    font-size: 2.25rem; /* 36px */
  }
}
.location-band .location-band-sub {
  color: #d8cdbd;
  font-size: 0.875rem;
}

/* ── Bidang status / sektor gaya lembar kerja ── */
.rail {
  border-left: 4px solid var(--border);
  padding-left: 0.75rem;
}
.rail-espresso {
  border-left-color: var(--espresso);
}
.rail-ochre {
  border-left-color: var(--ochre);
}
.rail-success {
  border-left-color: var(--success);
}
.rail-danger {
  border-left-color: var(--danger);
}

/* Target sentuh minimum 44px */
.tap {
  min-width: 44px;
  min-height: 44px;
}

/* Hide scrollbar but keep scroll */
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Safe area bottom padding for notch devices */
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

/* ── Focus ring yang terlihat untuk navigasi keyboard ── */
a:focus-visible,
button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--ochre);
  outline-offset: 2px;
}

/* ── Animasi bersama (dipakai dialog / sheet / prompt) ── */
@keyframes so-fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes so-slideUp {
  from { transform: translateY(24px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.animate-fadeIn {
  animation: so-fadeIn 0.2s ease-out;
}
.animate-slideUp {
  animation: so-slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Hormati preferensi reduced motion */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### Font setup (`src/app/layout.tsx`, excerpt)
```tsx
const atkinson = localFont({
  src: [
    { path: "../fonts/atkinson-hyperlegible-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/atkinson-hyperlegible-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  fallback: ["Arial", "sans-serif"],
  display: "swap",
  variable: "--font-atkinson",
});
// viewport: themeColor "#2f2119", userScalable: true (pinch zoom deliberately NOT restricted)
```
