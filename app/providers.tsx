"use client";

import React, { ReactNode } from "react";
import { DrawingProvider } from "@/lib/state/drawingContext";
import { UpceProvider } from "@/features/parametric/upceContext";
import { DocumentFileProvider } from "@/features/file/documentFile";

export function Providers({ children }: { children: ReactNode }) {
  // The authoring session sits inside the drafting session: it reads the shapes
  // the drafting reducer owns and hands back coordinates the solver produced.
  //
  // The file layer sits inside both, because a saved drawing is the pair: the
  // geometry AND the rules that produced it. Anything shallower would reopen a
  // drawing that had forgotten why it has the shape it has.
  return (
    <DrawingProvider>
      <UpceProvider>
        <DocumentFileProvider>{children}</DocumentFileProvider>
      </UpceProvider>
    </DrawingProvider>
  );
}
