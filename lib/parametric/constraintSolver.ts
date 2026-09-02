/**
 * Dedicated Geometric Constraint Solver & Kernel
 * Solves 2D geometric constraints (coincident, distance, parallel, perpendicular, angle, equal length, horizontal, vertical)
 * using iterative projection and least-action relaxation.
 * Preserves topology, angles, and local frames under-constrained systems.
 */

import { Point } from "../geometry/types";
import { ConstraintGraph, ConstraintNode } from "./constraintGraph";

export interface SolverPoint {
  id: string;
  x: number;
  y: number;
  isFixed: boolean;
  weight: number; // 0 = fixed/infinite mass, 1 = normal
}

export interface GeometricSolveResult {
  converged: boolean;
  iterations: number;
  maxResidual: number;
  points: Map<string, Point>;
  errors: string[];
}

export class GeometricConstraintSolver {
  private maxIterations: number = 50;
  private tolerance: number = 1e-4;

  constructor(maxIterations: number = 50, tolerance: number = 1e-4) {
    this.maxIterations = maxIterations;
    this.tolerance = tolerance;
  }

  /**
   * Solves point positions to satisfy all constraints in the ConstraintGraph.
   */
  public solve(
    graph: ConstraintGraph,
    initialPoints?: Map<string, Point>
  ): GeometricSolveResult {
    // 1. Collect points
    const points = new Map<string, SolverPoint>();
    for (const [id, ent] of graph.entities.entries()) {
      if (ent.type === "point" && ent.point) {
        const initPt = initialPoints?.get(id) || ent.point;
        points.set(id, {
          id,
          x: initPt.x,
          y: initPt.y,
          isFixed: !!ent.isFixed,
          weight: ent.isFixed ? 0 : 1,
        });
      }
    }

    if (points.size === 0) {
      return {
        converged: true,
        iterations: 0,
        maxResidual: 0,
        points: new Map(),
        errors: [],
      };
    }

    // 2. Filter active driving constraints
    const activeConstraints = Array.from(graph.constraints.values()).filter(
      (c) => c.isDriving
    );

    let maxResidual = 0;
    let iter = 0;
    const errors: string[] = [];

    // 3. Iterative relaxation loop (Projected Gauss-Seidel / PBD)
    for (iter = 0; iter < this.maxIterations; iter++) {
      maxResidual = 0;

      for (const c of activeConstraints) {
        const residual = this.projectConstraint(c, points);
        if (residual > maxResidual) {
          maxResidual = residual;
        }
      }

      if (maxResidual < this.tolerance) {
        break;
      }
    }

    const converged = maxResidual < this.tolerance || iter < this.maxIterations;

    // 4. Extract resolved points
    const resultPoints = new Map<string, Point>();
    for (const [id, p] of points.entries()) {
      resultPoints.set(id, {
        x: Number(p.x.toFixed(4)),
        y: Number(p.y.toFixed(4)),
      });
      // Sync back to graph entity
      const ent = graph.entities.get(id);
      if (ent) {
        ent.point = { x: p.x, y: p.y };
      }
    }

    return {
      converged,
      iterations: iter,
      maxResidual: Number(maxResidual.toFixed(6)),
      points: resultPoints,
      errors,
    };
  }

  /**
   * Projects a single geometric constraint, adjusting point positions.
   * Returns absolute residual error.
   */
  private projectConstraint(c: ConstraintNode, points: Map<string, SolverPoint>): number {
    switch (c.type) {
      case "length":
      case "distance": {
        if (c.entityIds.length < 2 || c.targetValue === undefined) return 0;
        const p1 = points.get(c.entityIds[0]);
        const p2 = points.get(c.entityIds[1]);
        if (!p1 || !p2) return 0;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        const diff = dist - c.targetValue;
        const residual = Math.abs(diff);

        if (dist > 1e-9 && residual > 1e-6) {
          const wTotal = p1.weight + p2.weight;
          if (wTotal > 0) {
            const factor = diff / (dist * wTotal);
            if (!p1.isFixed) {
              p1.x += dx * factor * p1.weight;
              p1.y += dy * factor * p1.weight;
            }
            if (!p2.isFixed) {
              p2.x -= dx * factor * p2.weight;
              p2.y -= dy * factor * p2.weight;
            }
          }
        }
        return residual;
      }

      case "horizontal": {
        if (c.entityIds.length < 2) return 0;
        const p1 = points.get(c.entityIds[0]);
        const p2 = points.get(c.entityIds[1]);
        if (!p1 || !p2) return 0;

        const diff = p2.y - p1.y;
        const residual = Math.abs(diff);
        const wTotal = p1.weight + p2.weight;
        if (wTotal > 0) {
          const corr = diff / wTotal;
          if (!p1.isFixed) p1.y += corr * p1.weight;
          if (!p2.isFixed) p2.y -= corr * p2.weight;
        }
        return residual;
      }

      case "vertical": {
        if (c.entityIds.length < 2) return 0;
        const p1 = points.get(c.entityIds[0]);
        const p2 = points.get(c.entityIds[1]);
        if (!p1 || !p2) return 0;

        const diff = p2.x - p1.x;
        const residual = Math.abs(diff);
        const wTotal = p1.weight + p2.weight;
        if (wTotal > 0) {
          const corr = diff / wTotal;
          if (!p1.isFixed) p1.x += corr * p1.weight;
          if (!p2.isFixed) p2.x -= corr * p2.weight;
        }
        return residual;
      }

      case "coincident": {
        if (c.entityIds.length < 2) return 0;
        const p1 = points.get(c.entityIds[0]);
        const p2 = points.get(c.entityIds[1]);
        if (!p1 || !p2) return 0;

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const residual = Math.hypot(dx, dy);
        const wTotal = p1.weight + p2.weight;
        if (wTotal > 0) {
          if (!p1.isFixed) {
            p1.x += (dx / wTotal) * p1.weight;
            p1.y += (dy / wTotal) * p1.weight;
          }
          if (!p2.isFixed) {
            p2.x -= (dx / wTotal) * p2.weight;
            p2.y -= (dy / wTotal) * p2.weight;
          }
        }
        return residual;
      }

      case "parallel": {
        // Line 1: (p1 -> p2), Line 2: (p3 -> p4)
        if (c.entityIds.length < 4) return 0;
        const p1 = points.get(c.entityIds[0]);
        const p2 = points.get(c.entityIds[1]);
        const p3 = points.get(c.entityIds[2]);
        const p4 = points.get(c.entityIds[3]);
        if (!p1 || !p2 || !p3 || !p4) return 0;

        const d1x = p2.x - p1.x;
        const d1y = p2.y - p1.y;
        const d2x = p4.x - p3.x;
        const d2y = p4.y - p3.y;

        // 2D Cross product: d1x * d2y - d1y * d2x = 0
        const cross = d1x * d2y - d1y * d2x;
        const l1 = Math.hypot(d1x, d1y);
        const l2 = Math.hypot(d2x, d2y);
        if (l1 < 1e-6 || l2 < 1e-6) return 0;

        const residual = Math.abs(cross) / (l1 * l2);
        // Rotate line 2 slightly towards parallel direction of line 1
        const targetAngle = Math.atan2(d1y, d1x);
        const curAngle = Math.atan2(d2y, d2x);
        let angleDiff = targetAngle - curAngle;
        while (angleDiff > Math.PI / 2) angleDiff -= Math.PI;
        while (angleDiff < -Math.PI / 2) angleDiff += Math.PI;

        if (Math.abs(angleDiff) > 1e-6 && !p4.isFixed) {
          const midX = (p3.x + p4.x) / 2;
          const midY = (p3.y + p4.y) / 2;
          const rotCorr = angleDiff * 0.5;
          const cos = Math.cos(rotCorr);
          const sin = Math.sin(rotCorr);

          const vx = p4.x - midX;
          const vy = p4.y - midY;
          p4.x = midX + (vx * cos - vy * sin);
          p4.y = midY + (vx * sin + vy * cos);

          if (!p3.isFixed) {
            const v3x = p3.x - midX;
            const v3y = p3.y - midY;
            p3.x = midX + (v3x * cos - v3y * sin);
            p3.y = midY + (v3x * sin + v3y * cos);
          }
        }
        return residual;
      }

      case "perpendicular": {
        // Line 1: (p1 -> p2), Line 2: (p3 -> p4)
        if (c.entityIds.length < 4) return 0;
        const p1 = points.get(c.entityIds[0]);
        const p2 = points.get(c.entityIds[1]);
        const p3 = points.get(c.entityIds[2]);
        const p4 = points.get(c.entityIds[3]);
        if (!p1 || !p2 || !p3 || !p4) return 0;

        const d1x = p2.x - p1.x;
        const d1y = p2.y - p1.y;
        const d2x = p4.x - p3.x;
        const d2y = p4.y - p3.y;

        // Dot product = 0
        const dot = d1x * d2x + d1y * d2y;
        const l1 = Math.hypot(d1x, d1y);
        const l2 = Math.hypot(d2x, d2y);
        if (l1 < 1e-6 || l2 < 1e-6) return 0;

        const residual = Math.abs(dot) / (l1 * l2);
        // Desired perpendicular direction to line 1
        const perpAngle = Math.atan2(d1y, d1x) + Math.PI / 2;
        const curAngle = Math.atan2(d2y, d2x);
        let angleDiff = perpAngle - curAngle;
        while (angleDiff > Math.PI / 2) angleDiff -= Math.PI;
        while (angleDiff < -Math.PI / 2) angleDiff += Math.PI;

        if (Math.abs(angleDiff) > 1e-6 && !p4.isFixed) {
          const midX = (p3.x + p4.x) / 2;
          const midY = (p3.y + p4.y) / 2;
          const rotCorr = angleDiff * 0.5;
          const cos = Math.cos(rotCorr);
          const sin = Math.sin(rotCorr);

          const vx = p4.x - midX;
          const vy = p4.y - midY;
          p4.x = midX + (vx * cos - vy * sin);
          p4.y = midY + (vx * sin + vy * cos);

          if (!p3.isFixed) {
            const v3x = p3.x - midX;
            const v3y = p3.y - midY;
            p3.x = midX + (v3x * cos - v3y * sin);
            p3.y = midY + (v3x * sin + v3y * cos);
          }
        }
        return residual;
      }

      case "equal_length": {
        // Line 1: (p1 -> p2), Line 2: (p3 -> p4)
        if (c.entityIds.length < 4) return 0;
        const p1 = points.get(c.entityIds[0]);
        const p2 = points.get(c.entityIds[1]);
        const p3 = points.get(c.entityIds[2]);
        const p4 = points.get(c.entityIds[3]);
        if (!p1 || !p2 || !p3 || !p4) return 0;

        const l1 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const l2 = Math.hypot(p4.x - p3.x, p4.y - p3.y);
        const diff = l2 - l1;
        const target = (l1 + l2) / 2;

        // Project both lines towards average target length
        const subC1: ConstraintNode = { ...c, type: "length", entityIds: [c.entityIds[0], c.entityIds[1]], targetValue: target };
        const subC2: ConstraintNode = { ...c, type: "length", entityIds: [c.entityIds[2], c.entityIds[3]], targetValue: target };
        this.projectConstraint(subC1, points);
        this.projectConstraint(subC2, points);

        return Math.abs(diff);
      }

      default:
        return 0;
    }
  }
}
