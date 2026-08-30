"use client";

import React from "react";
import { Shape } from "@/lib/geometry/types";
import { DimensionBadge } from "./DimensionBadge";

interface ShapeRendererProps {
  shapes: Shape[];
  selectedIds: string[];
  showDimensions: boolean;
  scale: number;
  onSelectShape: (id: string, e: React.PointerEvent) => void;
}

const SingleShape = React.memo<{
  shape: Shape;
  isSelected: boolean;
  showDimensions: boolean;
  scale: number;
  onSelectShape: (id: string, e: React.PointerEvent) => void;
}>(({ shape, isSelected, showDimensions, scale, onSelectShape }) => {
  if (shape.isVisible === false) return null;

  const strokeColor = isSelected ? "#0066ff" : shape.strokeColor || "#c2c6d8";
  const strokeWidth = (shape.strokeWidth || 1.5) * (isSelected ? 1.2 : 1);
  const opacity = shape.opacity ?? 1;

  const handlePointerDown = (e: React.PointerEvent) => {
    onSelectShape(shape.id, e);
  };

  return (
    <g
      id={`shape-${shape.id}`}
      className="cursor-pointer transition-colors duration-100 group"
      onPointerDown={handlePointerDown}
      style={{ opacity: shape.isLocked ? opacity * 0.7 : opacity }}
    >
      {/* Invisible hit-testing cushion */}
      {shape.type === "line" && (
        <line
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
          stroke="transparent"
          strokeWidth={Math.max(16 / scale, strokeWidth + 10 / scale)}
          strokeLinecap="round"
        />
      )}

      {/* Render Shape */}
      {shape.type === "line" && (
        <line
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={shape.strokeDasharray}
          strokeLinecap="round"
        />
      )}

      {shape.type === "rectangle" && (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          fill={shape.fillColor || "transparent"}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={shape.strokeDasharray}
          rx={0}
        />
      )}

      {shape.type === "circle" && (
        <circle
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r}
          fill={shape.fillColor || "transparent"}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={shape.strokeDasharray}
        />
      )}

      {/* Persistent Dimension Badge */}
      {showDimensions && !isSelected && (
        <DimensionBadge shape={shape} scale={scale} />
      )}
    </g>
  );
});

SingleShape.displayName = "SingleShape";

export const ShapeRenderer: React.FC<ShapeRendererProps> = React.memo(
  ({ shapes, selectedIds, showDimensions, scale, onSelectShape }) => {
    return (
      <g id="shapes-layer">
        {shapes.map((shape) => (
          <SingleShape
            key={shape.id}
            shape={shape}
            isSelected={selectedIds.includes(shape.id)}
            showDimensions={showDimensions}
            scale={scale}
            onSelectShape={onSelectShape}
          />
        ))}
      </g>
    );
  }
);

ShapeRenderer.displayName = "ShapeRenderer";
