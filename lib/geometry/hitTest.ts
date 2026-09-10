import { Point, Shape } from "./types";
import { rotatePoint, getShapeCenter, getPolygonPoints, getStarPoints } from "./metrics";

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
 * Tests if point P hits a line or arrow shape within a given tolerance.
 */
export function hitTestLine(p: Point, line: { x1: number; y1: number; x2: number; y2: number }, tolerance: number = 6): boolean {
  const dist = distanceToSegment(p, { x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 });
  return dist <= tolerance;
}

export function isShapeFilled(fillColor?: string): boolean {
  if (!fillColor) return false;
  const f = fillColor.trim().toLowerCase();
  return f !== "transparent" && f !== "none" && f !== "rgba(0,0,0,0)" && f !== "rgba(0, 0, 0, 0)";
}

/**
 * Tests if point P hits a rectangle shape (either inside fill or along stroke boundary).
 */
export function hitTestRect(
  p: Point,
  rect: { x: number; y: number; width: number; height: number; fillColor?: string },
  tolerance: number = 6
): boolean {
  const inAABB =
    p.x >= rect.x - tolerance &&
    p.x <= rect.x + rect.width + tolerance &&
    p.y >= rect.y - tolerance &&
    p.y <= rect.y + rect.height + tolerance;

  if (!inAABB) return false;

  // Border segment proximity
  const p1 = { x: rect.x, y: rect.y };
  const p2 = { x: rect.x + rect.width, y: rect.y };
  const p3 = { x: rect.x + rect.width, y: rect.y + rect.height };
  const p4 = { x: rect.x, y: rect.y + rect.height };

  const onBorder =
    distanceToSegment(p, p1, p2) <= tolerance ||
    distanceToSegment(p, p2, p3) <= tolerance ||
    distanceToSegment(p, p3, p4) <= tolerance ||
    distanceToSegment(p, p4, p1) <= tolerance;

  if (onBorder) return true;

  // Transparent / unfilled rectangles in CAD do NOT intercept interior clicks
  if (rect.fillColor !== undefined && !isShapeFilled(rect.fillColor)) {
    return false;
  }

  // Inside filled or bounded region
  return (
    p.x >= rect.x &&
    p.x <= rect.x + rect.width &&
    p.y >= rect.y &&
    p.y <= rect.y + rect.height
  );
}

/**
 * Tests if point P hits a circle shape.
 */
export function hitTestCircle(
  p: Point,
  circle: { cx: number; cy: number; r: number; fillColor?: string },
  tolerance: number = 6
): boolean {
  const dist = Math.hypot(p.x - circle.cx, p.y - circle.cy);
  const onBorder = Math.abs(dist - circle.r) <= tolerance;
  if (onBorder) return true;

  if (circle.fillColor !== undefined && !isShapeFilled(circle.fillColor)) {
    return false;
  }
  return dist <= circle.r + tolerance;
}

/**
 * Tests if point P hits an ellipse shape.
 */
export function hitTestEllipse(
  p: Point,
  ellipse: { cx: number; cy: number; rx: number; ry: number; fillColor?: string },
  tolerance: number = 6
): boolean {
  const dx = p.x - ellipse.cx;
  const dy = p.y - ellipse.cy;
  const normalized = (dx * dx) / ((ellipse.rx + tolerance) * (ellipse.rx + tolerance)) +
                     (dy * dy) / ((ellipse.ry + tolerance) * (ellipse.ry + tolerance));
  return normalized <= 1.05;
}

/**
 * Tests if point P hits a polygon with given vertices.
 */
export function hitTestPolygon(p: Point, vertices: Point[], tolerance: number = 6): boolean {
  // Point-in-polygon ray-casting algorithm
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;

    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;

    if (distanceToSegment(p, vertices[i], vertices[j]) <= tolerance) {
      return true;
    }
  }
  return inside;
}

function hitTestShapeStroke(shape: Shape, localPoint: Point, strokeTol: number): boolean {
  switch (shape.type) {
    case "line":
    case "arrow":
      return hitTestLine(localPoint, shape, strokeTol);
    case "rectangle": {
      const p1 = { x: shape.x, y: shape.y };
      const p2 = { x: shape.x + shape.width, y: shape.y };
      const p3 = { x: shape.x + shape.width, y: shape.y + shape.height };
      const p4 = { x: shape.x, y: shape.y + shape.height };
      return (
        distanceToSegment(localPoint, p1, p2) <= strokeTol ||
        distanceToSegment(localPoint, p2, p3) <= strokeTol ||
        distanceToSegment(localPoint, p3, p4) <= strokeTol ||
        distanceToSegment(localPoint, p4, p1) <= strokeTol
      );
    }
    case "circle": {
      const dist = Math.hypot(localPoint.x - shape.cx, localPoint.y - shape.cy);
      return Math.abs(dist - shape.r) <= strokeTol;
    }
    case "ellipse": {
      const dx = localPoint.x - shape.cx;
      const dy = localPoint.y - shape.cy;
      const norm = (dx * dx) / (shape.rx * shape.rx) + (dy * dy) / (shape.ry * shape.ry);
      return Math.abs(Math.sqrt(norm) - 1) * Math.min(shape.rx, shape.ry) <= strokeTol;
    }
    case "polygon": {
      const pts = getPolygonPoints(shape.cx, shape.cy, shape.r, shape.sides);
      for (let j = 0, k = pts.length - 1; j < pts.length; k = j++) {
        if (distanceToSegment(localPoint, pts[j], pts[k]) <= strokeTol) return true;
      }
      return false;
    }
    case "star": {
      const pts = getStarPoints(shape.cx, shape.cy, shape.innerR, shape.outerR, shape.points);
      for (let j = 0, k = pts.length - 1; j < pts.length; k = j++) {
        if (distanceToSegment(localPoint, pts[j], pts[k]) <= strokeTol) return true;
      }
      return false;
    }
    default:
      return false;
  }
}

function hitTestShapeFill(shape: Shape, localPoint: Point, strokeTol: number): boolean {
  const fill = (shape as { fillColor?: string }).fillColor;
  if (fill === "transparent" || fill === "none" || fill === "rgba(0,0,0,0)" || fill === "rgba(0, 0, 0, 0)") return false;

  switch (shape.type) {
    case "rectangle":
      return hitTestRect(localPoint, shape, strokeTol);
    case "circle":
      return hitTestCircle(localPoint, shape, strokeTol);
    case "ellipse":
      return hitTestEllipse(localPoint, shape, strokeTol);
    case "polygon": {
      const pts = getPolygonPoints(shape.cx, shape.cy, shape.r, shape.sides);
      return hitTestPolygon(localPoint, pts, strokeTol);
    }
    case "star": {
      const pts = getStarPoints(shape.cx, shape.cy, shape.innerR, shape.outerR, shape.points);
      return hitTestPolygon(localPoint, pts, strokeTol);
    }
    default:
      return false;
  }
}

/**
 * Hit tests an array of shapes in reverse order (topmost layer tested first).
 * Prioritizes direct strokes and borders over empty background fills.
 * Supports rotated shapes by inverse-transforming test coordinates.
 * Returns the matching shape or null.
 */
export function hitTestShapes(shapes: Shape[], point: Point, tolerance: number = 8): Shape | null {
  // Pass 1: Prioritize strokes/borders so inner lines and edges can be clicked and selected directly
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    if (shape.isVisible === false) continue;

    let localPoint = point;
    if (shape.rotation && shape.rotation !== 0) {
      const center = getShapeCenter(shape);
      localPoint = rotatePoint(point, center, -shape.rotation);
    }

    const strokeTol = Math.max(tolerance, (shape.strokeWidth ?? 2) / 2 + 6);
    if (hitTestShapeStroke(shape, localPoint, strokeTol)) {
      return shape;
    }
  }

  // Pass 2: If no stroke was hit, test solid fills (skipping transparent/unfilled wireframes)
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    if (shape.isVisible === false) continue;

    let localPoint = point;
    if (shape.rotation && shape.rotation !== 0) {
      const center = getShapeCenter(shape);
      localPoint = rotatePoint(point, center, -shape.rotation);
    }

    const strokeTol = Math.max(tolerance, (shape.strokeWidth ?? 2) / 2 + 6);
    if (hitTestShapeFill(shape, localPoint, strokeTol)) {
      return shape;
    }
  }

  return null;
}
