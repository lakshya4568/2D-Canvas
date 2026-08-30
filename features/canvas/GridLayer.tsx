"use client";

import React from "react";
import { Viewport } from "@/lib/geometry/types";

interface GridLayerProps {
  viewport: Viewport;
  showGrid: boolean;
  gridSize?: number;
}

export const GridLayer: React.FC<GridLayerProps> = React.memo(
  ({ viewport, showGrid, gridSize = 20 }) => {
    if (!showGrid) return null;

    // Viewport matrix values
    const { scale, x, y } = viewport;
    const effectiveGridSize = gridSize;
    const majorGridSize = gridSize * 5;

    return (
      <g id="grid-layer" className="pointer-events-none select-none">
        <defs>
          {/* Small grid pattern */}
          <pattern
            id="small-grid"
            width={effectiveGridSize}
            height={effectiveGridSize}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${effectiveGridSize} 0 L 0 0 0 ${effectiveGridSize}`}
              fill="none"
              stroke="var(--grid-line)"
              strokeWidth={1 / scale}
            />
          </pattern>

          {/* Major grid pattern */}
          <pattern
            id="major-grid"
            width={majorGridSize}
            height={majorGridSize}
            patternUnits="userSpaceOnUse"
          >
            <rect width={majorGridSize} height={majorGridSize} fill="url(#small-grid)" />
            <path
              d={`M ${majorGridSize} 0 L 0 0 0 ${majorGridSize}`}
              fill="none"
              stroke="var(--grid-line)"
              strokeWidth={1.5 / scale}
            />
            {/* Center origin dot */}
            <circle cx={0} cy={0} r={1.5 / scale} fill="var(--grid-dot)" />
          </pattern>
        </defs>

        {/* Vast virtual canvas backdrop covering any pan / zoom bounds */}
        <rect
          x={-50000}
          y={-50000}
          width={100000}
          height={100000}
          fill="url(#major-grid)"
        />

        {/* Global origin crosshair (0, 0) */}
        <g id="origin-axes" opacity={0.4}>
          <line
            x1={-100}
            y1={0}
            x2={100}
            y2={0}
            stroke="var(--accent-select)"
            strokeWidth={1.5 / scale}
          />
          <line
            x1={0}
            y1={-100}
            x2={0}
            y2={100}
            stroke="var(--accent-select)"
            strokeWidth={1.5 / scale}
          />
        </g>
      </g>
    );
  }
);

GridLayer.displayName = "GridLayer";
