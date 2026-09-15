"use client";

import React from "react";
import { SnapResult } from "@/lib/geometry/types";

interface SnapIndicatorProps {
  snap: SnapResult | null;
  scale: number;
}

export const SnapIndicator: React.FC<SnapIndicatorProps> = React.memo(({ snap, scale }) => {
  if (!snap || !snap.snapped || !snap.targetPoint) return null;

  const { x, y } = snap.targetPoint;
  const isVertex = snap.snapType === "vertex";
  const isChamferRef = snap.category === "chamfer_ref";
  // A guide is a different kind of statement from a position, so it gets its own
  // colour: a relationship to something else on the sheet, not a point to land on.
  const isGuide =
    snap.category === "equal_length" ||
    snap.category === "parallel" ||
    snap.category === "extension";
  const strokeColor = isChamferRef
    ? "#f59e0b"
    : isGuide
    ? "#a78bfa"
    : snap.category === "perpendicular"
    ? "#10b981"
    : isVertex
    ? "#f97316"
    : "#10b981";
  const ringRadius = (isChamferRef ? 8 : isVertex ? 7 : 5) / scale;
  const dotRadius = (isChamferRef ? 3 : isVertex ? 2.5 : 2) / scale;

  const categoryLabel = snap.snapLabel
    ? snap.snapLabel
    : snap.category
    ? snap.category.toUpperCase()
    : isVertex
    ? "VERTEX"
    : "GRID";

  return (
    <g id="snap-indicator-layer" className="pointer-events-none select-none">
      {/* Alignment Guide Lines */}
      {snap.guideLines?.map((line, idx) => (
        <line
          key={idx}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={isChamferRef ? "#f59e0b" : "#10b981"}
          strokeWidth={(isChamferRef ? 1.5 : 1) / scale}
          strokeDasharray={`${4 / scale}, ${4 / scale}`}
          opacity={0.9}
        />
      ))}

      {/* Anchor point touching previous chamfer */}
      {isChamferRef && snap.sourcePoint && (
        <g id="chamfer-touch-anchor">
          <circle
            cx={snap.sourcePoint.x}
            cy={snap.sourcePoint.y}
            r={6 / scale}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={1.5 / scale}
          />
          <circle
            cx={snap.sourcePoint.x}
            cy={snap.sourcePoint.y}
            r={2.5 / scale}
            fill="#f59e0b"
          />
          <g transform={`translate(${snap.sourcePoint.x + 8 / scale}, ${snap.sourcePoint.y - 6 / scale})`}>
            <rect
              x={0}
              y={0}
              width={75 / scale}
              height={13 / scale}
              rx={2 / scale}
              fill="rgba(15, 23, 42, 0.9)"
              stroke="#f59e0b"
              strokeWidth={0.8 / scale}
            />
            <text
              x={4 / scale}
              y={9.5 / scale}
              fill="#fbbf24"
              fontSize={7.5 / scale}
              fontFamily="JetBrains Mono, monospace"
              fontWeight="bold"
            >
              PREV CHAMFER
            </text>
          </g>
        </g>
      )}

      {/* Equal-length tick marks.
          A drawing has always said "these two are the same" with a tick across
          each of them, and the snap is meaningless without showing WHICH edge it
          matched — otherwise a number appears from nowhere. Two ticks for the
          reference edges, one for the edge being drawn. */}
      {snap.category === "equal_length" &&
        snap.referenceEdges?.map((e, idx) => {
          const mx = (e.p1.x + e.p2.x) / 2;
          const my = (e.p1.y + e.p2.y) / 2;
          const dx = e.p2.x - e.p1.x;
          const dy = e.p2.y - e.p1.y;
          const len = Math.hypot(dx, dy) || 1;
          // Across the edge, not along it.
          const nx = (-dy / len) * (5 / scale);
          const ny = (dx / len) * (5 / scale);
          return (
            <g key={`tick-${idx}`}>
              <line
                x1={e.p1.x}
                y1={e.p1.y}
                x2={e.p2.x}
                y2={e.p2.y}
                stroke="#a78bfa"
                strokeWidth={1.5 / scale}
                opacity={0.75}
              />
              <line
                x1={mx - nx}
                y1={my - ny}
                x2={mx + nx}
                y2={my + ny}
                stroke="#a78bfa"
                strokeWidth={2 / scale}
              />
            </g>
          );
        })}

      {/* The tick on the edge being drawn, so the pair reads as a pair. */}
      {snap.category === "equal_length" && snap.sourcePoint && (
        (() => {
          const mx = (snap.sourcePoint.x + x) / 2;
          const my = (snap.sourcePoint.y + y) / 2;
          const dx = x - snap.sourcePoint.x;
          const dy = y - snap.sourcePoint.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = (-dy / len) * (5 / scale);
          const ny = (dx / len) * (5 / scale);
          return (
            <line
              x1={mx - nx}
              y1={my - ny}
              x2={mx + nx}
              y2={my + ny}
              stroke="#a78bfa"
              strokeWidth={2 / scale}
            />
          );
        })()
      )}

      {/* Target Marker */}
      <g transform={`translate(${x}, ${y})`}>
        {/* Outer pulsing snap ring */}
        <circle
          r={ringRadius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2 / scale}
        />
        {/* Center dot */}
        <circle r={dotRadius} fill={strokeColor} />

        {/* Crosshair lines for vertex snap */}
        {(isVertex || isChamferRef) && (
          <>
            <line
              x1={-ringRadius - 3 / scale}
              y1={0}
              x2={ringRadius + 3 / scale}
              y2={0}
              stroke={strokeColor}
              strokeWidth={1.2 / scale}
            />
            <line
              x1={0}
              y1={-ringRadius - 3 / scale}
              x2={0}
              y2={ringRadius + 3 / scale}
              stroke={strokeColor}
              strokeWidth={1.2 / scale}
            />
          </>
        )}

        {/* Category Label Chip */}
        <g transform={`translate(${12 / scale}, ${-10 / scale})`}>
          <rect
            x={0}
            y={0}
            width={categoryLabel.length * 6.5 / scale + 12 / scale}
            height={16 / scale}
            rx={2 / scale}
            fill="rgba(15, 23, 42, 0.95)"
            stroke={strokeColor}
            strokeWidth={1.2 / scale}
          />
          <text
            x={6 / scale}
            y={11.5 / scale}
            fill={isChamferRef ? "#fde047" : "#ffffff"}
            fontSize={8.5 / scale}
            fontFamily="JetBrains Mono, monospace"
            fontWeight="bold"
            letterSpacing={0.5}
          >
            {categoryLabel}
          </text>
        </g>
      </g>
    </g>
  );
});

SnapIndicator.displayName = "SnapIndicator";
