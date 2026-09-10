"use client";

/**
 * Constraint glyphs on the sheet.
 *
 * A draftsman needs to see the rules, not just be told they exist in a panel:
 * a small mark on the edge itself is how every CAD sketcher shows that this
 * edge is held horizontal, or that these two are tied parallel.
 *
 * These read the AUTHORING sketch. They used to read the drafting reducer's own
 * constraint list, which was the parallel model that the parametric workflow
 * replaced, so the canvas was showing one system's rules while the panel showed
 * another's. Now there is one list, and this is a view of it.
 *
 * A suppressed rule is drawn faded rather than hidden: the author switched it
 * off deliberately and needs to see that it is off, not wonder where it went.
 */

import React from "react";
import { useUpce } from "../parametric/upceContext";
import { useDrawing } from "@/lib/state/drawingContext";
import type { AuthoringSketch, SketchConstraint } from "@/lib/upce/types";

interface Glyph {
  key: string;
  x: number;
  y: number;
  text: string;
  stroke: string;
  fill: string;
  faded: boolean;
  title: string;
}

const STYLES: Partial<Record<SketchConstraint["kind"], { text: string; stroke: string; fill: string }>> = {
  horizontal: { text: "H", stroke: "#10b981", fill: "#34d399" },
  vertical: { text: "V", stroke: "#10b981", fill: "#34d399" },
  parallel: { text: "//", stroke: "#22c55e", fill: "#4ade80" },
  perpendicular: { text: "⟂", stroke: "#a855f7", fill: "#c084fc" },
  equal_length: { text: "=", stroke: "#38bdf8", fill: "#7dd3fc" },
  point_on_line: { text: "•", stroke: "#38bdf8", fill: "#7dd3fc" },
  symmetric: { text: "><", stroke: "#f59e0b", fill: "#fbbf24" },
  concentric: { text: "◎", stroke: "#f59e0b", fill: "#fbbf24" },
  fix: { text: "▣", stroke: "#f87171", fill: "#fca5a5" },
};

function midpointOfSegment(sketch: AuthoringSketch, segId: string): { x: number; y: number } | null {
  const seg = sketch.segments[segId];
  if (!seg) return null;
  const a = sketch.points[seg.p1];
  const b = sketch.points[seg.p2];
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export const ConstraintOverlays: React.FC = () => {
  const { state } = useDrawing();
  const { sketch, started } = useUpce();
  const scale = state.viewport.scale;

  if (!started) return null;

  const glyphs: Glyph[] = [];

  for (const c of sketch.constraints) {
    // A shape's own right angles are what the shape IS. Drawing four of them on
    // every rectangle would bury the rules the author actually chose.
    if (c.strength === "fact") continue;
    // A dimension already shows itself as an editable badge.
    if (c.paramRef) continue;

    const style = STYLES[c.kind];
    if (!style) continue;

    const anchors: { x: number; y: number }[] = [];
    for (const segId of c.segments) {
      const m = midpointOfSegment(sketch, segId);
      if (m) anchors.push(m);
    }
    for (const pointId of c.points) {
      const p = sketch.points[pointId];
      if (p) anchors.push({ x: p.x, y: p.y });
    }
    if (anchors.length === 0) continue;

    anchors.forEach((a, i) => {
      glyphs.push({
        key: `${c.id}_${i}`,
        x: a.x,
        y: a.y,
        text: style.text,
        stroke: style.stroke,
        fill: style.fill,
        faded: c.state === "suppressed",
        title: c.label,
      });
    });
  }

  if (glyphs.length === 0) return null;

  const box = 18 / scale;

  return (
    <g className="constraint-overlays pointer-events-none select-none">
      {glyphs.map((g) => (
        <g key={g.key} transform={`translate(${g.x}, ${g.y})`} opacity={g.faded ? 0.35 : 1}>
          <title>{g.title}</title>
          <rect
            x={-box / 2}
            y={-box / 2}
            width={box}
            height={box}
            rx={3 / scale}
            fill="rgba(15, 23, 42, 0.85)"
            stroke={g.stroke}
            strokeWidth={1 / scale}
            strokeDasharray={g.faded ? `${3 / scale} ${2 / scale}` : undefined}
          />
          <text
            x={0}
            y={1 / scale}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={g.fill}
            fontSize={10 / scale}
            fontFamily="JetBrains Mono, monospace"
            fontWeight="bold"
          >
            {g.text}
          </text>
        </g>
      ))}
    </g>
  );
};
