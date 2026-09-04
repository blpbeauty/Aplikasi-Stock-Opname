import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        /* Inter = UI sans; JetBrains Mono = kode lokasi/SKU/batch/angka */
        sans: ["var(--font-inter)", "Arial", "sans-serif"],
        mono: ["var(--font-jetbrains)", "Consolas", "monospace"],
      },
      colors: {
        /* Palet inti "Clean Industrial" (nama legacy tema lama dipertahankan
           sebagai alias agar class existing tetap bekerja) */
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
        /* Bayangan netral graphite, bukan hangat kecoklatan */
        card: "0 1px 2px rgba(20, 24, 31, 0.06), 0 4px 16px rgba(20, 24, 31, 0.06)",
        subtle: "0 1px 2px rgba(20, 24, 31, 0.05)",
        bar: "0 -4px 20px rgba(20, 24, 31, 0.08)",
        sheet: "0 12px 48px rgba(20, 24, 31, 0.22)",
      },
      borderRadius: {
        /* Radius berdasar fungsi: kontrol 10px, kartu 14px,
           sheet 20px, chip/badge/status pill penuh, band lokasi 8px. */
        input: "0.625rem",
        card: "0.875rem",
        sheet: "1.25rem",
        label: "9999px",
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
