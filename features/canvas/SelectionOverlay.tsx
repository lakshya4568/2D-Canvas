"use client";

import React from "react";
import { Shape, CadGrip } from "@/lib/geometry/types";
import { computeMultiShapeBounds } from "@/lib/geometry/metrics";
import { computeEntityGrips } from "@/lib/geometry/grips";

export type HandleType = "nw" | "ne" | "se" | "sw" | "n" | "s" | "e" | "w" | "grip";

interface SelectionOverlayProps {
  shapes: Shape[];
  scale: number;
  activeGripId?: string | null;
  onGripPointerDown?: (grip: CadGrip, e: React.PointerEvent) => void;
  onHandlePointerDown?: (handle: HandleType, cursor: string, e: React.PointerEvent) => void;
  onRotatePointerDown?: (e: React.PointerEvent) => void;
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = React.memo(
  ({ shapes, scale, activeGripId, onGripPointerDown }) => {
    if (shapes.length === 0) return null;

    const bounds = computeMultiShapeBounds(shapes);
    if (!bounds) return null;

    const isGroup = shapes.length > 1;
    const strokeColor = "#f59e0b";
    const strokeWidth = 1.2 / scale;
    const padding = 2 / scale;

    const boxX = bounds.minX - padding;
    const boxY = bounds.minY - padding;
    const boxW = bounds.width + padding * 2;
    const boxH = bounds.height + padding * 2;

    const rotation = shapes.length === 1 ? shapes[0].rotation || 0 : 0;
    const transformAttr = rotation !== 0 ? `rotate(${rotation} ${bounds.centerX} ${bounds.centerY})` : undefined;

    const allGrips: CadGrip[] = [];
    for (const shape of shapes) {
      allGrips.push(...computeEntityGrips(shape));
    }

    const gripSize = 7 / scale;

    return (
      <g id="selection-overlay-layer" transform={transformAttr}>
        <rect
          x={boxX}
          y={boxY}
          width={boxW}
          height={boxH}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={`${4 / scale}, ${4 / scale}`}
          opacity={isGroup ? 0.9 : 0.6}
          className="pointer-events-none"
        />

        {allGrips.map((grip) => {
          const isHot = activeGripId === grip.id;
          const isMidpoint = grip.type === "midpoint";
          const isCenter = grip.type === "center";
          const size = isMidpoint ? 6 / scale : gripSize;

          let fill = "#ffffff";
          let stroke = "#d97706";

          if (isHot) {
            fill = "#ef4444";
            stroke = "#b91c1c";
          } else if (isCenter) {
            fill = "#f59e0b";
            stroke = "#ffffff";
          } else if (isMidpoint) {
            fill = "#fef3c7";
            stroke = "#d97706";
          }

          return (
            <rect
              key={grip.id}
              x={grip.x - size / 2}
              y={grip.y - size / 2}
              width={size}
              height={size}
              fill={fill}
              stroke={stroke}
              strokeWidth={1.2 / scale}
              className="pointer-events-auto transition-transform hover:scale-125"
              style={{ cursor: grip.cursor }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onGripPointerDown?.(grip, e);
              }}
            >
              {grip.tooltip && <title>{grip.tooltip}</title>}
            </rect>
          );
        })}
      </g>
    );
  }
);

SelectionOverlay.displayName = "SelectionOverlay";
