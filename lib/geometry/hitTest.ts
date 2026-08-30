import { Point, Shape } from "./types";

/**
 * Calculates the shortest Euclidean distance from a test point P to a line segment AB.
 * Clamps projection parameter t to [0, 1] so it only tests the bounded segment, not infinite line.
 */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;

  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  const dot = wx * vx + wy * vy;
  const t = Math.max(0, Math.min(1, dot / lenSq));

  const projX = a.x + t * vx;
  const projY = a.y + t * vy;

  return Math.hypot(p.x - projX, p.y - projY);
}

/**
 * Tests if point P hits a line shape within a given tolerance.
 */
export function hitTestLine(p: Point, line: { x1: number; y1: number; x2: number; y2: number }, tolerance: number = 6): boolean {
  const dist = distanceToSegment(p, { x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 });
  return dist <= tolerance;
}

/**
 * Tests if point P hits a rectangle shape (either inside fill or along stroke boundary).
 */
export function hitTestRect(
  p: Point,
  rect: { x: number; y: number; width: number; height: number },
  tolerance: number = 6
): boolean {
  const inAABB =
    p.x >= rect.x - tolerance &&
    p.x <= rect.x + rect.width + tolerance &&
    p.y >= rect.y - tolerance &&
    p.y <= rect.y + rect.height + tolerance;

  if (!inAABB) return false;

  // Inside filled region
  if (
    p.x >= rect.x &&
    p.x <= rect.x + rect.width &&
    p.y >= rect.y &&
    p.y <= rect.y + rect.height
  ) {
    return true;
  }

  // Border segment proximity
  const p1 = { x: rect.x, y: rect.y };
  const p2 = { x: rect.x + rect.width, y: rect.y };
  const p3 = { x: rect.x + rect.width, y: rect.y + rect.height };
  const p4 = { x: rect.x, y: rect.y + rect.height };

  return (
    distanceToSegment(p, p1, p2) <= tolerance ||
    distanceToSegment(p, p2, p3) <= tolerance ||
    distanceToSegment(p, p3, p4) <= tolerance ||
    distanceToSegment(p, p4, p1) <= tolerance
  );
}

/**
 * Tests if point P hits a circle shape (either inside fill or on radius boundary).
 */
export function hitTestCircle(
  p: Point,
  circle: { cx: number; cy: number; r: number },
  tolerance: number = 6
): boolean {
  const dist = Math.hypot(p.x - circle.cx, p.y - circle.cy);
  return dist <= circle.r + tolerance;
}

/**
 * Hit tests an array of shapes in reverse order (topmost layer tested first).
 * Returns the highest z-index shape that intersects the point, or null.
 */
export function hitTestShapes(shapes: Shape[], point: Point, tolerance: number = 6): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    switch (shape.type) {
      case "line": {
        const strokeTol = Math.max(tolerance, (shape.strokeWidth ?? 2) / 2 + 4);
        if (hitTestLine(point, shape, strokeTol)) {
          return shape;
        }
        break;
      }
      case "rectangle": {
        const strokeTol = Math.max(tolerance, (shape.strokeWidth ?? 2) / 2 + 4);
        if (hitTestRect(point, shape, strokeTol)) {
          return shape;
        }
        break;
      }
      case "circle": {
        const strokeTol = Math.max(tolerance, (shape.strokeWidth ?? 2) / 2 + 4);
        if (hitTestCircle(point, shape, strokeTol)) {
          return shape;
        }
        break;
      }
    }
  }
  return null;
}
