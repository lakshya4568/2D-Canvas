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
  const {
    state,
    toggleGrid,
    toggleGridSnap,
    toggleOrtho,
    togglePolarTracking,
    toggleObjectSnap,
    toggleDynamicInput,
  } = useDrawing();
  const scalePct = Math.round(state.viewport.scale * 100);
  const shapeCount = state.shapes.filter((s) => s.isVisible !== false).length;

  return (
    <footer className="h-[26px] shrink-0 bg-(--ink-panel) border-t border-(--rule) px-3 flex items-center gap-3 text-[10.5px] text-(--fg-muted) z-30 select-none">
      {/* Coordinate readout — always present, tabular so digits do not jitter. */}
      <div className="flex items-center gap-2 min-w-[155px]">
        <span className="label">XY</span>
        <span className="num text-(--fg-secondary) text-[11px]">
          {cursorPos
            ? `${cursorPos.x.toFixed(1)}, ${cursorPos.y.toFixed(1)}`
            : "—, —"}
        </span>
      </div>

      <div className="w-px h-[13px] bg-(--rule)" aria-hidden="true" />

      {/* AutoCAD Drafting Tray Toggles */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggleGrid}
          title="Grid Display (F7)"
          className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
            state.showGrid
              ? "bg-(--accent-soft) text-(--accent) font-semibold"
              : "text-(--fg-muted) hover:text-(--fg-secondary)"
          }`}
        >
          GRID
        </button>
        <button
          type="button"
          onClick={toggleGridSnap}
          title="Snap Mode (F9)"
          className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
            state.gridSnapEnabled
              ? "bg-(--accent-soft) text-(--accent) font-semibold"
              : "text-(--fg-muted) hover:text-(--fg-secondary)"
          }`}
        >
          SNAP
        </button>
        <button
          type="button"
          onClick={toggleOrtho}
          title="Ortho Mode (F8)"
          className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
            state.orthoEnabled
              ? "bg-(--accent-soft) text-(--accent) font-semibold"
              : "text-(--fg-muted) hover:text-(--fg-secondary)"
          }`}
        >
          ORTHO
        </button>
        <button
          type="button"
          onClick={togglePolarTracking}
          title="Polar Tracking (F10)"
          className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
            state.polarTrackingEnabled
              ? "bg-(--accent-soft) text-(--accent) font-semibold"
              : "text-(--fg-muted) hover:text-(--fg-secondary)"
          }`}
        >
          POLAR
        </button>
        <button
          type="button"
          onClick={toggleObjectSnap}
          title="Object Snap / OSNAP (F3)"
          className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
            state.objectSnapEnabled
              ? "bg-(--accent-soft) text-(--accent) font-semibold"
              : "text-(--fg-muted) hover:text-(--fg-secondary)"
          }`}
        >
          OSNAP
        </button>
        <button
          type="button"
          onClick={toggleDynamicInput}
          title="Dynamic Input (F12)"
          className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
            state.dynamicInputEnabled
              ? "bg-(--accent-soft) text-(--accent) font-semibold"
              : "text-(--fg-muted) hover:text-(--fg-secondary)"
          }`}
        >
          DYN
        </button>
      </div>

      <div className="w-px h-[13px] bg-(--rule)" aria-hidden="true" />

      <div className="flex items-center gap-2">
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
