"use client";

import React from "react";
import { SnapResult } from "@/lib/geometry/types";

interface SnapIndicatorProps {
  snap: SnapResult | null;
  scale: number;
}

export const SnapIndicator: React.FC<SnapIndicatorProps> = React.memo(({ snap, scale }) => {
  if (!snap || !snap.snapped || !snap.targetPoint) return null;

  const { x, y } = snap.targetPoint;
  const isVertex = snap.snapType === "vertex";
  const strokeColor = snap.category === "perpendicular" ? "#38bdf8" : isVertex ? "#ff9500" : "#0066ff";
  const ringRadius = (isVertex ? 7 : 5) / scale;
  const dotRadius = (isVertex ? 2.5 : 2) / scale;

  const categoryLabel = snap.category ? snap.category.toUpperCase() : isVertex ? "VERTEX" : "GRID";

  return (
    <g id="snap-indicator-layer" className="pointer-events-none select-none">
      {/* Alignment Guide Lines */}
      {snap.guideLines?.map((line, idx) => (
        <line
          key={idx}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="#38bdf8"
          strokeWidth={1 / scale}
          strokeDasharray={`${4 / scale}, ${4 / scale}`}
          opacity={0.8}
        />
      ))}

      {/* Target Marker */}
      <g transform={`translate(${x}, ${y})`}>
        {/* Outer pulsing snap ring */}
        <circle
          r={ringRadius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2 / scale}
        />
        {/* Center dot */}
        <circle r={dotRadius} fill={strokeColor} />

        {/* Crosshair lines for vertex snap */}
        {isVertex && (
          <>
            <line
              x1={-ringRadius - 3 / scale}
              y1={0}
              x2={ringRadius + 3 / scale}
              y2={0}
              stroke={strokeColor}
              strokeWidth={1.2 / scale}
            />
            <line
              x1={0}
              y1={-ringRadius - 3 / scale}
              x2={0}
              y2={ringRadius + 3 / scale}
              stroke={strokeColor}
              strokeWidth={1.2 / scale}
            />
          </>
        )}

        {/* Category Label Chip */}
        <g transform={`translate(${12 / scale}, ${-10 / scale})`}>
          <rect
            x={0}
            y={0}
            width={categoryLabel.length * 6.5 / scale + 10 / scale}
            height={15 / scale}
            rx={2 / scale}
            fill="rgba(15, 23, 42, 0.95)"
            stroke={strokeColor}
            strokeWidth={1 / scale}
          />
          <text
            x={5 / scale}
            y={10.5 / scale}
            fill="#ffffff"
            fontSize={8.5 / scale}
            fontFamily="JetBrains Mono, monospace"
            fontWeight="bold"
            letterSpacing={0.5}
          >
            {categoryLabel}
          </text>
        </g>
      </g>
    </g>
  );
});

SnapIndicator.displayName = "SnapIndicator";
