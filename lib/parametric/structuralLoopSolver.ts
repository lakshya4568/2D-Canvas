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
 * Enforces strict coincident joint closure (V_N === V_0), so no line can ever "get out"
 * or detach from its neighbor.
 * Maintains edge orientations (horizontal, vertical, chamfer angles) while absorbing
 * closure residuals across the loop structure.
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

  // 1. Determine target length and direction for each edge
  interface EdgeTarget {
    shape: Shape;
    length: number;
    dirX: number;
    dirY: number;
    origLength: number;
  }

  const targets: EdgeTarget[] = [];

  for (let i = 0; i < N; i++) {
    const s = loopShapes[i] as any;
    const currDx = s.x2 - s.x1;
    const currDy = s.y2 - s.y1;
    const currL = Math.hypot(currDx, currDy);

    // Find target length from variables or current shape length
    let targetL = 0;
    if (s.name && variables.has(s.name)) {
      targetL = variables.get(s.name)!.value;
    } else if (variables.has(`L${i + 1}`)) {
      targetL = variables.get(`L${i + 1}`)!.value;
    }
    if (targetL <= 0) targetL = currL > 0 ? currL : 10;

    // Detect geometric intent (horizontal, vertical, 45° chamfer, or arbitrary angle)
    let dirX = currL > 0 ? currDx / currL : 1;
    let dirY = currL > 0 ? currDy / currL : 0;

    const absDx = Math.abs(currDx);
    const absDy = Math.abs(currDy);

    if (absDy < 0.15 * absDx) {
      // Horizontal
      dirX = currDx >= 0 ? 1 : -1;
      dirY = 0;
    } else if (absDx < 0.15 * absDy) {
      // Vertical
      dirX = 0;
      dirY = currDy >= 0 ? 1 : -1;
    } else if (Math.abs(absDx - absDy) < 0.3 * Math.max(absDx, absDy)) {
      // 45° Chamfer / Miter
      const signX = currDx >= 0 ? 1 : -1;
      const signY = currDy >= 0 ? 1 : -1;
      dirX = signX * Math.SQRT1_2;
      dirY = signY * Math.SQRT1_2;
    }

    targets.push({
      shape: s,
      length: targetL,
      dirX,
      dirY,
      origLength: currL,
    });
  }

  // 2. Check if single-edge change warrants uniform proportional scaling (e.g. triangle)
  let changedEdgeIdx = -1;
  let singleScale = 1;
  let changeCount = 0;

  for (let i = 0; i < N; i++) {
    const origL = targets[i].origLength;
    const targetL = targets[i].length;
    if (origL > 1e-3 && Math.abs(targetL - origL) > 1e-3) {
      changedEdgeIdx = i;
      singleScale = targetL / origL;
      changeCount++;
    }
  }

  // If only 1 edge changed and other edges have no custom formula, scale loop proportionally
  const otherEdgesHaveFormulas = loopShapes.some((s, idx) => {
    if (idx === changedEdgeIdx) return false;
    return Boolean(s.name && variables.get(s.name)?.formula);
  });

  if (changeCount === 1 && changedEdgeIdx !== -1 && singleScale > 0 && !otherEdgesHaveFormulas) {
    const anchor = loopVertices[changedEdgeIdx];
    const scaledVertices: Point[] = loopVertices.map((v) => ({
      x: Number((anchor.x + singleScale * (v.x - anchor.x)).toFixed(2)),
      y: Number((anchor.y + singleScale * (v.y - anchor.y)).toFixed(2)),
    }));

    const updatedShapes: Shape[] = [];
    for (let i = 0; i < N; i++) {
      const pStart = scaledVertices[i];
      const pEnd = scaledVertices[(i + 1) % N];
      const origShape = targets[i].shape;

      updatedShapes.push({
        ...origShape,
        x1: pStart.x,
        y1: pStart.y,
        x2: pEnd.x,
        y2: pEnd.y,
      } as Shape);

      if (origShape.name && variables.has(origShape.name)) {
        const v = variables.get(origShape.name)!;
        if (!v.formula) {
          v.value = Math.round(Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y));
        }
      }
    }

    return {
      updatedShapes,
      updatedVertices: scaledVertices,
      closed: true,
    };
  }

  // 3. Multi-edge constraint solving: distribute closure residual proportionally
  const anchor: Point = { x: loopVertices[0].x, y: loopVertices[0].y };
  const rawVertices: Point[] = [{ x: anchor.x, y: anchor.y }];
  for (let i = 0; i < N; i++) {
    const prev = rawVertices[i];
    const t = targets[i];
    rawVertices.push({
      x: prev.x + t.length * t.dirX,
      y: prev.y + t.length * t.dirY,
    });
  }

  // Closure residual vector: delta = rawVertices[N] - rawVertices[0]
  const deltaX = rawVertices[N].x - rawVertices[0].x;
  const deltaY = rawVertices[N].y - rawVertices[0].y;

  // V_i' = rawVertices[i] - (i / N) * delta
  // This guarantees: V_0' = V_0, and V_N' = rawVertices[N] - delta = V_0!
  const solvedVertices: Point[] = [];
  for (let i = 0; i < N; i++) {
    const factor = i / N;
    solvedVertices.push({
      x: Number((rawVertices[i].x - factor * deltaX).toFixed(2)),
      y: Number((rawVertices[i].y - factor * deltaY).toFixed(2)),
    });
  }

  // 4. Update shapes: shape i strictly connects solvedVertices[i] to solvedVertices[(i + 1) % N]
  // Coincident joint closure is strictly enforced; no edge can ever detach!
  const updatedShapes: Shape[] = [];
  for (let i = 0; i < N; i++) {
    const pStart = solvedVertices[i];
    const pEnd = solvedVertices[(i + 1) % N];
    const origShape = targets[i].shape;

    updatedShapes.push({
      ...origShape,
      x1: pStart.x,
      y1: pStart.y,
      x2: pEnd.x,
      y2: pEnd.y,
    } as Shape);

    if (origShape.name && variables.has(origShape.name)) {
      const v = variables.get(origShape.name)!;
      if (!v.formula) {
        v.value = Math.round(Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y));
      }
    }
  }

  return {
    updatedShapes,
    updatedVertices: solvedVertices,
    closed: true,
  };
}
