"use client";

import React from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { lineMetrics } from "@/lib/geometry/metrics";

export const ConstraintOverlays: React.FC = () => {
  const { state } = useDrawing();
  const scale = state.viewport.scale;

  const glyphs: React.ReactNode[] = [];

  for (const c of state.constraints) {
    if (!c.enabled) continue;

    const s1 = state.shapes.find((s) => s.id === c.shapeIds[0]);
    if (!s1) continue;

    switch (c.type) {
      case "horizontal": {
        if (s1.type === "line" || s1.type === "arrow") {
          const m = lineMetrics({ x: s1.x1, y: s1.y1 }, { x: s1.x2, y: s1.y2 });
          glyphs.push(
            <g key={c.id} transform={`translate(${m.midpoint.x}, ${m.midpoint.y})`}>
              <rect
                x={-9 / scale}
                y={-9 / scale}
                width={18 / scale}
                height={18 / scale}
                rx={3 / scale}
                fill="rgba(15, 23, 42, 0.85)"
                stroke="#0066ff"
                strokeWidth={1 / scale}
              />
              <text
                x={0}
                y={1 / scale}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#38bdf8"
                fontSize={10 / scale}
                fontFamily="JetBrains Mono, monospace"
                fontWeight="bold"
              >
                H
              </text>
            </g>
          );
        }
        break;
      }

      case "vertical": {
        if (s1.type === "line" || s1.type === "arrow") {
          const m = lineMetrics({ x: s1.x1, y: s1.y1 }, { x: s1.x2, y: s1.y2 });
          glyphs.push(
            <g key={c.id} transform={`translate(${m.midpoint.x}, ${m.midpoint.y})`}>
              <rect
                x={-9 / scale}
                y={-9 / scale}
                width={18 / scale}
                height={18 / scale}
                rx={3 / scale}
                fill="rgba(15, 23, 42, 0.85)"
                stroke="#0066ff"
                strokeWidth={1 / scale}
              />
              <text
                x={0}
                y={1 / scale}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#38bdf8"
                fontSize={10 / scale}
                fontFamily="JetBrains Mono, monospace"
                fontWeight="bold"
              >
                V
              </text>
            </g>
          );
        }
        break;
      }

      case "parallel": {
        const s2 = state.shapes.find((s) => s.id === c.shapeIds[1]);
        if (s2 && (s1.type === "line" || s1.type === "arrow") && (s2.type === "line" || s2.type === "arrow")) {
          const m1 = lineMetrics({ x: s1.x1, y: s1.y1 }, { x: s1.x2, y: s1.y2 });
          const m2 = lineMetrics({ x: s2.x1, y: s2.y1 }, { x: s2.x2, y: s2.y2 });
          [m1, m2].forEach((m, idx) => {
            glyphs.push(
              <g key={`${c.id}_${idx}`} transform={`translate(${m.midpoint.x}, ${m.midpoint.y})`}>
                <rect
                  x={-10 / scale}
                  y={-9 / scale}
                  width={20 / scale}
                  height={18 / scale}
                  rx={3 / scale}
                  fill="rgba(15, 23, 42, 0.85)"
                  stroke="#22c55e"
                  strokeWidth={1 / scale}
                />
                <text
                  x={0}
                  y={1 / scale}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#4ade80"
                  fontSize={10 / scale}
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="bold"
                >
                  //
                </text>
              </g>
            );
          });
        }
        break;
      }

      case "perpendicular": {
        const s2 = state.shapes.find((s) => s.id === c.shapeIds[1]);
        if (s2 && (s1.type === "line" || s1.type === "arrow") && (s2.type === "line" || s2.type === "arrow")) {
          const m1 = lineMetrics({ x: s1.x1, y: s1.y1 }, { x: s1.x2, y: s1.y2 });
          glyphs.push(
            <g key={c.id} transform={`translate(${m1.midpoint.x}, ${m1.midpoint.y})`}>
              <rect
                x={-9 / scale}
                y={-9 / scale}
                width={18 / scale}
                height={18 / scale}
                rx={3 / scale}
                fill="rgba(15, 23, 42, 0.85)"
                stroke="#a855f7"
                strokeWidth={1 / scale}
              />
              <text
                x={0}
                y={1 / scale}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#c084fc"
                fontSize={10 / scale}
                fontFamily="JetBrains Mono, monospace"
                fontWeight="bold"
              >
                ⟂
              </text>
            </g>
          );
        }
        break;
      }

      case "concentric": {
        if (s1.type === "circle" || s1.type === "ellipse" || s1.type === "polygon") {
          glyphs.push(
            <g key={c.id} transform={`translate(${s1.cx}, ${s1.cy})`}>
              <circle r={7 / scale} fill="none" stroke="#f59e0b" strokeWidth={1.5 / scale} />
              <circle r={3 / scale} fill="#f59e0b" />
            </g>
          );
        }
        break;
      }
    }
  }

  if (glyphs.length === 0) return null;

  return <g className="constraint-overlays pointer-events-none select-none">{glyphs}</g>;
};
