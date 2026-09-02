"use client";

import React from "react";
import { Shape } from "@/lib/geometry/types";
import { DimensionBadge } from "./DimensionBadge";
import { getShapeCenter, getPolygonPoints, getStarPoints, pointsToSvgString } from "@/lib/geometry/metrics";

interface ShapeRendererProps {
  shapes: Shape[];
  selectedIds: string[];
  showDimensions: boolean;
  scale: number;
  isSelectTool: boolean;
  themeMode?: "dark" | "light";
  onSelectShape: (id: string, e: React.PointerEvent) => void;
}

const SingleShape = React.memo<{
  shape: Shape;
  isSelected: boolean;
  showDimensions: boolean;
  scale: number;
  isSelectTool: boolean;
  themeMode: "dark" | "light";
  onSelectShape: (id: string, e: React.PointerEvent) => void;
}>(({ shape, isSelected, showDimensions, scale, isSelectTool, themeMode, onSelectShape }) => {
  if (shape.isVisible === false) return null;

  const defaultThemeStroke = themeMode === "light" ? "#0f172a" : "#f8fafc";
  const strokeColor = shape.strokeColor || defaultThemeStroke;
  const strokeWidth = shape.strokeWidth || 1.5;
  const opacity = shape.opacity ?? 1;
  const rotation = shape.rotation || 0;
  const center = getShapeCenter(shape);

  const hasFill =
    "fillColor" in shape &&
    shape.fillColor &&
    shape.fillColor !== "transparent" &&
    shape.fillColor !== "none";
  const fillValue = hasFill && "fillColor" in shape ? shape.fillColor : "none";
  const pointerEventsStyle = isSelectTool ? (hasFill ? "auto" : "stroke") : "none";

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isSelectTool) return;
    e.stopPropagation();
    onSelectShape(shape.id, e);
  };

  const transformAttr = rotation !== 0 ? `rotate(${rotation} ${center.x} ${center.y})` : undefined;

  return (
    <g
      id={`shape-${shape.id}`}
      className={`transition-colors duration-100 group ${
        isSelectTool ? "cursor-pointer" : "pointer-events-none"
      }`}
      onPointerDown={isSelectTool ? handlePointerDown : undefined}
      transform={transformAttr}
      style={{
        opacity: shape.isLocked ? opacity * 0.7 : opacity,
        pointerEvents: pointerEventsStyle,
      }}
    >
      {/* Invisible hit-testing cushion for lines/arrows in select mode */}
      {isSelectTool && (shape.type === "line" || shape.type === "arrow") && (
        <line
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
          stroke="transparent"
          strokeWidth={Math.max(20 / scale, strokeWidth + 14 / scale)}
          strokeLinecap="round"
          style={{ pointerEvents: "stroke" }}
        />
      )}

      {/* Render Line */}
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

      {/* Render Arrow */}
      {shape.type === "arrow" && (
        <g>
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
          {(() => {
            const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);
            const headLen = 12 / scale;
            const x3 = shape.x2 - headLen * Math.cos(angle - Math.PI / 6);
            const y3 = shape.y2 - headLen * Math.sin(angle - Math.PI / 6);
            const x4 = shape.x2 - headLen * Math.cos(angle + Math.PI / 6);
            const y4 = shape.y2 - headLen * Math.sin(angle + Math.PI / 6);
            return (
              <polygon
                points={`${shape.x2},${shape.y2} ${x3},${y3} ${x4},${y4}`}
                fill={strokeColor}
              />
            );
          })()}
        </g>
      )}

      {/* Render Rectangle */}
      {shape.type === "rectangle" && (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          fill={fillValue}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={shape.strokeDasharray}
          rx={0}
        />
      )}

      {/* Render Circle */}
      {shape.type === "circle" && (
        <circle
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r}
          fill={fillValue}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={shape.strokeDasharray}
        />
      )}

      {/* Render Ellipse */}
      {shape.type === "ellipse" && (
        <ellipse
          cx={shape.cx}
          cy={shape.cy}
          rx={shape.rx}
          ry={shape.ry}
          fill={fillValue}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={shape.strokeDasharray}
        />
      )}

      {/* Render Polygon / Triangle */}
      {shape.type === "polygon" && (
        <polygon
          points={pointsToSvgString(getPolygonPoints(shape.cx, shape.cy, shape.r, shape.sides))}
          fill={fillValue}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={shape.strokeDasharray}
        />
      )}

      {/* Render Star */}
      {shape.type === "star" && (
        <polygon
          points={pointsToSvgString(getStarPoints(shape.cx, shape.cy, shape.innerR, shape.outerR, shape.points))}
          fill={fillValue}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={shape.strokeDasharray}
        />
      )}
    </g>
  );
});

SingleShape.displayName = "SingleShape";

export const ShapeRenderer: React.FC<ShapeRendererProps> = React.memo(
  ({ shapes, selectedIds, showDimensions, scale, isSelectTool, themeMode = "dark", onSelectShape }) => {
    return (
      <g id="shapes-layer">
        {shapes.map((shape) => (
          <SingleShape
            key={shape.id}
            shape={shape}
            isSelected={selectedIds.includes(shape.id)}
            showDimensions={showDimensions}
            scale={scale}
            isSelectTool={isSelectTool}
            themeMode={themeMode}
            onSelectShape={onSelectShape}
          />
        ))}
      </g>
    );
  }
);

ShapeRenderer.displayName = "ShapeRenderer";
