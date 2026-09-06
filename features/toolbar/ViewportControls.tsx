"use client";

import React from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid,
  Magnet,
  Crosshair,
  Ruler,
} from "lucide-react";

export function ViewportControls() {
  const {
    state,
    setViewport,
    resetViewport,
    toggleGrid,
    toggleGridSnap,
    toggleObjectSnap,
    toggleDimensions,
  } = useDrawing();

  const currentZoomPercent = Math.round(state.viewport.scale * 100);

  const handleZoom = (factor: number) => {
    const nextScale = Math.max(0.1, Math.min(10, state.viewport.scale * factor));
    setViewport({
      ...state.viewport,
      scale: nextScale,
    });
  };

  return (
    <div className="flex items-center gap-1 p-1.5 rounded-2xl glass-panel shadow-lg text-xs font-medium">
      {/* Zoom controls */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => handleZoom(0.8)}
          className="p-1.5 rounded-lg text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] active:scale-95 transition-all"
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          onClick={resetViewport}
          className="px-2 py-1 rounded-lg text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] font-mono font-semibold transition-all min-w-[50px] text-center"
          title="Reset Zoom to 100%"
          aria-label="Reset Zoom"
        >
          {currentZoomPercent}%
        </button>

        <button
          onClick={() => handleZoom(1.25)}
          className="p-1.5 rounded-lg text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-panel-subtle)] active:scale-95 transition-all"
          title="Zoom In"
          aria-label="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      <div className="w-[1px] h-5 bg-[var(--border-subtle)] mx-1" />

      {/* Grid Toggle */}
      <button
        onClick={toggleGrid}
        className={`p-1.5 rounded-lg transition-all ${
          state.showGrid
            ? "bg-amber-500/15 text-amber-500 font-semibold"
            : "text-[var(--fg-secondary)] hover:bg-[var(--bg-panel-subtle)]"
        }`}
        title={`Grid: ${state.showGrid ? "Visible" : "Hidden"}`}
        aria-label="Toggle Grid"
      >
        <Grid className="w-4 h-4" />
      </button>

      {/* Grid Snapping Toggle */}
      <button
        onClick={toggleGridSnap}
        className={`p-1.5 rounded-lg transition-all ${
          state.gridSnapEnabled
            ? "bg-amber-500/15 text-amber-500 font-semibold"
            : "text-[var(--fg-secondary)] hover:bg-[var(--bg-panel-subtle)]"
        }`}
        title={`Snap to Grid: ${state.gridSnapEnabled ? "ON" : "OFF"}`}
        aria-label="Toggle Grid Snap"
      >
        <Magnet className="w-4 h-4" />
      </button>

      {/* Object / Vertex Snapping Toggle */}
      <button
        onClick={toggleObjectSnap}
        className={`p-1.5 rounded-lg transition-all ${
          state.objectSnapEnabled
            ? "bg-amber-500/15 text-amber-500 font-semibold"
            : "text-[var(--fg-secondary)] hover:bg-[var(--bg-panel-subtle)]"
        }`}
        title={`Snap to Objects & Vertices: ${state.objectSnapEnabled ? "ON" : "OFF"}`}
        aria-label="Toggle Vertex Snap"
      >
        <Crosshair className="w-4 h-4" />
      </button>

      {/* Persistent Dimensions Toggle */}
      <button
        onClick={toggleDimensions}
        className={`p-1.5 rounded-lg transition-all ${
          state.showDimensions
            ? "bg-emerald-500/15 text-emerald-500 font-semibold"
            : "text-[var(--fg-secondary)] hover:bg-[var(--bg-panel-subtle)]"
        }`}
        title={`Dimension Badges: ${state.showDimensions ? "Visible" : "Hidden"}`}
        aria-label="Toggle Dimension Badges"
      >
        <Ruler className="w-4 h-4" />
      </button>
    </div>
  );
}
