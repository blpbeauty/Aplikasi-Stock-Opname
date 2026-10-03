import type { Config } from "tailwindcss";

/* rgb(var(--x-rgb) / <alpha-value>): nilai kanal didefinisikan di :root globals.css */
const ch = (name: string) => `rgb(var(--${name}-rgb) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        /* Inter = UI sans; JetBrains Mono = kode lokasi/SKU/batch/angka (.tnum) */
        sans: ["var(--font-inter)", "Arial", "sans-serif"],
        mono: ["var(--font-jetbrains)", "Consolas", "monospace"],
      },
      colors: {
        /* Warna memakai bentuk kanal (--x-rgb) supaya kelas opacity Tailwind
           (mis. border-primary/25, text-ivory/80) benar-benar menghasilkan CSS. */
        /* Palet inti "Label Rak Operasional" */
        espresso: ch("espresso"),
        cocoa: ch("cocoa"),
        ivory: ch("ivory"),
        paper: ch("paper"),
        ochre: ch("ochre"),
        amber: {
          text: ch("amber-text"),
          bg: ch("warning"),
        },

        /* Warna semantik */
        success: {
          DEFAULT: ch("success"),
          bg: ch("success-bg"),
        },
        danger: {
          DEFAULT: ch("danger"),
          bg: ch("danger-bg"),
        },
        info: {
          DEFAULT: ch("info"),
          bg: ch("info-bg"),
        },

        /* Alias yang sudah dipakai luas di aplikasi */
        primary: {
          DEFAULT: ch("primary"),
          light: ch("primary-light"),
          dark: ch("primary-dark"),
          pale: ch("primary-pale"),
          bg: ch("primary-bg"),
        },
        surface: {
          DEFAULT: ch("surface"),
          warm: ch("surface-warm"),
        },
        accent: {
          yellow: ch("accent-yellow"),
          red: ch("accent-red"),
          green: ch("accent-green"),
        },
        error: ch("error"),
        warning: {
          DEFAULT: ch("warning"),
          text: ch("warning-text"),
        },
        "text-primary": ch("text-primary"),
        "text-secondary": ch("text-secondary"),
        border: {
          DEFAULT: ch("border"),
          subtle: ch("border-subtle"),
          /* batas kontrol form: >= 3:1 terhadap kartu dan isi field */
          input: ch("border-input"),
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
           lembar/sheet 20px, chip/badge/status pill penuh. */
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
