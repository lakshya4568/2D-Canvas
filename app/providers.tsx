"use client";

import React, { ReactNode } from "react";
import { DrawingProvider } from "@/lib/state/drawingContext";
import { UpceProvider } from "@/features/parametric/upceContext";

export function Providers({ children }: { children: ReactNode }) {
  // The authoring session sits inside the drafting session: it reads the shapes
  // the drafting reducer owns and hands back coordinates the solver produced.
  return (
    <DrawingProvider>
      <UpceProvider>{children}</UpceProvider>
    </DrawingProvider>
  );
}
