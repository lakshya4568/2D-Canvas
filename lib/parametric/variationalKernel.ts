import { Point, Shape } from "../geometry/types";
import { solveLevenbergMarquardt, SystemModel } from "../solver/levenbergMarquardt";
import { createMatrix } from "../solver/matrix/denseMatrix";
import { detectGADAssemblies, solveGADAssemblyAdjustment } from "../geometry/gadAssemblyEngine";

export interface TopologicalVertex {
  id: number;
  x: number;
  y: number;
  initialX: number;
  initialY: number;
  incidentShapes: string[];
}

export interface SegmentPrimitive {
  shapeId: string;
  v1: number; // Index into vertices
  v2: number;
  length: number;
  angleDeg: number;
  isHorizontal: boolean;
  isVertical: boolean;
}

export interface InferredConstraint {
  type: "horizontal" | "vertical" | "perpendicular" | "parallel" | "offset" | "haunch_angle" | "datum" | "driving_length" | "driving_span";
  description: string;
  vertexIndices: number[];
  targetValue?: number;
  weight?: number;
}

export interface VariationalGADModel {
  vertices: TopologicalVertex[];
  segments: SegmentPrimitive[];
  constraints: InferredConstraint[];
  shapeVertexMap: Map<string, number[]>; // shapeId -> vertex indices
}

/**
 * Builds a topological vertex graph and infers geometric invariants from arbitrary GAD shapes.
 */
export function extractVariationalGAD(
  shapes: Shape[],
  weldingTolerance: number = 5.0
): VariationalGADModel {
  const vertices: TopologicalVertex[] = [];
  const shapeVertexMap = new Map<string, number[]>();

  const findOrAddVertex = (x: number, y: number, shapeId: string): number => {
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      if (Math.hypot(v.x - x, v.y - y) <= weldingTolerance) {
        if (!v.incidentShapes.includes(shapeId)) {
          v.incidentShapes.push(shapeId);
        }
        return i;
      }
    }

    const newIdx = vertices.length;
    vertices.push({
      id: newIdx,
      x,
      y,
      initialX: x,
      initialY: y,
      incidentShapes: [shapeId],
    });
    return newIdx;
  };

  const segments: SegmentPrimitive[] = [];

  for (const s of shapes) {
    if (!s.isVisible && s.isVisible !== undefined) continue;

    switch (s.type) {
      case "line":
      case "arrow": {
        const v1 = findOrAddVertex(s.x1, s.y1, s.id);
        const v2 = findOrAddVertex(s.x2, s.y2, s.id);
        shapeVertexMap.set(s.id, [v1, v2]);

        const dx = s.x2 - s.x1;
        const dy = s.y2 - s.y1;
        const len = Math.hypot(dx, dy);
        const angle = (Math.atan2(dy, dx) * 180.0) / Math.PI;

        segments.push({
          shapeId: s.id,
          v1,
          v2,
          length: len,
          angleDeg: (angle + 360) % 360,
          isHorizontal: Math.abs(dy) <= 2.0,
          isVertical: Math.abs(dx) <= 2.0,
        });
        break;
      }

      case "rectangle": {
        const pTL = { x: s.x, y: s.y };
        const pTR = { x: s.x + s.width, y: s.y };
        const pBR = { x: s.x + s.width, y: s.y + s.height };
        const pBL = { x: s.x, y: s.y + s.height };

        const vTL = findOrAddVertex(pTL.x, pTL.y, s.id);
        const vTR = findOrAddVertex(pTR.x, pTR.y, s.id);
        const vBR = findOrAddVertex(pBR.x, pBR.y, s.id);
        const vBL = findOrAddVertex(pBL.x, pBL.y, s.id);

        shapeVertexMap.set(s.id, [vTL, vTR, vBR, vBL]);

        segments.push({
          shapeId: s.id + "_top",
          v1: vTL,
          v2: vTR,
          length: s.width,
          angleDeg: 0,
          isHorizontal: true,
          isVertical: false,
        });
        segments.push({
          shapeId: s.id + "_right",
          v1: vTR,
          v2: vBR,
          length: s.height,
          angleDeg: 90,
          isHorizontal: false,
          isVertical: true,
        });
        segments.push({
          shapeId: s.id + "_bottom",
          v1: vBL,
          v2: vBR,
          length: s.width,
          angleDeg: 0,
          isHorizontal: true,
          isVertical: false,
        });
        segments.push({
          shapeId: s.id + "_left",
          v1: vTL,
          v2: vBL,
          length: s.height,
          angleDeg: 90,
          isHorizontal: false,
          isVertical: true,
        });
        break;
      }

      case "polygon": {
        // N-gon points
        if (s.r > 0 && s.sides >= 3) {
          const polyVerts: number[] = [];
          for (let i = 0; i < s.sides; i++) {
            const a = (i * 2 * Math.PI) / s.sides - Math.PI / 2;
            const px = s.cx + s.r * Math.cos(a);
            const py = s.cy + s.r * Math.sin(a);
            polyVerts.push(findOrAddVertex(px, py, s.id));
          }
          shapeVertexMap.set(s.id, polyVerts);
          for (let i = 0; i < polyVerts.length; i++) {
            const nextIdx = (i + 1) % polyVerts.length;
            const p1 = vertices[polyVerts[i]];
            const p2 = vertices[polyVerts[nextIdx]];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            segments.push({
              shapeId: `${s.id}_edge_${i}`,
              v1: polyVerts[i],
              v2: polyVerts[nextIdx],
              length: Math.hypot(dx, dy),
              angleDeg: (Math.atan2(dy, dx) * 180.0) / Math.PI,
              isHorizontal: Math.abs(dy) <= 2.0,
              isVertical: Math.abs(dx) <= 2.0,
            });
          }
        }
        break;
      }
    }
  }

  // Deduce Qualitative Invariants from Resting Geometry
  const constraints: InferredConstraint[] = [];

  // 1. Datum anchor on root vertex to prevent rigid-body drift
  if (vertices.length > 0) {
    // Find bottom-left or top-leftmost vertex as anchor
    let anchorIdx = 0;
    for (let i = 1; i < vertices.length; i++) {
      if (
        vertices[i].y < vertices[anchorIdx].y ||
        (vertices[i].y === vertices[anchorIdx].y && vertices[i].x < vertices[anchorIdx].x)
      ) {
        anchorIdx = i;
      }
    }
    constraints.push({
      type: "datum",
      description: `Anchor vertex ${anchorIdx}`,
      vertexIndices: [anchorIdx],
    });
  }

  // 2. Horizontal and Vertical segment constraints
  for (const seg of segments) {
    if (seg.v1 === seg.v2) continue;
    if (seg.isHorizontal) {
      constraints.push({
        type: "horizontal",
        description: `Segment ${seg.shapeId} horizontal`,
        vertexIndices: [seg.v1, seg.v2],
      });
    } else if (seg.isVertical) {
      constraints.push({
        type: "vertical",
        description: `Segment ${seg.shapeId} vertical`,
        vertexIndices: [seg.v1, seg.v2],
      });
    }
  }

  // 3. 45-degree Chamfers / Haunches
  for (const seg of segments) {
    if (seg.v1 === seg.v2) continue;
    const v1 = vertices[seg.v1];
    const v2 = vertices[seg.v2];
    const dx = Math.abs(v2.x - v1.x);
    const dy = Math.abs(v2.y - v1.y);
    if (dx > 4.0 && dy > 4.0 && Math.abs(dx - dy) <= 3.0) {
      // 45-degree haunch invariant: dx - dy = 0
      constraints.push({
        type: "haunch_angle",
        description: `Chamfer 45° for ${seg.shapeId}`,
        vertexIndices: [seg.v1, seg.v2],
      });
    }
  }

  // 4. Parallel Offsets (wall thicknesses, gaps, clearances, web thicknesses)
  for (let i = 0; i < segments.length; i++) {
    const s1 = segments[i];
    for (let j = i + 1; j < segments.length; j++) {
      const s2 = segments[j];
      if (s1.v1 === s2.v1 || s1.v1 === s2.v2 || s1.v2 === s2.v1 || s1.v2 === s2.v2) continue;

      if (s1.isHorizontal && s2.isHorizontal) {
        const y1 = vertices[s1.v1].y;
        const y2 = vertices[s2.v1].y;
        const dist = Math.abs(y2 - y1);
        if (dist > 3.0 && dist < 500.0) {
          // Check horizontal overlap
          const minX1 = Math.min(vertices[s1.v1].x, vertices[s1.v2].x);
          const maxX1 = Math.max(vertices[s1.v1].x, vertices[s1.v2].x);
          const minX2 = Math.min(vertices[s2.v1].x, vertices[s2.v2].x);
          const maxX2 = Math.max(vertices[s2.v1].x, vertices[s2.v2].x);
          const overlap = Math.min(maxX1, maxX2) - Math.max(minX1, minX2);

          if (overlap > 10.0) {
            constraints.push({
              type: "offset",
              description: `Horizontal offset ${dist.toFixed(1)}px`,
              vertexIndices: [s1.v1, s2.v1],
              targetValue: dist,
            });
          }
        }
      } else if (s1.isVertical && s2.isVertical) {
        const x1 = vertices[s1.v1].x;
        const x2 = vertices[s2.v1].x;
        const dist = Math.abs(x2 - x1);
        if (dist > 3.0 && dist < 500.0) {
          const minY1 = Math.min(vertices[s1.v1].y, vertices[s1.v2].y);
          const maxY1 = Math.max(vertices[s1.v1].y, vertices[s1.v2].y);
          const minY2 = Math.min(vertices[s2.v1].y, vertices[s2.v2].y);
          const maxY2 = Math.max(vertices[s2.v1].y, vertices[s2.v2].y);
          const overlap = Math.min(maxY1, maxY2) - Math.max(minY1, minY2);

          if (overlap > 10.0) {
            constraints.push({
              type: "offset",
              description: `Vertical offset ${dist.toFixed(1)}px`,
              vertexIndices: [s1.v1, s2.v1],
              targetValue: dist,
            });
          }
        }
      }
    }
  }

  return {
    vertices,
    segments,
    constraints,
    shapeVertexMap,
  };
}

/**
 * Solves arbitrary GAD geometry variationally when any dimension is modified,
 * automatically preserving all deduced geometric relationships without manual formulas.
 */
export function solveVariationalGAD(
  shapes: Shape[],
  modification: {
    targetShapeId?: string;
    newLength?: number;
    newWidth?: number;
    newHeight?: number;
    deltaSpan?: number;
  }
): { updatedShapes: Shape[]; converged: boolean } {
  const assemblies = detectGADAssemblies(shapes);
  if (assemblies.length > 0) {
    const res = solveGADAssemblyAdjustment(shapes, {
      shapeId: modification.targetShapeId,
      newSpan: modification.newWidth ?? modification.newLength,
      newHeight: modification.newHeight,
      deltaSpan: modification.deltaSpan,
    });
    if (res.solved) {
      return { updatedShapes: res.updatedShapes, converged: true };
    }
  }

  const gad = extractVariationalGAD(shapes);
  const n = gad.vertices.length;
  if (n === 0) return { updatedShapes: shapes, converged: true };

  // Initial state vector X in R^(2n)
  const X0 = new Array<number>(2 * n);
  for (let i = 0; i < n; i++) {
    X0[2 * i] = gad.vertices[i].x;
    X0[2 * i + 1] = gad.vertices[i].y;
  }

  // Active constraints for the solver
  const activeConstraints = [...gad.constraints];

  // Apply driving modification constraint
  if (modification.targetShapeId) {
    const vIndices = gad.shapeVertexMap.get(modification.targetShapeId);
    if (vIndices && vIndices.length >= 2) {
      if (modification.newLength !== undefined) {
        // Line driving constraint: distance between vIndices[0] and vIndices[1]
        activeConstraints.push({
          type: "driving_length",
          description: `Drive length of ${modification.targetShapeId} to ${modification.newLength}`,
          vertexIndices: [vIndices[0], vIndices[1]],
          targetValue: modification.newLength,
          weight: 10.0,
        });
      } else if (modification.newWidth !== undefined && vIndices.length >= 4) {
        // Rectangle width: distance between vIndices[0] (TL) and vIndices[1] (TR)
        activeConstraints.push({
          type: "driving_span",
          description: `Drive width of ${modification.targetShapeId} to ${modification.newWidth}`,
          vertexIndices: [vIndices[0], vIndices[1]],
          targetValue: modification.newWidth,
          weight: 10.0,
        });
      }
    }
  }

  // Formulate SystemModel for Levenberg-Marquardt solver
  const systemModel: SystemModel = {
    evaluateResiduals(X: number[]): number[] {
      const residuals: number[] = [];

      for (const c of activeConstraints) {
        switch (c.type) {
          case "datum": {
            const vIdx = c.vertexIndices[0];
            const w = c.weight ?? 1.0;
            residuals.push((X[2 * vIdx] - gad.vertices[vIdx].initialX) * w);
            residuals.push((X[2 * vIdx + 1] - gad.vertices[vIdx].initialY) * w);
            break;
          }

          case "horizontal": {
            const [v1, v2] = c.vertexIndices;
            residuals.push(X[2 * v2 + 1] - X[2 * v1 + 1]);
            break;
          }

          case "vertical": {
            const [v1, v2] = c.vertexIndices;
            residuals.push(X[2 * v2] - X[2 * v1]);
            break;
          }

          case "haunch_angle": {
            const [v1, v2] = c.vertexIndices;
            const dx = Math.abs(X[2 * v2] - X[2 * v1]);
            const dy = Math.abs(X[2 * v2 + 1] - X[2 * v1 + 1]);
            residuals.push(dx - dy);
            break;
          }

          case "offset": {
            const [v1, v2] = c.vertexIndices;
            const targetDist = c.targetValue ?? 0;
            const isHoriz = Math.abs(gad.vertices[v1].initialY - gad.vertices[v2].initialY) > Math.abs(gad.vertices[v1].initialX - gad.vertices[v2].initialX);
            if (isHoriz) {
              const currentDist = Math.abs(X[2 * v2 + 1] - X[2 * v1 + 1]);
              residuals.push(currentDist - targetDist);
            } else {
              const currentDist = Math.abs(X[2 * v2] - X[2 * v1]);
              residuals.push(currentDist - targetDist);
            }
            break;
          }

          case "driving_length": {
            const [v1, v2] = c.vertexIndices;
            const dx = X[2 * v2] - X[2 * v1];
            const dy = X[2 * v2 + 1] - X[2 * v1 + 1];
            const curL = Math.hypot(dx, dy);
            const w = c.weight ?? 5.0;
            residuals.push((curL - (c.targetValue ?? 0)) * w);
            break;
          }

          case "driving_span": {
            const [v1, v2] = c.vertexIndices;
            const dx = X[2 * v2] - X[2 * v1];
            const w = c.weight ?? 5.0;
            residuals.push((dx - (c.targetValue ?? 0)) * w);
            break;
          }
        }
      }

      return residuals;
    },

    evaluateJacobian(X: number[]): number[][] {
      // NOTE (accuracy correction): this computes the FULL Jacobian by forward
      // finite differences. There is no analytical path here, despite what an
      // earlier version of this comment claimed. §28 requires exact partials on
      // the production solve path; the analytical registry lives in
      // `lib/solver/jacobians/analyticalJacobians.ts` and is used by
      // `planegcsClient.ts`. This kernel is a reference/oracle implementation
      // exercised only by `tests/unit/variational_kernel.test.ts`, so forward
      // differences are acceptable HERE and nowhere else.
      const baseF = this.evaluateResiduals(X);
      const m = baseF.length;
      const totalVars = 2 * n;
      const J = createMatrix(m, totalVars);
      // Forward-difference step. Not a model-space tolerance (§17): it is a
      // numerical differentiation step size in state-vector units.
      const eps = 1e-6;

      for (let j = 0; j < totalVars; j++) {
        const origVal = X[j];
        X[j] = origVal + eps;
        const fPlus = this.evaluateResiduals(X);
        X[j] = origVal;

        for (let i = 0; i < m; i++) {
          J[i][j] = (fPlus[i] - baseF[i]) / eps;
        }
      }

      return J;
    },
  };

  // Execute Damped Levenberg-Marquardt with SVD Minimum-Norm Projection
  const solveResult = solveLevenbergMarquardt(systemModel, X0, {
    maxIterations: 60,
    toleranceResidual: 1e-5,
    initialLambda: 1e-3,
  });

  const solvedX = solveResult.solution;

  // Map solved vertex coordinates back to shapes
  const updatedShapes = shapes.map((shape) => {
    const s = { ...shape };
    const vIndices = gad.shapeVertexMap.get(s.id);
    if (!vIndices) return s;

    switch (s.type) {
      case "line":
      case "arrow": {
        const [v1, v2] = vIndices;
        return {
          ...s,
          x1: Math.round(solvedX[2 * v1]),
          y1: Math.round(solvedX[2 * v1 + 1]),
          x2: Math.round(solvedX[2 * v2]),
          y2: Math.round(solvedX[2 * v2 + 1]),
        };
      }

      case "rectangle": {
        const [vTL, vTR, vBR, vBL] = vIndices;
        const xTL = solvedX[2 * vTL];
        const yTL = solvedX[2 * vTL + 1];
        const xTR = solvedX[2 * vTR];
        const yBL = solvedX[2 * vBL + 1];
        const width = Math.max(1, Math.round(xTR - xTL));
        const height = Math.max(1, Math.round(yBL - yTL));

        return {
          ...s,
          x: Math.round(xTL),
          y: Math.round(yTL),
          width,
          height,
        };
      }

      case "polygon": {
        // Compute new centroid and radius
        let sumX = 0;
        let sumY = 0;
        for (const idx of vIndices) {
          sumX += solvedX[2 * idx];
          sumY += solvedX[2 * idx + 1];
        }
        const cx = Math.round(sumX / vIndices.length);
        const cy = Math.round(sumY / vIndices.length);
        const r = Math.round(Math.hypot(solvedX[2 * vIndices[0]] - cx, solvedX[2 * vIndices[0] + 1] - cy));
        return {
          ...s,
          cx,
          cy,
          r,
        };
      }

      default:
        return s;
    }
  });

  return {
    updatedShapes,
    converged: solveResult.converged,
  };
}
