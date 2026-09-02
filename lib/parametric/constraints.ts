/**
 * Geometric Constraint Engine for Parametric 2D CAD
 * Defines CAD constraints (horizontal, vertical, parallel, perpendicular, coincident, equal length, etc.)
 * and provides equation evaluation and relaxation solving.
 */

import { Point, Shape } from "../geometry/types";
import { lineMetrics, rotatePoint } from "../geometry/metrics";

export type ConstraintType =
  | "horizontal"
  | "vertical"
  | "parallel"
  | "perpendicular"
  | "coincident"
  | "collinear"
  | "equal_length"
  | "fixed_length"
  | "fixed_angle"
  | "concentric"
  | "equal_radius"
  | "aspect_ratio"
  | "distance"
  | "tangent"
  | "symmetric";

export interface GeometricConstraint {
  id: string;
  type: ConstraintType;
  name?: string;
  shapeIds: string[]; // 1 or 2 shape IDs
  entityIndices?: number[]; // e.g. point indices [1, 2] for endpoints or corners
  value?: number; // target value (length, angle, distance, aspect ratio)
  variableName?: string; // e.g. "L1", "W"
  enabled: boolean;
}

export interface ConstraintDiagnostic {
  constraintId: string;
  satisfied: boolean;
  residual: number;
  message?: string;
  conflictsWith?: string[];
}

export interface SolverResult {
  updatedShapes: Shape[];
  converged: boolean;
  iterations: number;
  diagnostics: ConstraintDiagnostic[];
  status: "well_constrained" | "under_constrained" | "over_constrained" | "inconsistent";
}

/**
 * Evaluates residual error for a single constraint
 */
export function evaluateConstraintResidual(
  constraint: GeometricConstraint,
  shapesMap: Map<string, Shape>
): number {
  if (!constraint.enabled) return 0;

  switch (constraint.type) {
    case "horizontal": {
      const shape = shapesMap.get(constraint.shapeIds[0]);
      if (!shape) return 0;
      if (shape.type === "line" || shape.type === "arrow") {
        return Math.abs(shape.y2 - shape.y1);
      }
      return 0;
    }

    case "vertical": {
      const shape = shapesMap.get(constraint.shapeIds[0]);
      if (!shape) return 0;
      if (shape.type === "line" || shape.type === "arrow") {
        return Math.abs(shape.x2 - shape.x1);
      }
      return 0;
    }

    case "parallel": {
      const s1 = shapesMap.get(constraint.shapeIds[0]);
      const s2 = shapesMap.get(constraint.shapeIds[1]);
      if (!s1 || !s2) return 0;
      if ((s1.type === "line" || s1.type === "arrow") && (s2.type === "line" || s2.type === "arrow")) {
        const dx1 = s1.x2 - s1.x1;
        const dy1 = s1.y2 - s1.y1;
        const dx2 = s2.x2 - s2.x1;
        const dy2 = s2.y2 - s2.y1;
        const cross = dy1 * dx2 - dy2 * dx1;
        const len1 = Math.hypot(dx1, dy1) || 1;
        const len2 = Math.hypot(dx2, dy2) || 1;
        return Math.abs(cross) / (len1 * len2);
      }
      return 0;
    }

    case "perpendicular": {
      const s1 = shapesMap.get(constraint.shapeIds[0]);
      const s2 = shapesMap.get(constraint.shapeIds[1]);
      if (!s1 || !s2) return 0;
      if ((s1.type === "line" || s1.type === "arrow") && (s2.type === "line" || s2.type === "arrow")) {
        const dx1 = s1.x2 - s1.x1;
        const dy1 = s1.y2 - s1.y1;
        const dx2 = s2.x2 - s2.x1;
        const dy2 = s2.y2 - s2.y1;
        const dot = dx1 * dx2 + dy1 * dy2;
        const len1 = Math.hypot(dx1, dy1) || 1;
        const len2 = Math.hypot(dx2, dy2) || 1;
        return Math.abs(dot) / (len1 * len2);
      }
      return 0;
    }

    case "equal_length": {
      const s1 = shapesMap.get(constraint.shapeIds[0]);
      const s2 = shapesMap.get(constraint.shapeIds[1]);
      if (!s1 || !s2) return 0;
      if ((s1.type === "line" || s1.type === "arrow") && (s2.type === "line" || s2.type === "arrow")) {
        const l1 = Math.hypot(s1.x2 - s1.x1, s1.y2 - s1.y1);
        const l2 = Math.hypot(s2.x2 - s2.x1, s2.y2 - s2.y1);
        return Math.abs(l1 - l2);
      }
      return 0;
    }

    case "fixed_length": {
      const shape = shapesMap.get(constraint.shapeIds[0]);
      if (!shape) return 0;
      const targetLen = constraint.value ?? 100;
      if (shape.type === "line" || shape.type === "arrow") {
        const l = Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
        return Math.abs(l - targetLen);
      }
      return 0;
    }

    case "concentric": {
      const s1 = shapesMap.get(constraint.shapeIds[0]);
      const s2 = shapesMap.get(constraint.shapeIds[1]);
      if (!s1 || !s2) return 0;
      if (
        (s1.type === "circle" || s1.type === "ellipse" || s1.type === "polygon") &&
        (s2.type === "circle" || s2.type === "ellipse" || s2.type === "polygon")
      ) {
        return Math.hypot(s1.cx - s2.cx, s1.cy - s2.cy);
      }
      return 0;
    }

    case "equal_radius": {
      const s1 = shapesMap.get(constraint.shapeIds[0]);
      const s2 = shapesMap.get(constraint.shapeIds[1]);
      if (!s1 || !s2) return 0;
      if (s1.type === "circle" && s2.type === "circle") {
        return Math.abs(s1.r - s2.r);
      }
      return 0;
    }

    case "aspect_ratio": {
      const shape = shapesMap.get(constraint.shapeIds[0]);
      if (!shape || shape.type !== "rectangle") return 0;
      const ratio = constraint.value ?? 1; // W / H
      const expectedH = shape.width / Math.max(0.01, ratio);
      return Math.abs(shape.height - expectedH);
    }

    case "coincident": {
      const s1 = shapesMap.get(constraint.shapeIds[0]);
      const s2 = shapesMap.get(constraint.shapeIds[1]);
      if (!s1 || !s2) return 0;
      // Endpoints of lines e.g. s1 end (x2, y2) to s2 start (x1, y1)
      if ((s1.type === "line" || s1.type === "arrow") && (s2.type === "line" || s2.type === "arrow")) {
        const pt1 = constraint.entityIndices?.[0] === 1 ? { x: s1.x1, y: s1.y1 } : { x: s1.x2, y: s1.y2 };
        const pt2 = constraint.entityIndices?.[1] === 2 ? { x: s2.x2, y: s2.y2 } : { x: s2.x1, y: s2.y1 };
        return Math.hypot(pt1.x - pt2.x, pt1.y - pt2.y);
      }
      return 0;
    }

    default:
      return 0;
  }
}

/**
 * Geometric Constraint Relaxation Solver
 * Iteratively satisfies enabled constraints using position projection.
 */
export function solveConstraints(
  shapes: Shape[],
  constraints: GeometricConstraint[],
  maxIterations = 20,
  tolerance = 1e-4
): SolverResult {
  const shapesMap = new Map<string, Shape>();
  shapes.forEach((s) => shapesMap.set(s.id, JSON.parse(JSON.stringify(s))));

  const enabledConstraints = constraints.filter((c) => c.enabled);
  if (enabledConstraints.length === 0) {
    return {
      updatedShapes: shapes,
      converged: true,
      iterations: 0,
      diagnostics: [],
      status: "well_constrained",
    };
  }

  // Check for obvious conflicting constraint pairs
  const diagnostics: ConstraintDiagnostic[] = [];
  const conflictingMap = new Map<string, string[]>();

  for (let i = 0; i < enabledConstraints.length; i++) {
    for (let j = i + 1; j < enabledConstraints.length; j++) {
      const c1 = enabledConstraints[i];
      const c2 = enabledConstraints[j];

      // Horizontal AND Vertical on same line
      if (
        c1.shapeIds[0] === c2.shapeIds[0] &&
        ((c1.type === "horizontal" && c2.type === "vertical") ||
          (c1.type === "vertical" && c2.type === "horizontal"))
      ) {
        conflictingMap.set(c1.id, [...(conflictingMap.get(c1.id) || []), c2.id]);
        conflictingMap.set(c2.id, [...(conflictingMap.get(c2.id) || []), c1.id]);
      }
    }
  }

  let iter = 0;
  let maxResidual = 1;

  while (iter < maxIterations && maxResidual > tolerance) {
    iter++;
    maxResidual = 0;

    for (const c of enabledConstraints) {
      if (!c.enabled) continue;

      switch (c.type) {
        case "horizontal": {
          const s = shapesMap.get(c.shapeIds[0]);
          if (s && (s.type === "line" || s.type === "arrow")) {
            const avgY = (s.y1 + s.y2) / 2;
            s.y1 = avgY;
            s.y2 = avgY;
          }
          break;
        }

        case "vertical": {
          const s = shapesMap.get(c.shapeIds[0]);
          if (s && (s.type === "line" || s.type === "arrow")) {
            const avgX = (s.x1 + s.x2) / 2;
            s.x1 = avgX;
            s.x2 = avgX;
          }
          break;
        }

        case "parallel": {
          const s1 = shapesMap.get(c.shapeIds[0]);
          const s2 = shapesMap.get(c.shapeIds[1]);
          if (s1 && s2 && (s1.type === "line" || s1.type === "arrow") && (s2.type === "line" || s2.type === "arrow")) {
            const m1 = lineMetrics({ x: s1.x1, y: s1.y1 }, { x: s1.x2, y: s1.y2 });
            const len2 = Math.hypot(s2.x2 - s2.x1, s2.y2 - s2.y1);
            const rad1 = (m1.angleDeg * Math.PI) / 180;
            const mid2X = (s2.x1 + s2.x2) / 2;
            const mid2Y = (s2.y1 + s2.y2) / 2;
            s2.x1 = mid2X - (Math.cos(rad1) * len2) / 2;
            s2.y1 = mid2Y - (Math.sin(rad1) * len2) / 2;
            s2.x2 = mid2X + (Math.cos(rad1) * len2) / 2;
            s2.y2 = mid2Y + (Math.sin(rad1) * len2) / 2;
          }
          break;
        }

        case "perpendicular": {
          const s1 = shapesMap.get(c.shapeIds[0]);
          const s2 = shapesMap.get(c.shapeIds[1]);
          if (s1 && s2 && (s1.type === "line" || s1.type === "arrow") && (s2.type === "line" || s2.type === "arrow")) {
            const m1 = lineMetrics({ x: s1.x1, y: s1.y1 }, { x: s1.x2, y: s1.y2 });
            const perpAngle = m1.angleDeg + 90;
            const len2 = Math.hypot(s2.x2 - s2.x1, s2.y2 - s2.y1);
            const rad2 = (perpAngle * Math.PI) / 180;
            const mid2X = (s2.x1 + s2.x2) / 2;
            const mid2Y = (s2.y1 + s2.y2) / 2;
            s2.x1 = mid2X - (Math.cos(rad2) * len2) / 2;
            s2.y1 = mid2Y - (Math.sin(rad2) * len2) / 2;
            s2.x2 = mid2X + (Math.cos(rad2) * len2) / 2;
            s2.y2 = mid2Y + (Math.sin(rad2) * len2) / 2;
          }
          break;
        }

        case "equal_length": {
          const s1 = shapesMap.get(c.shapeIds[0]);
          const s2 = shapesMap.get(c.shapeIds[1]);
          if (s1 && s2 && (s1.type === "line" || s1.type === "arrow") && (s2.type === "line" || s2.type === "arrow")) {
            const l1 = Math.hypot(s1.x2 - s1.x1, s1.y2 - s1.y1);
            const l2 = Math.hypot(s2.x2 - s2.x1, s2.y2 - s2.y1);
            const avgL = (l1 + l2) / 2;
            if (l1 > 0) {
              const scale1 = avgL / l1;
              const midX1 = (s1.x1 + s1.x2) / 2;
              const midY1 = (s1.y1 + s1.y2) / 2;
              s1.x1 = midX1 + (s1.x1 - midX1) * scale1;
              s1.y1 = midY1 + (s1.y1 - midY1) * scale1;
              s1.x2 = midX1 + (s1.x2 - midX1) * scale1;
              s1.y2 = midY1 + (s1.y2 - midY1) * scale1;
            }
            if (l2 > 0) {
              const scale2 = avgL / l2;
              const midX2 = (s2.x1 + s2.x2) / 2;
              const midY2 = (s2.y1 + s2.y2) / 2;
              s2.x1 = midX2 + (s2.x1 - midX2) * scale2;
              s2.y1 = midY2 + (s2.y1 - midY2) * scale2;
              s2.x2 = midX2 + (s2.x2 - midX2) * scale2;
              s2.y2 = midY2 + (s2.y2 - midY2) * scale2;
            }
          }
          break;
        }

        case "fixed_length": {
          const s = shapesMap.get(c.shapeIds[0]);
          const targetLen = c.value ?? 100;
          if (s && (s.type === "line" || s.type === "arrow")) {
            const currL = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
            if (currL > 0) {
              const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
              s.x2 = s.x1 + Math.cos(angle) * targetLen;
              s.y2 = s.y1 + Math.sin(angle) * targetLen;
            }
          }
          break;
        }

        case "concentric": {
          const s1 = shapesMap.get(c.shapeIds[0]);
          const s2 = shapesMap.get(c.shapeIds[1]);
          if (
            s1 &&
            s2 &&
            (s1.type === "circle" || s1.type === "ellipse" || s1.type === "polygon") &&
            (s2.type === "circle" || s2.type === "ellipse" || s2.type === "polygon")
          ) {
            const avgX = (s1.cx + s2.cx) / 2;
            const avgY = (s1.cy + s2.cy) / 2;
            s1.cx = avgX;
            s1.cy = avgY;
            s2.cx = avgX;
            s2.cy = avgY;
          }
          break;
        }

        case "equal_radius": {
          const s1 = shapesMap.get(c.shapeIds[0]);
          const s2 = shapesMap.get(c.shapeIds[1]);
          if (s1 && s2 && s1.type === "circle" && s2.type === "circle") {
            const avgR = (s1.r + s2.r) / 2;
            s1.r = avgR;
            s2.r = avgR;
          }
          break;
        }

        case "aspect_ratio": {
          const s = shapesMap.get(c.shapeIds[0]);
          if (s && s.type === "rectangle") {
            const ratio = c.value ?? 1;
            s.height = s.width / Math.max(0.01, ratio);
          }
          break;
        }

        case "coincident": {
          const s1 = shapesMap.get(c.shapeIds[0]);
          const s2 = shapesMap.get(c.shapeIds[1]);
          if (s1 && s2 && (s1.type === "line" || s1.type === "arrow") && (s2.type === "line" || s2.type === "arrow")) {
            const idx1 = c.entityIndices?.[0] ?? 2;
            const idx2 = c.entityIndices?.[1] ?? 1;
            const p1x = idx1 === 1 ? s1.x1 : s1.x2;
            const p1y = idx1 === 1 ? s1.y1 : s1.y2;
            const p2x = idx2 === 1 ? s2.x1 : s2.x2;
            const p2y = idx2 === 1 ? s2.y1 : s2.y2;
            const avgX = (p1x + p2x) / 2;
            const avgY = (p1y + p2y) / 2;
            if (idx1 === 1) {
              s1.x1 = avgX;
              s1.y1 = avgY;
            } else {
              s1.x2 = avgX;
              s1.y2 = avgY;
            }
            if (idx2 === 1) {
              s2.x1 = avgX;
              s2.y1 = avgY;
            } else {
              s2.x2 = avgX;
              s2.y2 = avgY;
            }
          }
          break;
        }
      }

      const res = evaluateConstraintResidual(c, shapesMap);
      if (res > maxResidual) maxResidual = res;
    }
  }

  for (const c of enabledConstraints) {
    const res = evaluateConstraintResidual(c, shapesMap);
    const conflicts = conflictingMap.get(c.id);
    diagnostics.push({
      constraintId: c.id,
      satisfied: res <= tolerance * 10,
      residual: res,
      conflictsWith: conflicts,
      message: conflicts ? `Conflicting constraint detected` : res > tolerance * 10 ? `Unsatisfied (residual: ${res.toFixed(2)})` : "Satisfied",
    });
  }

  const hasConflicts = conflictingMap.size > 0;
  const allSatisfied = diagnostics.every((d) => d.satisfied);

  let status: SolverResult["status"] = "well_constrained";
  if (hasConflicts) status = "over_constrained";
  else if (!allSatisfied) status = "inconsistent";

  return {
    updatedShapes: Array.from(shapesMap.values()),
    converged: allSatisfied,
    iterations: iter,
    diagnostics,
    status,
  };
}
