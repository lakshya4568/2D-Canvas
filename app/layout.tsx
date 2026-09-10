import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "AutoCAD Web Studio · UPCE-MASTER-1.0",
  description:
    "AutoCAD-compatible Parametric 2D CAD Engine for civil engineering and drafting drawings.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="antialiased w-screen h-screen overflow-hidden select-none bg-(--ink-app) text-(--fg-primary) touch-none">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
