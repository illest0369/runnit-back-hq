import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "Impact", "sans-serif"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      colors: {
        ink: "#050506",
        bone: "#f7f3ea",
        volt: "#39ff14",
        heat: "#ff3b30",
        haze: "rgba(247,243,234,0.62)",
      },
      boxShadow: {
        glow: "0 0 34px rgba(57, 255, 20, 0.28)",
        heat: "0 0 34px rgba(255, 59, 48, 0.24)",
      },
    },
  },
  plugins: [],
};

export default config;
