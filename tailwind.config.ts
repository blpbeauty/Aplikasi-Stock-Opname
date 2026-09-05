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
        /* Inter sebagai UI sans di atas palet cokelat-ivory */
        sans: ["var(--font-inter)", "Arial", "sans-serif"],
      },
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
