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
        border: "var(--border)",
      },
      boxShadow: {
        card: "var(--card-shadow)",
      },
    },
  },
  plugins: [],
};
export default config;
