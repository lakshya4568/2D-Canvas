"use client";

import React from "react";
import { Shape } from "@/lib/geometry/types";
import { DimensionBadge } from "./DimensionBadge";
import { getPolygonPoints, getStarPoints, pointsToSvgString } from "@/lib/geometry/metrics";

interface DraftPreviewProps {
  draft: Shape | null;
  scale: number;
}

export const DraftPreview: React.FC<DraftPreviewProps> = React.memo(({ draft, scale }) => {
  if (!draft) return null;

  const strokeColor = "var(--accent-draw)";
  const strokeWidth = 2 / scale;
  const dashArray = `${6 / scale}, ${4 / scale}`;
  const fillBg = "rgba(34, 197, 94, 0.08)";

  return (
    <g id="draft-preview-layer" className="pointer-events-none">
      {draft.type === "line" && (
        <>
          <line
            x1={draft.x1}
            y1={draft.y1}
            x2={draft.x2}
            y2={draft.y2}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            strokeLinecap="round"
          />
          <circle cx={draft.x1} cy={draft.y1} r={3.5 / scale} fill={strokeColor} />
          <circle cx={draft.x2} cy={draft.y2} r={3.5 / scale} fill={strokeColor} />
        </>
      )}

      {draft.type === "arrow" && (
        <>
          <line
            x1={draft.x1}
            y1={draft.y1}
            x2={draft.x2}
            y2={draft.y2}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            strokeLinecap="round"
          />
          <circle cx={draft.x1} cy={draft.y1} r={3.5 / scale} fill={strokeColor} />
          {(() => {
            const angle = Math.atan2(draft.y2 - draft.y1, draft.x2 - draft.x1);
            const headLen = 12 / scale;
            const x3 = draft.x2 - headLen * Math.cos(angle - Math.PI / 6);
            const y3 = draft.y2 - headLen * Math.sin(angle - Math.PI / 6);
            const x4 = draft.x2 - headLen * Math.cos(angle + Math.PI / 6);
            const y4 = draft.y2 - headLen * Math.sin(angle + Math.PI / 6);
            return (
              <polygon
                points={`${draft.x2},${draft.y2} ${x3},${y3} ${x4},${y4}`}
                fill={strokeColor}
              />
            );
          })()}
        </>
      )}

      {draft.type === "rectangle" && (
        <>
          <rect
            x={draft.x}
            y={draft.y}
            width={draft.width}
            height={draft.height}
            fill={fillBg}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            rx={2 / scale}
          />
          <circle cx={draft.x} cy={draft.y} r={3 / scale} fill={strokeColor} />
          <circle cx={draft.x + draft.width} cy={draft.y + draft.height} r={3 / scale} fill={strokeColor} />
        </>
      )}

      {draft.type === "circle" && (
        <>
          <circle
            cx={draft.cx}
            cy={draft.cy}
            r={draft.r}
            fill={fillBg}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
          />
          <circle cx={draft.cx} cy={draft.cy} r={3.5 / scale} fill={strokeColor} />
          <line
            x1={draft.cx}
            y1={draft.cy}
            x2={draft.cx + draft.r}
            y2={draft.cy}
            stroke={strokeColor}
            strokeWidth={1 / scale}
            strokeDasharray={`${3 / scale}, ${3 / scale}`}
            opacity={0.7}
          />
        </>
      )}

      {draft.type === "ellipse" && (
        <>
          <ellipse
            cx={draft.cx}
            cy={draft.cy}
            rx={draft.rx}
            ry={draft.ry}
            fill={fillBg}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
          />
          <circle cx={draft.cx} cy={draft.cy} r={3.5 / scale} fill={strokeColor} />
        </>
      )}

      {draft.type === "polygon" && (
        <>
          <polygon
            points={pointsToSvgString(getPolygonPoints(draft.cx, draft.cy, draft.r, draft.sides))}
            fill={fillBg}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
          />
          <circle cx={draft.cx} cy={draft.cy} r={3.5 / scale} fill={strokeColor} />
        </>
      )}

      {draft.type === "star" && (
        <>
          <polygon
            points={pointsToSvgString(getStarPoints(draft.cx, draft.cy, draft.innerR, draft.outerR, draft.points))}
            fill={fillBg}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
          />
          <circle cx={draft.cx} cy={draft.cy} r={3.5 / scale} fill={strokeColor} />
        </>
      )}

      {/* Live dynamic dimension badge */}
      <DimensionBadge shape={draft} isDraft scale={scale} />
    </g>
  );
});

DraftPreview.displayName = "DraftPreview";
