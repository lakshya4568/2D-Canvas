"use client";

/**
 * Dimension badges as first-class constraints — UPCE-MASTER-1.0 §61.
 *
 * A badge here is not a label printed next to a shape; it IS a dimensional
 * constraint that a parameter drives. That is why there is exactly one badge per
 * parameter-driven dimension and none for anything else: an unconstrained edge
 * has no dimension to edit, only a length you could measure.
 *
 * Typing a new number into a badge sets the PARAMETER and re-solves through the
 * same pipeline the panel uses (§12: "the editor must never fake this by
 * changing SVG coordinates independently of the model"). If the solver refuses
 * the value, the drawing does not move and the panel says why.
 *
 * The previous implementation looked its target up by trying `${name}_Width`,
 * `${name}.width`, `${name}_width`, `W` and `Width` in turn against a global
 * variable bag, which is how a badge could end up editing a different shape's
 * dimension. There is no name matching left in this file.
 */

import React from "react";
import { useUpce } from "../parametric/upceContext";
import { DimensionBadge, BadgeVisualState } from "./DimensionBadge";
import type { SketchConstraint } from "@/lib/upce/types";

interface ParametricDimensionOverlayProps {
  scale: number;
}

interface Placement {
  x: number;
  y: number;
  measured: number;
}

export const ParametricDimensionOverlay: React.FC<ParametricDimensionOverlayProps> = ({ scale }) => {
  const { sketch, started, dof, setParameterValue } = useUpce();

  const conflicting = React.useMemo(
    () => new Set((dof?.diagnoses ?? []).filter((d) => d.status === "conflicting").map((d) => d.constraintId)),
    [dof]
  );

  if (!started) return null;

  const place = (c: SketchConstraint): Placement | null => {
    const pt = (id: string) => sketch.points[id];

    if (c.kind === "distance" || c.kind === "distance_x" || c.kind === "distance_y") {
      const a = pt(c.points[0]);
      const b = pt(c.points[1]);
      if (!a || !b) return null;
      const measured =
        c.kind === "distance"
          ? Math.hypot(b.x - a.x, b.y - a.y)
          : c.kind === "distance_x"
            ? b.x - a.x
            : b.y - a.y;
      // Nudge the badge off the edge along its own normal so it never sits on
      // top of the line it measures.
      const nx = -(b.y - a.y);
      const ny = b.x - a.x;
      const len = Math.hypot(nx, ny) || 1;
      const off = 12 / scale;
      return {
        x: (a.x + b.x) / 2 + (nx / len) * off,
        y: (a.y + b.y) / 2 + (ny / len) * off,
        measured,
      };
    }

    if (c.kind === "point_line_distance") {
      const p = pt(c.points[0]);
      const seg = sketch.segments[c.segments[0]];
      if (!p || !seg) return null;
      const a = pt(seg.p1);
      const b = pt(seg.p2);
      if (!a || !b) return null;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len);
      const foot = { x: a.x + dx * t, y: a.y + dy * t };
      return {
        x: (p.x + foot.x) / 2,
        y: (p.y + foot.y) / 2,
        measured: Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len,
      };
    }

    return null;
  };

  const badges = sketch.constraints
    .filter((c) => c.paramRef && c.state !== "suppressed")
    .map((c) => ({ constraint: c, placement: place(c) }))
    .filter((b): b is { constraint: SketchConstraint; placement: Placement } => b.placement !== null);

  // One badge per parameter: a thickness driving both walls does not need two
  // identical labels, and the pair is what the panel explains anyway.
  const seen = new Set<string>();
  const unique = badges.filter((b) => {
    const key = b.constraint.paramRef!;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <g className="parametric-dimensions">
      {unique.map(({ constraint, placement }) => {
        const param = sketch.parameters[constraint.paramRef!];
        if (!param) return null;

        const visualState: BadgeVisualState = conflicting.has(constraint.id)
          ? "conflicting"
          : param.role === "DERIVED" || param.role === "FIXED"
            ? "derived"
            : "driving";

        return (
          <DimensionBadge
            key={`upce-badge-${constraint.id}`}
            scale={scale}
            x={placement.x}
            y={placement.y}
            label={`${param.name} ${param.value.toFixed(param.unit === "count" ? 0 : 1)}`}
            value={param.value}
            paramName={param.name}
            visualState={visualState}
            isEditable={visualState === "driving"}
            diagnosticMessage={
              visualState === "conflicting"
                ? `${constraint.label} cannot hold together with the other requirements.`
                : undefined
            }
            onCommit={(raw) => {
              const v = Number(raw.trim());
              if (Number.isFinite(v)) setParameterValue(param.name, v);
            }}
          />
        );
      })}
    </g>
  );
};
