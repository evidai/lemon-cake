/**
 * LemonCake brand theme — keep in sync with dashboard/app/about/page.tsx
 */
export const theme = {
  // Colors
  bgDark:   "#06060a",
  bgCream:  "#fffd43",
  textDark: "#1a0f00",
  white:    "#ffffff",
  red:      "#ef4444",
  green:    "#10b981",
  purple:   "#a855f7",

  // Fonts — use system stack; swap to Inter/SF Pro if rendered on a machine with them
  font:     '-apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", "Segoe UI", sans-serif',
  fontMono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
} as const;
