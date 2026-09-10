import { Shape, RectangleShape, CircleShape, PolygonShape, LineShape } from "../geometry/types";
import { detectGADAssemblies } from "../geometry/gadAssemblyEngine";
import { DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";

export type BoundaryLimitState = "Safe" | "Approaching Limit" | "At Limit" | "Exceeded" | "Invalid";

export type BoundaryLimitMode = "warning" | "constraint" | "adaptive";

export interface BoundaryLimitEvaluation {
  shapeId: string;
  shapeName: string;
  boundaryShapeId: string;
  boundaryShapeName: string;
  state: BoundaryLimitState;
  currentSpan: number;
  maximumSpan: number;
  remainingUnits: number;
  message: string;
  mode: BoundaryLimitMode;
  details: {
    exceedsLeft: number;
    exceedsRight: number;
    exceedsTop: number;
    exceedsBottom: number;
    isInsidePolygon: boolean;
  };
}

/**
 * Checks if point (px, py) is strictly or weakly inside a polygon defined by vertices.
 * Uses ray-casting algorithm.
 */
export function isPointInsidePolygon(px: number, py: number, vertices: { x: number; y: number }[]): boolean {
  let inside = false;
  const n = vertices.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;

    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Extracts outer boundary polygon/vertices for any shape (rectangle, polygon, or line loop).
 */
export function getShapeBoundaryPolygon(shape: Shape, allShapes: Shape[]): { x: number; y: number }[] | null {
  if (shape.type === "rectangle") {
    const s = shape as RectangleShape;
    return [
      { x: s.x, y: s.y },
      { x: s.x + s.width, y: s.y },
      { x: s.x + s.width, y: s.y + s.height },
      { x: s.x, y: s.y + s.height },
    ];
  }

  if (shape.type === "polygon") {
    const s = shape as PolygonShape;
    const verts: { x: number; y: number }[] = [];
    const n = Math.max(3, s.sides || 3);
    for (let i = 0; i < n; i++) {
      const angle = (i * 2 * Math.PI) / n - Math.PI / 2;
      verts.push({
        x: s.cx + s.r * Math.cos(angle),
        y: s.cy + s.r * Math.sin(angle),
      });
    }
    return verts;
  }

  return null;
}

/**
 * Extracts corner vertices for a given shape.
 */
export function getShapeCorners(shape: Shape): { x: number; y: number }[] {
  if (shape.type === "rectangle") {
    const s = shape as RectangleShape;
    return [
      { x: s.x, y: s.y },
      { x: s.x + s.width, y: s.y },
      { x: s.x + s.width, y: s.y + s.height },
      { x: s.x, y: s.y + s.height },
    ];
  }

  if (shape.type === "circle") {
    const s = shape as CircleShape;
    return [
      { x: s.cx - s.r, y: s.cy },
      { x: s.cx + s.r, y: s.cy },
      { x: s.cx, y: s.cy - s.r },
      { x: s.cx, y: s.cy + s.r },
    ];
  }

  if (shape.type === "line") {
    const s = shape as LineShape;
    return [
      { x: s.x1, y: s.y1 },
      { x: s.x2, y: s.y2 },
    ];
  }

  if (shape.type === "polygon") {
    const s = shape as PolygonShape;
    const verts: { x: number; y: number }[] = [];
    const n = Math.max(3, s.sides || 3);
    for (let i = 0; i < n; i++) {
      const angle = (i * 2 * Math.PI) / n - Math.PI / 2;
      verts.push({
        x: s.cx + s.r * Math.cos(angle),
        y: s.cy + s.r * Math.sin(angle),
      });
    }
    return verts;
  }

  return [];
}

/**
 * Evaluates whether an inner shape respects the boundary of its outer container,
 * calculating maximum allowable span, remaining margin, and limit state.
 */
export function evaluateBoundaryLimits(
  innerShape: Shape,
  outerShape: Shape,
  mode: BoundaryLimitMode = "warning",
  allShapes: Shape[] = []
): BoundaryLimitEvaluation {
  const innerCorners = getShapeCorners(innerShape);
  const outerPoly = getShapeBoundaryPolygon(outerShape, allShapes);

  // Default fallback bounding boxes
  let outerMinX = 0;
  let outerMaxX = 0;
  let outerMinY = 0;
  let outerMaxY = 0;

  if (outerShape.type === "rectangle") {
    const o = outerShape as RectangleShape;
    outerMinX = o.x;
    outerMaxX = o.x + o.width;
    outerMinY = o.y;
    outerMaxY = o.y + o.height;
  } else if (outerPoly && outerPoly.length > 0) {
    outerMinX = Math.min(...outerPoly.map((p) => p.x));
    outerMaxX = Math.max(...outerPoly.map((p) => p.x));
    outerMinY = Math.min(...outerPoly.map((p) => p.y));
    outerMaxY = Math.max(...outerPoly.map((p) => p.y));
  }

  let innerMinX = Math.min(...innerCorners.map((p) => p.x));
  let innerMaxX = Math.max(...innerCorners.map((p) => p.x));
  let innerMinY = Math.min(...innerCorners.map((p) => p.y));
  let innerMaxY = Math.max(...innerCorners.map((p) => p.y));

  const currentSpan = Math.max(1, innerMaxX - innerMinX);

  // If outer shape is a polygon (e.g. triangle or trapezoid), calculate the horizontal span available at inner shape's Y level
  let maxSpanAtY = outerMaxX - outerMinX;
  let isInsidePoly = true;

  if (outerShape.type !== "rectangle" && outerPoly && outerPoly.length >= 3) {
    // Check if all inner corners are inside the outer polygon
    for (const corner of innerCorners) {
      if (!isPointInsidePolygon(corner.x, corner.y, outerPoly)) {
        isInsidePoly = false;
        break;
      }
    }

    // Find min and max intersection X with the outer polygon at inner shape's top and bottom Y
    const yLevels = [innerMinY, innerMaxY, (innerMinY + innerMaxY) / 2];
    let restrictedSpan = Infinity;

    for (const y of yLevels) {
      const xIntersects: number[] = [];
      const n = outerPoly.length;
      for (let i = 0; i < n; i++) {
        const p1 = outerPoly[i];
        const p2 = outerPoly[(i + 1) % n];
        if ((p1.y <= y && p2.y >= y) || (p2.y <= y && p1.y >= y)) {
          if (Math.abs(p2.y - p1.y) > 1e-4) {
            const t = (y - p1.y) / (p2.y - p1.y);
            const x = p1.x + t * (p2.x - p1.x);
            xIntersects.push(x);
          }
        }
      }
      if (xIntersects.length >= 2) {
        xIntersects.sort((a, b) => a - b);
        const spanAtLevel = xIntersects[xIntersects.length - 1] - xIntersects[0];
        restrictedSpan = Math.min(restrictedSpan, spanAtLevel);
      }
    }

    if (restrictedSpan !== Infinity && restrictedSpan > 0) {
      maxSpanAtY = restrictedSpan;
    }
  } else {
    isInsidePoly = true;
  }

  const exceedsLeft = Math.max(0, outerMinX - innerMinX);
  const exceedsRight = Math.max(0, innerMaxX - outerMaxX);
  const exceedsTop = Math.max(0, outerMinY - innerMinY);
  const exceedsBottom = Math.max(0, innerMaxY - outerMaxY);

  const remainingUnits = maxSpanAtY - currentSpan;

  let state: BoundaryLimitState = "Safe";
  let message = `Safe: ${Math.round(remainingUnits)} units remaining`;

  // §17: one tolerance policy, injected. Never a module-local constant.
  const eps = DEFAULT_TOLERANCE_POLICY.geometry_mm;
  if (currentSpan <= 0) {
    state = "Invalid";
    message = "Invalid: Span must be greater than zero";
  } else if (
    Math.abs(remainingUnits) <= eps &&
    exceedsLeft <= eps &&
    exceedsRight <= eps &&
    exceedsTop <= eps &&
    exceedsBottom <= eps
  ) {
    state = "At Limit";
    message = "At Limit: 0 units remaining";
  } else if (
    !isInsidePoly ||
    remainingUnits < -eps ||
    exceedsLeft > eps ||
    exceedsRight > eps ||
    exceedsTop > eps ||
    exceedsBottom > eps
  ) {
    state = "Exceeded";
    const overage = Math.round(Math.abs(remainingUnits));
    message = `Shape exceeds available span by ${overage} units`;
  } else if (remainingUnits <= 0.15 * maxSpanAtY) {
    state = "Approaching Limit";
    message = `Approaching Limit: only ${Math.round(remainingUnits)} units remaining`;
  }

  return {
    shapeId: innerShape.id,
    shapeName: (innerShape as any).name || innerShape.id,
    boundaryShapeId: outerShape.id,
    boundaryShapeName: (outerShape as any).name || outerShape.id,
    state,
    currentSpan: Math.round(currentSpan),
    maximumSpan: Math.round(maxSpanAtY),
    remainingUnits: Math.round(remainingUnits),
    message,
    mode,
    details: {
      exceedsLeft: Math.round(exceedsLeft),
      exceedsRight: Math.round(exceedsRight),
      exceedsTop: Math.round(exceedsTop),
      exceedsBottom: Math.round(exceedsBottom),
      isInsidePolygon: isInsidePoly,
    },
  };
}

export function evaluateAllBoundaryLimits(shapes: Shape[]): BoundaryLimitEvaluation[] {
  const assemblies = detectGADAssemblies(shapes);
  const evals: BoundaryLimitEvaluation[] = [];

  for (const asm of assemblies) {
    const outerShape = shapes.find((s) => s.id === asm.outer.id);
    if (!outerShape) continue;

    for (const feat of asm.features) {
      const innerShape = shapes.find((s) => s.id === feat.id);
      if (!innerShape) continue;
      if (innerShape.id === outerShape.id) continue;

      evals.push(evaluateBoundaryLimits(innerShape, outerShape, "warning", shapes));
    }
  }

  return evals;
}
