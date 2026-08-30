import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "2D Canvas Studio — Vector Geometry & Drawing System",
  description: "Next.js & Bun vector drawing workspace with pure SVG geometry, live dimensions, precision snapping, and lossless JSON/PNG export.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased w-screen h-screen overflow-hidden select-none bg-[var(--bg-app)] text-[var(--fg-primary)]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
