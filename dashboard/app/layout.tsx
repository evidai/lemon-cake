import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LemonCake",
  description: "AI Agent M2M Payment Infrastructure Dashboard",
  icons: {
    icon: "/logo.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
