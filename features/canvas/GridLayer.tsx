"use client";

import React from "react";
import { Viewport } from "@/lib/geometry/types";
import { ThemeMode } from "@/lib/state/drawingReducer";

interface GridLayerProps {
  viewport: Viewport;
  showGrid: boolean;
  themeMode?: ThemeMode;
  gridSize?: number;
}

export const GridLayer: React.FC<GridLayerProps> = React.memo(
  ({ viewport, showGrid, themeMode = "dark", gridSize = 20 }) => {
    if (!showGrid) return null;

    const { scale } = viewport;
    const effectiveGridSize = gridSize;
    const majorGridSize = gridSize * 5;

    const isBlueprint = themeMode === "blueprint";

    return (
      <g id="grid-layer" className="pointer-events-none select-none">
        <defs>
          {/* Small dot/line pattern */}
          <pattern
            id="cad-small-grid"
            width={effectiveGridSize}
            height={effectiveGridSize}
            patternUnits="userSpaceOnUse"
          >
            {isBlueprint ? (
              <path
                d={`M ${effectiveGridSize} 0 L 0 0 0 ${effectiveGridSize}`}
                fill="none"
                stroke="rgba(56, 189, 248, 0.12)"
                strokeWidth={0.75 / scale}
              />
            ) : (
              <circle
                cx={effectiveGridSize / 2}
                cy={effectiveGridSize / 2}
                r={0.8 / scale}
                fill="var(--grid-dot)"
              />
            )}
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
              stroke={isBlueprint ? "rgba(56, 189, 248, 0.25)" : "var(--grid-line)"}
              strokeWidth={1 / scale}
            />
          </pattern>
        </defs>

        {/* Infinite Grid Background */}
        <rect
          x={-50000}
          y={-50000}
          width={100000}
          height={100000}
          fill="url(#cad-major-grid)"
        />

        {/* Origin Axes (0,0) */}
        <g id="origin-axes" opacity={0.35}>
          <line
            x1={-500}
            y1={0}
            x2={500}
            y2={0}
            stroke={isBlueprint ? "#38bdf8" : "#0066ff"}
            strokeWidth={1 / scale}
            strokeDasharray={`${4 / scale}, ${4 / scale}`}
          />
          <line
            x1={0}
            y1={-500}
            x2={0}
            y2={500}
            stroke={isBlueprint ? "#38bdf8" : "#0066ff"}
            strokeWidth={1 / scale}
            strokeDasharray={`${4 / scale}, ${4 / scale}`}
          />
        </g>
      </g>
    );
  }
);

GridLayer.displayName = "GridLayer";
