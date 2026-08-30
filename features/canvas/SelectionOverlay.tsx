"use client";

import React from "react";
import { Shape } from "@/lib/geometry/types";
import { computeShapeBounds } from "@/lib/geometry/metrics";
import { DimensionBadge } from "./DimensionBadge";

interface SelectionOverlayProps {
  shape: Shape | null;
  scale: number;
  onDelete: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = React.memo(
  ({ shape, scale, onDelete, onBringToFront, onSendToBack }) => {
    if (!shape) return null;

    const bounds = computeShapeBounds(shape);
    const strokeColor = "var(--accent-select)";
    const handleFill = "#ffffff";
    const handleStroke = "var(--accent-select)";
    const strokeWidth = 1.5 / scale;
    const handleSize = 7 / scale;
    const padding = 4 / scale;

    const boxX = bounds.minX - padding;
    const boxY = bounds.minY - padding;
    const boxW = bounds.width + padding * 2;
    const boxH = bounds.height + padding * 2;

    const handles = [
      { id: "nw", x: boxX, y: boxY },
      { id: "ne", x: boxX + boxW, y: boxY },
      { id: "se", x: boxX + boxW, y: boxY + boxH },
      { id: "sw", x: boxX, y: boxY + boxH },
      { id: "n", x: boxX + boxW / 2, y: boxY },
      { id: "e", x: boxX + boxW, y: boxY + boxH / 2 },
      { id: "s", x: boxX + boxW / 2, y: boxY + boxH },
      { id: "w", x: boxX, y: boxY + boxH / 2 },
    ];

    return (
      <g id="selection-overlay-layer" className="pointer-events-none">
        {/* Selection Bounding Box */}
        <rect
          x={boxX}
          y={boxY}
          width={boxW}
          height={boxH}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={`${4 / scale}, ${3 / scale}`}
          rx={2 / scale}
          style={{ filter: "drop-shadow(0 0 2px rgba(59, 130, 246, 0.4))" }}
        />

        {/* Line specific endpoint handles */}
        {shape.type === "line" ? (
          <>
            <circle
              cx={shape.x1}
              cy={shape.y1}
              r={handleSize / 1.5}
              fill={handleFill}
              stroke={handleStroke}
              strokeWidth={strokeWidth}
            />
            <circle
              cx={shape.x2}
              cy={shape.y2}
              r={handleSize / 1.5}
              fill={handleFill}
              stroke={handleStroke}
              strokeWidth={strokeWidth}
            />
          </>
        ) : (
          /* Bounding box corner/edge handles */
          handles.map((h) => (
            <rect
              key={h.id}
              x={h.x - handleSize / 2}
              y={h.y - handleSize / 2}
              width={handleSize}
              height={handleSize}
              fill={handleFill}
              stroke={handleStroke}
              strokeWidth={strokeWidth}
              rx={1 / scale}
            />
          ))
        )}

        {/* Active dimension badge for selected shape */}
        <DimensionBadge shape={shape} scale={scale} />
      </g>
    );
  }
);

SelectionOverlay.displayName = "SelectionOverlay";
