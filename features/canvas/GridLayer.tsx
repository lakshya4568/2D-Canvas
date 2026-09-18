"use client";

import React from "react";
import { Viewport } from "@/lib/geometry/types";

interface GridLayerProps {
  viewport: Viewport;
  showGrid: boolean;
  gridSize?: number;
  /** Canvas size in px, so the grid covers exactly the visible window. */
  canvasSize?: { width: number; height: number };
}

/** Minimum on-screen spacing of grid dots; below this a grid is noise, not a guide. */
const MIN_GRID_PX = 12;

/**
 * Grid spacing that adapts to zoom in 1-2-5 steps, as drawing programs do: a
 * 20 mm grid is useful on a bolt detail and a grey smear on a 60 m bridge.
 */
export function adaptiveGridSize(base: number, scale: number): number {
  let size = base;
  const steps = [2, 2.5, 2];
  let k = 0;
  while (size * scale < MIN_GRID_PX && size < 1e9) {
    size *= steps[k % steps.length];
    k++;
  }
  return size;
}

export const GridLayer: React.FC<GridLayerProps> = React.memo(
  ({ viewport, showGrid, gridSize = 20, canvasSize }) => {
    if (!showGrid) return null;

    const { scale } = viewport;
    const effectiveGridSize = adaptiveGridSize(gridSize, scale);
    const majorGridSize = effectiveGridSize * 5;
    const W = canvasSize?.width ?? 2000;
    const H = canvasSize?.height ?? 1200;
    const x0 = Math.floor(-viewport.x / scale / majorGridSize - 1) * majorGridSize;
    const y0 = Math.floor(-viewport.y / scale / majorGridSize - 1) * majorGridSize;
    const w = W / scale + 2 * majorGridSize;
    const h = H / scale + 2 * majorGridSize;

    return (
      <g id="grid-layer" className="pointer-events-none select-none">
        <defs>
          {/* Small dot matrix pattern */}
          <pattern
            id="cad-small-grid"
            width={effectiveGridSize}
            height={effectiveGridSize}
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx={effectiveGridSize / 2}
              cy={effectiveGridSize / 2}
              r={0.8 / scale}
              fill="var(--grid-dot)"
            />
          </pattern>

          {/* Major grid pattern */}
          <pattern
            id="cad-major-grid"
            width={majorGridSize}
            height={majorGridSize}
            patternUnits="userSpaceOnUse"
          >
            <rect width={majorGridSize} height={majorGridSize} fill="url(#cad-small-grid)" />
            <path
              d={`M ${majorGridSize} 0 L 0 0 0 ${majorGridSize}`}
              fill="none"
              stroke="var(--grid-line)"
              strokeWidth={1 / scale}
            />
          </pattern>
        </defs>

        {/* Infinite Grid Background */}
        <rect x={x0} y={y0} width={w} height={h} fill="url(#cad-major-grid)" />

        {/* Origin Axes (0,0): Standard CAD convention X=Red, Y=Green */}
        <g id="origin-axes" opacity={0.45}>
          <line
            x1={-25 / scale}
            y1={0}
            x2={25 / scale}
            y2={0}
            stroke="#ef4444"
            strokeWidth={1.2 / scale}
            strokeDasharray={`${4 / scale}, ${4 / scale}`}
          />
          <line
            x1={0}
            y1={-25 / scale}
            x2={0}
            y2={25 / scale}
            stroke="#10b981"
            strokeWidth={1.2 / scale}
            strokeDasharray={`${4 / scale}, ${4 / scale}`}
          />
        </g>
      </g>
    );
  }
);

GridLayer.displayName = "GridLayer";
