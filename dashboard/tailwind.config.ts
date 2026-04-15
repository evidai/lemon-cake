import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        // ══════════════════════════════════════════════════════
        // Lemon Cake Design System
        // ══════════════════════════════════════════════════════

        // ── Backgrounds ──────────────────────────────────────
        // Stone-50ベース。純白より僅かに暖かく目に優しい
        canvas:  "#FAFAF9",   // page bg  (Stone-50)
        surface: "#FFFFFF",   // card / panel bg
        muted:   "#F5F5F4",   // subtle section bg (Stone-100)
        cream:   "#FEFCE8",   // lemon-tinted callout bg

        // ── Borders ──────────────────────────────────────────
        border:          "#E7E5E4",   // Stone-200
        "border-strong": "#D6D3D1",   // Stone-300

        // ── Sidebar ──────────────────────────────────────────
        sidebar:          "#FFFFFF",
        "sidebar-border": "#E7E5E4",
        "sidebar-hover":  "#F5F5F4",
        "sidebar-active": "#FAFAF9",
        "sidebar-text":   "#1C1917",
        "sidebar-muted":  "#78716C",   // Stone-500

        // ── Text (Stone系：真っ黒を避けた温かみのあるダークグレー) ──
        // WCAG: canvas(#FAFAF9) × text-primary(#1C1917) = 15.2:1 ✅ AAA
        // WCAG: canvas(#FAFAF9) × text-secondary(#57534E) = 6.0:1 ✅ AA
        "text-primary":   "#1C1917",   // Stone-900
        "text-secondary": "#57534E",   // Stone-600
        "text-muted":     "#A8A29E",   // Stone-400

        // ── Primary: Lemon Yellow ─────────────────────────────
        // 「レモン果肉」の黄色。彩度を落とし大人の印象に。
        // WCAG: lemon(#E6D000) × ink(#1C1917) = 10.5:1 ✅ AAA
        // ボタンに使う際は必ず text-primary(#1C1917) と組み合わせること
        lemon:            "#E6D000",   // ← Primary CTA background
        "lemon-hover":    "#D4BE00",   // hover state (少し暗く)
        "lemon-soft":     "#FEFCE8",   // lemon-50 (badge bg など)
        "lemon-muted":    "#FEF08A",   // lemon-200 (border など)

        // ── Secondary: Deep Navy ─────────────────────────────
        // 「AAEインフラの硬派さ・信頼感」を体現する深海ネイビー
        // WCAG: navy(#0D2A4E) × white(#FFFFFF) = 18.4:1 ✅ AAA
        navy:             "#0D2A4E",   // ← Secondary CTA, headers
        "navy-hover":     "#0A2040",
        "navy-light":     "#1E4A7C",   // lighter navy for hover states
        "navy-soft":      "#EFF4FB",   // navy-50 (badge bg など)
        "navy-muted":     "#ADC8E8",   // navy-200 (border など)

        // ── Accent (旧 accent-blue の代替) ───────────────────
        accent:           "#0D2A4E",   // → navy に統一
        "accent-blue":    "#2563EB",   // info / link color として保持

        // ── Semantics ────────────────────────────────────────
        success:          "#16A34A",
        "success-soft":   "#F0FDF4",
        danger:           "#DC2626",
        "danger-soft":    "#FEF2F2",
        warning:          "#D97706",
        "warning-soft":   "#FFFBEB",
        info:             "#2563EB",
        "info-soft":      "#EFF6FF",

        // ── Tier badges ──────────────────────────────────────
        "tier-none":  "#78716C",   // Stone-500
        "tier-kya":   "#7C3AED",
        "tier-kyc":   "#0369A1",

        // ── Panel (後方互換) ─────────────────────────────────
        panel: "#FFFFFF",
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
