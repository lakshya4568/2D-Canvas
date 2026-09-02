"use client";

import React from "react";
import { Shape } from "@/lib/geometry/types";
import { computeMultiShapeBounds } from "@/lib/geometry/metrics";

export type HandleType = "nw" | "ne" | "se" | "sw" | "n" | "s" | "e" | "w";

interface SelectionOverlayProps {
  shapes: Shape[];
  scale: number;
  onHandlePointerDown?: (handle: HandleType, cursor: string, e: React.PointerEvent) => void;
  onRotatePointerDown?: (e: React.PointerEvent) => void;
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = React.memo(
  ({ shapes, scale, onHandlePointerDown, onRotatePointerDown }) => {
    if (shapes.length === 0) return null;

    const bounds = computeMultiShapeBounds(shapes);
    if (!bounds) return null;

    const isGroup = shapes.length > 1;
    const strokeColor = "#0066ff";
    const handleFill = "#ffffff";
    const handleStroke = "#0066ff";
    const strokeWidth = 1.5 / scale;
    const handleSize = 8 / scale;
    const rotHandleRadius = 5 / scale;
    const padding = 2 / scale;

    const boxX = bounds.minX - padding;
    const boxY = bounds.minY - padding;
    const boxW = bounds.width + padding * 2;
    const boxH = bounds.height + padding * 2;

    const rotation = shapes.length === 1 ? shapes[0].rotation || 0 : 0;
    const transformAttr = rotation !== 0 ? `rotate(${rotation} ${bounds.centerX} ${bounds.centerY})` : undefined;

    const handles: { id: HandleType; x: number; y: number; cursor: string }[] = [
      { id: "nw", x: boxX, y: boxY, cursor: "nwse-resize" },
      { id: "ne", x: boxX + boxW, y: boxY, cursor: "nesw-resize" },
      { id: "se", x: boxX + boxW, y: boxY + boxH, cursor: "nwse-resize" },
      { id: "sw", x: boxX, y: boxY + boxH, cursor: "nesw-resize" },
      { id: "n", x: boxX + boxW / 2, y: boxY, cursor: "ns-resize" },
      { id: "s", x: boxX + boxW / 2, y: boxY + boxH, cursor: "ns-resize" },
      { id: "e", x: boxX + boxW, y: boxY + boxH / 2, cursor: "ew-resize" },
      { id: "w", x: boxX, y: boxY + boxH / 2, cursor: "ew-resize" },
    ];

    const rotHandleY = boxY - 24 / scale;

    return (
      <g id="selection-overlay-layer" transform={transformAttr}>
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
          className="pointer-events-none"
        />

        {/* Figma-Style Top Rotation Stem & Handle */}
        <line
          x1={bounds.centerX}
          y1={boxY}
          x2={bounds.centerX}
          y2={rotHandleY}
          stroke={strokeColor}
          strokeWidth={1 / scale}
          className="pointer-events-none"
        />
        <circle
          cx={bounds.centerX}
          cy={rotHandleY}
          r={rotHandleRadius}
          fill={handleFill}
          stroke={handleStroke}
          strokeWidth={strokeWidth}
          className="cursor-grab pointer-events-auto"
          onPointerDown={(e) => {
            e.stopPropagation();
            onRotatePointerDown?.(e);
          }}
        >
          <title>Drag to Rotate (Hold Shift to snap to 15°)</title>
        </circle>

        {/* Figma-Style Interactive Resize Handles - Solid, zero-jitter */}
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
            className="pointer-events-auto"
            style={{ cursor: h.cursor }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onHandlePointerDown?.(h.id, h.cursor, e);
            }}
          />
        ))}

        {/* Rotation Angle Indicator (if rotated) */}
        {shapes.length === 1 && rotation !== 0 && (
          <g
            className="pointer-events-none select-none"
            transform={`translate(${bounds.centerX}, ${rotHandleY - 14 / scale})`}
          >
                <rect
                  x={-28 / scale}
                  y={-10 / scale}
                  width={56 / scale}
                  height={18 / scale}
                  rx={2 / scale}
                  fill="rgba(15, 23, 42, 0.9)"
                  stroke="#0066ff"
                  strokeWidth={1 / scale}
                />
                <text
                  x={0}
                  y={-1 / scale}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#ffffff"
                  fontSize={10 / scale}
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="600"
                >
                  {`⟳ ${rotation.toFixed(0)}°`}
                </text>
              </g>
            )}
      </g>
    );
  }
);

SelectionOverlay.displayName = "SelectionOverlay";
