"use client";

import React, { ReactNode } from "react";
import { DrawingProvider } from "@/lib/state/drawingContext";

export function Providers({ children }: { children: ReactNode }) {
  return <DrawingProvider>{children}</DrawingProvider>;
}
