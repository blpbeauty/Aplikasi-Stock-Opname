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
        card: "0 8px 24px -6px rgba(14, 131, 140, 0.12)",
        subtle: "0 2px 12px -3px rgba(14, 131, 140, 0.09)",
        bar: "0 -4px 20px -4px rgba(14, 131, 140, 0.10)",
        sheet: "0 -10px 30px -6px rgba(11, 102, 110, 0.16)",
      },
      borderRadius: {
        input: "0.75rem", /* 12px */
        card: "1rem", /* 16px */
        sheet: "1.25rem", /* 20px */
        label: "0.5rem", /* 8px */
      },
      minHeight: {
        touch: "2.75rem", /* 44px mobile touch minimum */
        touchLg: "3rem", /* 48px */
      },
    },
  },
  plugins: [],
};
export default config;
