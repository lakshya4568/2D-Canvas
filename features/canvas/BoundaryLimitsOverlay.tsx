"use client";

import React from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { computeShapeBounds } from "@/lib/geometry/metrics";

interface BoundaryLimitsOverlayProps {
  scale: number;
}

export const BoundaryLimitsOverlay: React.FC<BoundaryLimitsOverlayProps> = ({ scale }) => {
  const { state } = useDrawing();
  const evals = state.boundaryEvaluations || [];

  if (evals.length === 0) return null;

  return (
    <g className="pointer-events-none select-none">
      {evals.map((ev) => {
        const isSelected = state.selectedId === ev.shapeId || state.selectedIds?.includes(ev.shapeId);
        if (!isSelected) return null;

        const shape = state.shapes.find((s) => s.id === ev.shapeId);
        if (!shape) return null;

        const bounds = computeShapeBounds(shape);
        const midX = bounds.minX + bounds.width / 2;
        const bannerY = bounds.minY - 18 / scale;

        const isExceeded = ev.state === "Exceeded";
        const isApproaching = ev.state === "Approaching Limit";

        if (!isExceeded && !isApproaching) return null;

        const badgeColor = isExceeded ? "#ef4444" : "#f59e0b";
        const badgeBg = isExceeded ? "rgba(239, 68, 68, 0.9)" : "rgba(245, 158, 11, 0.9)";
        const textMsg = isExceeded
          ? `⚠ Exceeds available span: current ${ev.currentSpan}px > max ${ev.maximumSpan}px`
          : `Approaching limit: ${ev.remainingUnits}px remaining`;

        const textWidth = Math.max(140, textMsg.length * 6.5) / scale;
        const textHeight = 16 / scale;

        return (
          <g key={`boundary_banner_${ev.shapeId}`}>
            {/* Warning Outline around violated shape */}
            {isExceeded && (
              <rect
                x={bounds.minX - 4 / scale}
                y={bounds.minY - 4 / scale}
                width={bounds.width + 8 / scale}
                height={bounds.height + 8 / scale}
                fill="none"
                stroke={badgeColor}
                strokeWidth={1.5 / scale}
                strokeDasharray={`${6 / scale}, ${3 / scale}`}
                className="animate-pulse"
              />
            )}

            {/* Warning Banner Pill */}
            <rect
              x={midX - textWidth / 2}
              y={bannerY - textHeight / 2}
              width={textWidth}
              height={textHeight}
              rx={4 / scale}
              fill={badgeBg}
            />
            <text
              x={midX}
              y={bannerY + 3.5 / scale}
              textAnchor="middle"
              fill="#ffffff"
              fontSize={10 / scale}
              fontFamily="system-ui, -apple-system, sans-serif"
              fontWeight="bold"
            >
              {textMsg}
            </text>
          </g>
        );
      })}
    </g>
  );
};
