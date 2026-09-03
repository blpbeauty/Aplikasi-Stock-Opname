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
      boxShadow: {
        card: "0 2px 14px rgba(45, 30, 20, 0.06)",
        cardHover: "0 4px 20px rgba(45, 30, 20, 0.10)",
        subtle: "0 1px 3px rgba(45, 30, 20, 0.04)",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
    },
  },
  plugins: [],
};
export default config;
