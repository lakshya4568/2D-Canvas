"use client";

import React from "react";
import { Point } from "@/lib/geometry/types";
import { useDrawing } from "@/lib/state/drawingContext";
import { ConstraintChip } from "./ConstraintStatus";
import { DEFAULT_TOLERANCE_POLICY } from "@/lib/geometry/tolerance";

/**
 * The status strip.
 *
 * A CAD status bar exists to answer three questions without being asked: where
 * is the cursor, what is the drawing's state, and what units am I in. §17 makes
 * the last one load-bearing — "ONE canonical internal unit, always" — so the unit
 * is stated explicitly rather than assumed, and the weld tolerance in force is
 * shown next to it.
 */
export function StatusStrip({ cursorPos }: { cursorPos: Point | null }) {
  const { state } = useDrawing();
  const scalePct = Math.round(state.viewport.scale * 100);
  const shapeCount = state.shapes.filter((s) => s.isVisible !== false).length;

  return (
    <footer className="h-[26px] shrink-0 bg-(--ink-panel) border-t border-(--rule) px-3 flex items-center gap-4 text-[10.5px] text-(--fg-muted) z-30">
      {/* Coordinate readout — always present, tabular so digits do not jitter. */}
      <div className="flex items-center gap-2.5 min-w-[168px]">
        <span className="label">XY</span>
        <span className="num text-(--fg-secondary) text-[11px]">
          {cursorPos
            ? `${cursorPos.x.toFixed(1)}, ${cursorPos.y.toFixed(1)}`
            : "—, —"}
        </span>
      </div>

      <div className="w-px h-[13px] bg-(--rule)" aria-hidden="true" />

      <div className="flex items-center gap-2.5">
        <span className="label">Units</span>
        <span className="num text-(--fg-secondary) text-[11px]">
          mm · weld {DEFAULT_TOLERANCE_POLICY.weld_mm}
        </span>
      </div>

      <div className="w-px h-[13px] bg-(--rule)" aria-hidden="true" />

      <span>
        <span className="num text-(--fg-secondary)">{shapeCount}</span> entities
      </span>

      <div className="flex-1" />

      <ConstraintChip />

      <div className="w-px h-[13px] bg-(--rule)" aria-hidden="true" />

      <span className="num text-(--fg-secondary) text-[11px] tabular-nums">
        {scalePct}%
      </span>
    </footer>
  );
}
