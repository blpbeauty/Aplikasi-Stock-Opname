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
        sans: ["var(--font-inter)", "Arial", "sans-serif"],
        mono: ["var(--font-jetbrains)", "Consolas", "monospace"],
      },
      colors: {
        espresso: ch("espresso"),
        cocoa: ch("cocoa"),
        ivory: ch("ivory"),
        paper: ch("paper"),
        ochre: ch("ochre"),
        amber: {
          text: ch("amber-text"),
          bg: ch("warning"),
        },
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
          input: ch("border-input"),
        },
      },
      fontSize: {
        meta: ["0.75rem", { lineHeight: "1.35" }],
        base2: ["0.875rem", { lineHeight: "1.4" }],
      },
      boxShadow: {
        card: "none",
        subtle: "none",
        bar: "none",
        sheet: "0 -4px 20px rgba(15, 23, 42, 0.15)",
      },
      borderRadius: {
        input: "0.25rem", /* 4px */
        card: "0.375rem", /* 6px */
        sheet: "0.5rem", /* 8px */
        label: "0.25rem", /* 4px */
      },
      minHeight: {
        touch: "2.25rem", /* 36px (h-9 compact) */
        touchLg: "2.5rem", /* 40px (h-10) */
      },
    },
  },
  plugins: [],
};
export default config;
