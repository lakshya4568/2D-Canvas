"use client";

import React from "react";
import { Shape, LineShape, RectangleShape, CircleShape } from "@/lib/geometry/types";
import { DimensionBadge } from "./DimensionBadge";

interface ShapeRendererProps {
  shapes: Shape[];
  selectedId: string | null;
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
  const strokeColor = isSelected ? "var(--accent-select)" : shape.strokeColor || "#3b82f6";
  const strokeWidth = (shape.strokeWidth || 2) * (isSelected ? 1.2 : 1);
  const opacity = shape.opacity ?? 1;

  const handlePointerDown = (e: React.PointerEvent) => {
    onSelectShape(shape.id, e);
  };

  return (
    <g
      id={`shape-${shape.id}`}
      className="cursor-pointer transition-colors duration-100 group"
      onPointerDown={handlePointerDown}
      style={{ opacity }}
    >
      {/* Invisible thicker hit-testing area for fine lines / strokes */}
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

      {/* Render shape primitive */}
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
          className="transition-all duration-100"
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
          rx={2}
          className="transition-all duration-100"
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
          className="transition-all duration-100"
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
  ({ shapes, selectedId, showDimensions, scale, onSelectShape }) => {
    return (
      <g id="shapes-layer">
        {shapes.map((shape) => (
          <SingleShape
            key={shape.id}
            shape={shape}
            isSelected={shape.id === selectedId}
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
