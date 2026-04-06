import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  safelist: [
    "severity-normal",
    "severity-elevated",
    "severity-critical",
    "severity-unknown",
    "severity-dot-normal",
    "severity-dot-elevated",
    "severity-dot-critical",
    "severity-dot-unknown",
    "reading-normal",
    "reading-elevated",
    "reading-critical",
    "reading-unknown",
    "chart-stat-card-normal",
    "chart-stat-card-elevated",
    "chart-stat-card-critical",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0b1015",
          900: "#10171d",
          800: "#162028",
          700: "#23323d",
          600: "#3a4d59",
          500: "#5b7380",
          400: "#8fa6b0",
          300: "#bfd0d6",
          200: "#dbe6ea",
          100: "#eef4f6",
        },
        mist: {
          500: "#7dd3c7",
        },
        ember: {
          500: "#f4a259",
        },
      },
      fontFamily: {
        sans: ["Manrope", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      boxShadow: {
        panel: "0 18px 42px rgba(0, 0, 0, 0.22)",
      },
      backgroundImage: {
        "app-grid":
          "radial-gradient(circle at top left, rgba(125, 211, 199, 0.12), transparent 24%), radial-gradient(circle at right 20%, rgba(244, 162, 89, 0.12), transparent 26%), linear-gradient(180deg, #0c1218 0%, #121920 46%, #182129 100%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
