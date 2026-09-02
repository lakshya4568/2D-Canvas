import { Point, Shape } from "../geometry/types";
import { ParametricVariable } from "./model";

export interface StructuralLoopSolveOptions {
  loopShapes: Shape[];
  loopVertices: Point[];
  variables: Map<string, ParametricVariable>;
}

export interface StructuralLoopSolveResult {
  updatedShapes: Shape[];
  updatedVertices: Point[];
  closed: boolean;
}

/**
 * Solves a closed polygonal loop of connected line segments.
 * 
 * 1. Proportional Scaling (Single Driven Edge):
 *    If the user modifies one edge of a closed shape (e.g. triangle L1 = 300),
 *    the entire loop scales proportionally around that edge's start anchor.
 *    All angles and edge orientations (horizontal, vertical, etc.) are 100% preserved.
 *    The other unconstrained edges (L2, L3, ...) are automatically recalculated.
 * 
 * 2. Multi-Edge Constraint Closure:
 *    If multiple edges have specified lengths, the solver follows the true directed
 *    vertex cycle (V_0 -> V_1 -> ... -> V_{N-1} -> V_0), ensuring edge directions
 *    never get inverted by backwards line drawing, and smoothly absorbs closure residuals
 *    so all corners remain 100% coincident with zero gap.
 */
export function solveClosedStructuralLoop(
  options: StructuralLoopSolveOptions
): StructuralLoopSolveResult {
  const { loopShapes, loopVertices, variables } = options;
  const N = loopShapes.length;
  if (N < 3 || loopVertices.length < 3) {
    return {
      updatedShapes: loopShapes,
      updatedVertices: loopVertices,
      closed: false,
    };
  }

  // Helper: map shape to its target length from variables or current shape length
  const getShapeTargetLength = (s: Shape): number => {
    let target = 0;
    if (s.name && variables.has(s.name)) {
      target = variables.get(s.name)!.value;
    }
    const currentLen = Math.hypot((s as any).x2 - (s as any).x1, (s as any).y2 - (s as any).y1);
    return target > 0 ? target : currentLen;
  };

  // 1. Detect which edge(s) had an intentional user change (threshold >= 1.5px to ignore integer rounding noise)
  let changedEdgeIdx = -1;
  let singleScale = 1;
  let changeCount = 0;

  for (let i = 0; i < N; i++) {
    const s = loopShapes[i] as any;
    const currentLen = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const targetLen = getShapeTargetLength(s);

    if (currentLen > 1 && Math.abs(targetLen - currentLen) >= 1.5) {
      changedEdgeIdx = i;
      singleScale = targetLen / currentLen;
      changeCount++;
    }
  }

  // Check if any other edge has an explicit custom formula (which would override proportional scaling)
  const otherEdgesHaveFormulas = loopShapes.some((s, idx) => {
    if (idx === changedEdgeIdx) return false;
    return Boolean(s.name && variables.get(s.name)?.formula);
  });

  // CASE 1: Single Driven Edge -> Proportional Shape-Preserving Scaling (e.g. Triangle, Polygon)
  if (changeCount === 1 && changedEdgeIdx !== -1 && singleScale > 0 && !otherEdgesHaveFormulas) {
    const drivingShape = loopShapes[changedEdgeIdx] as any;
    const anchor: Point = { x: drivingShape.x1, y: drivingShape.y1 };

    // Scale all loop vertices uniformly around the driving anchor point
    const scaledVertices: Point[] = loopVertices.map((v) => ({
      x: Number((anchor.x + singleScale * (v.x - anchor.x)).toFixed(2)),
      y: Number((anchor.y + singleScale * (v.y - anchor.y)).toFixed(2)),
    }));

    // Reconstruct each shape, strictly preserving its original drawing polarity (p1 vs p2)
    const updatedShapes: Shape[] = loopShapes.map((s) => {
      const orig = s as any;
      let bestV1 = 0, bestDist1 = Infinity;
      let bestV2 = 0, bestDist2 = Infinity;

      for (let vIdx = 0; vIdx < loopVertices.length; vIdx++) {
        const d1 = Math.hypot(orig.x1 - loopVertices[vIdx].x, orig.y1 - loopVertices[vIdx].y);
        const d2 = Math.hypot(orig.x2 - loopVertices[vIdx].x, orig.y2 - loopVertices[vIdx].y);
        if (d1 < bestDist1) { bestDist1 = d1; bestV1 = vIdx; }
        if (d2 < bestDist2) { bestDist2 = d2; bestV2 = vIdx; }
      }

      const newP1 = scaledVertices[bestV1];
      const newP2 = scaledVertices[bestV2];

      // Autocalculate variable value if no explicit formula
      if (s.name && variables.has(s.name)) {
        const v = variables.get(s.name)!;
        if (!v.formula) {
          v.value = Math.round(Math.hypot(newP2.x - newP1.x, newP2.y - newP1.y));
        }
      }

      return {
        ...s,
        x1: newP1.x,
        y1: newP1.y,
        x2: newP2.x,
        y2: newP2.y,
      } as Shape;
    });

    return {
      updatedShapes,
      updatedVertices: scaledVertices,
      closed: true,
    };
  }

  // CASE 2: Multi-Edge Constraint Closure
  // Follow the true cyclical order of loop vertices V_0 -> V_1 -> ... -> V_{N-1} -> V_0
  const anchor: Point = { x: loopVertices[0].x, y: loopVertices[0].y };

  // For each step i around the loop (from loopVertices[i] to loopVertices[(i+1)%N]),
  // find the corresponding shape and its target length
  interface CycleSegment {
    fromIdx: number;
    toIdx: number;
    shape: Shape;
    origDx: number;
    origDy: number;
    origLen: number;
    targetLen: number;
  }

  const cycleSegments: CycleSegment[] = [];

  for (let i = 0; i < N; i++) {
    const vCurr = loopVertices[i];
    const vNext = loopVertices[(i + 1) % N];
    const cycleDx = vNext.x - vCurr.x;
    const cycleDy = vNext.y - vCurr.y;
    const cycleLen = Math.hypot(cycleDx, cycleDy);

    // Find matching shape that connects these two vertices
    let matchedShape = loopShapes[i];
    for (const sh of loopShapes) {
      const line = sh as any;
      const d1 = Math.hypot(line.x1 - vCurr.x, line.y1 - vCurr.y) + Math.hypot(line.x2 - vNext.x, line.y2 - vNext.y);
      const d2 = Math.hypot(line.x2 - vCurr.x, line.y2 - vCurr.y) + Math.hypot(line.x1 - vNext.x, line.y1 - vNext.y);
      if (Math.min(d1, d2) < 15) {
        matchedShape = sh;
        break;
      }
    }

    const targetLen = getShapeTargetLength(matchedShape);

    cycleSegments.push({
      fromIdx: i,
      toIdx: (i + 1) % N,
      shape: matchedShape,
      origDx: cycleDx,
      origDy: cycleDy,
      origLen: cycleLen > 0 ? cycleLen : 1,
      targetLen: targetLen > 0 ? targetLen : (cycleLen > 0 ? cycleLen : 10),
    });
  }

  // Compute forward vertices along the cyclical boundary
  const rawVertices: Point[] = [{ x: anchor.x, y: anchor.y }];
  for (let i = 0; i < N; i++) {
    const prev = rawVertices[i];
    const seg = cycleSegments[i];

    // Detect geometric intent from the cycle vector
    let dirX = seg.origDx / seg.origLen;
    let dirY = seg.origDy / seg.origLen;

    const absDx = Math.abs(seg.origDx);
    const absDy = Math.abs(seg.origDy);

    if (absDy < 0.15 * absDx) {
      // Horizontal
      dirX = seg.origDx >= 0 ? 1 : -1;
      dirY = 0;
    } else if (absDx < 0.15 * absDy) {
      // Vertical
      dirX = 0;
      dirY = seg.origDy >= 0 ? 1 : -1;
    } else if (Math.abs(absDx - absDy) < 0.3 * Math.max(absDx, absDy)) {
      // 45° Chamfer
      dirX = (seg.origDx >= 0 ? 1 : -1) * Math.SQRT1_2;
      dirY = (seg.origDy >= 0 ? 1 : -1) * Math.SQRT1_2;
    }

    rawVertices.push({
      x: prev.x + seg.targetLen * dirX,
      y: prev.y + seg.targetLen * dirY,
    });
  }

  // Closure residual vector: delta = rawVertices[N] - rawVertices[0]
  const deltaX = rawVertices[N].x - rawVertices[0].x;
  const deltaY = rawVertices[N].y - rawVertices[0].y;

  // V_i' = rawVertices[i] - (i / N) * delta
  // Guarantees: V_0' = V_0, and V_N' = rawVertices[N] - delta = V_0!
  const solvedVertices: Point[] = [];
  for (let i = 0; i < N; i++) {
    const factor = i / N;
    solvedVertices.push({
      x: Number((rawVertices[i].x - factor * deltaX).toFixed(2)),
      y: Number((rawVertices[i].y - factor * deltaY).toFixed(2)),
    });
  }

  // Map solved vertices back to each shape, respecting original drawing polarity
  const updatedShapes: Shape[] = loopShapes.map((s) => {
    const orig = s as any;
    let bestV1 = 0, bestDist1 = Infinity;
    let bestV2 = 0, bestDist2 = Infinity;

    for (let vIdx = 0; vIdx < loopVertices.length; vIdx++) {
      const d1 = Math.hypot(orig.x1 - loopVertices[vIdx].x, orig.y1 - loopVertices[vIdx].y);
      const d2 = Math.hypot(orig.x2 - loopVertices[vIdx].x, orig.y2 - loopVertices[vIdx].y);
      if (d1 < bestDist1) { bestDist1 = d1; bestV1 = vIdx; }
      if (d2 < bestDist2) { bestDist2 = d2; bestV2 = vIdx; }
    }

    const newP1 = solvedVertices[bestV1];
    const newP2 = solvedVertices[bestV2];

    if (s.name && variables.has(s.name)) {
      const v = variables.get(s.name)!;
      if (!v.formula) {
        v.value = Math.round(Math.hypot(newP2.x - newP1.x, newP2.y - newP1.y));
      }
    }

    return {
      ...s,
      x1: newP1.x,
      y1: newP1.y,
      x2: newP2.x,
      y2: newP2.y,
    } as Shape;
  });

  return {
    updatedShapes,
    updatedVertices: solvedVertices,
    closed: true,
  };
}
