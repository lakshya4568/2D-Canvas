"use client";

import React from "react";
import { Shape } from "@/lib/geometry/types";
import { lineMetrics, formatDimension } from "@/lib/geometry/metrics";

interface DimensionBadgeProps {
  shape: Shape;
  isDraft?: boolean;
  scale?: number;
}

export const DimensionBadge: React.FC<DimensionBadgeProps> = React.memo(({ shape, isDraft = false, scale = 1 }) => {
  let badgeX = 0;
  let badgeY = 0;
  let labelText = "";
  let subText: string | null = null;

  switch (shape.type) {
    case "line":
    case "arrow": {
      const metrics = lineMetrics({ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 });
      badgeX = metrics.midpoint.x;
      badgeY = metrics.midpoint.y - 14 / scale;
      labelText = `L: ${formatDimension(metrics.length)}`;
      subText = `${metrics.angleDeg.toFixed(1)}°`;
      break;
    }
    case "rectangle": {
      badgeX = shape.x + shape.width / 2;
      badgeY = shape.y - 14 / scale;
      labelText = `${formatDimension(shape.width)} × ${formatDimension(shape.height)}`;
      break;
    }
    case "circle": {
      badgeX = shape.cx;
      badgeY = shape.cy - shape.r - 14 / scale;
      labelText = `R: ${formatDimension(shape.r)}`;
      subText = `Ø: ${formatDimension(shape.r * 2)}`;
      break;
    }
    case "ellipse": {
      badgeX = shape.cx;
      badgeY = shape.cy - shape.ry - 14 / scale;
      labelText = `Rx: ${formatDimension(shape.rx)} Ry: ${formatDimension(shape.ry)}`;
      break;
    }
    case "polygon": {
      badgeX = shape.cx;
      badgeY = shape.cy - shape.r - 14 / scale;
      labelText = `${shape.sides === 3 ? "Triangle" : `${shape.sides}-gon`}`;
      subText = `R: ${formatDimension(shape.r)}`;
      break;
    }
    case "star": {
      badgeX = shape.cx;
      badgeY = shape.cy - shape.outerR - 14 / scale;
      labelText = `${shape.points}-Star`;
      subText = `R: ${formatDimension(shape.outerR)}`;
      break;
    }
  }

  const fontSize = Math.max(10, Math.min(14, 12 / Math.sqrt(scale)));
  const paddingX = 6 / scale;
  const paddingY = 3 / scale;
  const borderRadius = 4 / scale;

  return (
    <g
      className={`dimension-badge pointer-events-none select-none transition-opacity duration-150 ${
        isDraft ? "opacity-100" : "opacity-90"
      }`}
      transform={`translate(${badgeX}, ${badgeY})`}
    >
      <rect
        x={-((labelText.length + (subText ? subText.length + 2 : 0)) * (fontSize * 0.32) + paddingX)}
        y={-fontSize - paddingY / 2}
        width={(labelText.length + (subText ? subText.length + 2 : 0)) * (fontSize * 0.64) + paddingX * 2}
        height={fontSize + paddingY * 2}
        rx={borderRadius}
        fill={isDraft ? "rgba(15, 23, 42, 0.88)" : "rgba(22, 24, 32, 0.82)"}
        stroke={isDraft ? "var(--accent-draw)" : "var(--border-strong)"}
        strokeWidth={1 / scale}
        style={{
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))",
        }}
      />
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#f8fafc"
        fontSize={fontSize}
        fontFamily="JetBrains Mono, monospace"
        fontWeight="600"
        letterSpacing="0.02em"
      >
        {labelText}
        {subText && <tspan fill="#94a3b8" fontSize={fontSize * 0.85}> · {subText}</tspan>}
      </text>
    </g>
  );
});

DimensionBadge.displayName = "DimensionBadge";
