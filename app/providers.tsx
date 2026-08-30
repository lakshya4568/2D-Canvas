"use client";

import React, { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { DrawingProvider } from "@/lib/state/drawingContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <DrawingProvider>{children}</DrawingProvider>
    </ThemeProvider>
  );
}
