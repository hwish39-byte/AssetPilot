import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        mist: "#f6f8fb",
        line: "#d9e1ec",
        mint: "#14b8a6",
        gold: "#d99b2b",
        danger: "#d94f45",
        terminal: {
          bg: "#05070a",
          shell: "#080c11",
          panel: "#0b0f14",
          raised: "#101720",
          line: "#1f2a37",
          text: "#e5eef7",
          muted: "#7d8b9a",
          subtle: "#52606f"
        },
        signal: {
          live: "#22d3ee",
          pass: "#34d399",
          warn: "#f59e0b",
          danger: "#fb7185"
        }
      },
      boxShadow: {
        panel: "0 18px 50px rgba(17, 24, 39, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
