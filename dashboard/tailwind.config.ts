import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        // ── Page / content (light gray canvas like Skyfire) ──
        canvas:  "#f5f5f5",
        surface: "#ffffff",

        // ── Sidebar (white, exactly like Skyfire) ───────────
        sidebar:          "#ffffff",
        "sidebar-border": "#e5e5e5",
        "sidebar-hover":  "#f5f5f5",
        "sidebar-active": "#f0f0f0",
        "sidebar-text":   "#111827",
        "sidebar-muted":  "#6b7280",

        // ── Cards / panels ───────────────────────────────────
        panel:          "#ffffff",
        border:         "#e5e5e5",
        "border-strong":"#d1d5db",

        // ── Text ─────────────────────────────────────────────
        "text-primary":  "#111827",
        "text-secondary":"#4b5563",
        "text-muted":    "#9ca3af",

        // ── Accent (Skyfire uses near-black for CTAs) ────────
        accent:       "#111827",
        "accent-blue":"#2563eb",

        // ── Semantics ────────────────────────────────────────
        success:        "#16a34a",
        "success-soft": "#f0fdf4",
        danger:         "#dc2626",
        "danger-soft":  "#fef2f2",
        warning:        "#d97706",
        "warning-soft": "#fffbeb",

        // ── Tier badges ──────────────────────────────────────
        "tier-none": "#6b7280",
        "tier-kya":  "#7c3aed",
        "tier-kyc":  "#0369a1",

        // ── Skyfire warm cream (onboarding / CTA boxes) ─────
        cream: "#faf7f2",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "ui-monospace", "monospace"],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(-4px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.4" },
        },
        "halt-blink": {
          "0%, 49%":   { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
      },
      animation: {
        "fade-in":    "fade-in 0.2s ease-out",
        "slide-down": "slide-down 0.12s ease-out",
        "pulse-dot":  "pulse-dot 2s ease-in-out infinite",
        "halt-blink": "halt-blink 0.9s step-end infinite",
      },
    },
  },
  plugins: [],
};
export default config;
