"use client";

import React from "react";
import { Shape } from "@/lib/geometry/types";
import { computeMultiShapeBounds } from "@/lib/geometry/metrics";
import { DimensionBadge } from "./DimensionBadge";
import { Group, Ungroup, Trash2, Copy } from "lucide-react";

interface SelectionOverlayProps {
  shapes: Shape[];
  scale: number;
  onGroup?: () => void;
  onUngroup?: () => void;
  onDuplicate?: () => void;
  onDelete: () => void;
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = React.memo(
  ({ shapes, scale, onGroup, onUngroup, onDuplicate, onDelete }) => {
    if (shapes.length === 0) return null;

    const bounds = computeMultiShapeBounds(shapes);
    if (!bounds) return null;

    const isGroup = shapes.length > 1;
    const strokeColor = "#0066ff";
    const handleFill = "var(--bg-canvas)";
    const handleStroke = "#0066ff";
    const strokeWidth = 1.5 / scale;
    const handleSize = 6 / scale;
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
    ];

    const hasGroup = shapes.some((s) => !!s.groupId);

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
          strokeDasharray={isGroup ? `${4 / scale}, ${4 / scale}` : undefined}
          rx={0}
        />

        {/* Handles */}
        {handles.map((h) => (
          <rect
            key={h.id}
            x={h.x - handleSize / 2}
            y={h.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill={handleFill}
            stroke={handleStroke}
            strokeWidth={strokeWidth}
          />
        ))}

        {/* Group or Single Dimension Badge */}
        {shapes.length === 1 ? (
          <DimensionBadge shape={shapes[0]} scale={scale} />
        ) : (
          <g
            className="pointer-events-none select-none"
            transform={`translate(${bounds.centerX}, ${boxY - 14 / scale})`}
          >
            <rect
              x={-55 / scale}
              y={-14 / scale}
              width={110 / scale}
              height={18 / scale}
              rx={2 / scale}
              fill="rgba(15, 23, 42, 0.9)"
              stroke="#0066ff"
              strokeWidth={1 / scale}
            />
            <text
              x={0}
              y={-4 / scale}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#ffffff"
              fontSize={10 / scale}
              fontFamily="JetBrains Mono, monospace"
              fontWeight="600"
            >
              {hasGroup ? `GROUP (${shapes.length})` : `SELECTED (${shapes.length})`}
            </text>
          </g>
        )}
      </g>
    );
  }
);

SelectionOverlay.displayName = "SelectionOverlay";
