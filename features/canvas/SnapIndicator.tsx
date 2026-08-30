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
  const strokeColor = isVertex ? "var(--accent-snap)" : "var(--accent-select)";
  const ringRadius = (isVertex ? 7 : 5) / scale;
  const dotRadius = (isVertex ? 2.5 : 2) / scale;

  return (
    <g id="snap-indicator" className="pointer-events-none" transform={`translate(${x}, ${y})`}>
      {/* Outer snap ring */}
      <circle
        r={ringRadius}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2 / scale}
        className="animate-pulse"
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
            strokeWidth={1 / scale}
          />
          <line
            x1={0}
            y1={-ringRadius - 3 / scale}
            x2={0}
            y2={ringRadius + 3 / scale}
            stroke={strokeColor}
            strokeWidth={1 / scale}
          />
        </>
      )}
    </g>
  );
});

SnapIndicator.displayName = "SnapIndicator";
