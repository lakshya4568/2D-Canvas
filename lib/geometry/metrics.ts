import {
  Point,
  Shape,
  LineMetricsResult,
  RectMetricsResult,
  CircleMetricsResult,
  BoundingBox,
} from "./types";

/**
 * Calculates geometric metrics for a 2D line or arrow segment between two points.
 */
export function lineMetrics(p1: Point, p2: Point): LineMetricsResult {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);
  let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angleDeg < 0) {
    angleDeg += 360;
  }

  return {
    length,
    angleDeg,
    midpoint: {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    },
    dx,
    dy,
  };
}

/**
 * Normalizes a rectangle created from any drag direction (p1 -> p2).
 */
export function rectFromDrag(
  p1: Point,
  p2: Point
): { x: number; y: number; width: number; height: number } {
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  const width = Math.abs(p2.x - p1.x);
  const height = Math.abs(p2.y - p1.y);
  return { x, y, width, height };
}

/**
 * Computes derived metrics for a rectangle.
 */
export function rectMetrics(
  x: number,
  y: number,
  width: number,
  height: number
): RectMetricsResult {
  return {
    x,
    y,
    width,
    height,
    area: width * height,
    perimeter: 2 * (width + height),
    center: {
      x: x + width / 2,
      y: y + height / 2,
    },
  };
}

/**
 * Constructs a circle from a fixed center point and a live edge cursor point.
 */
export function circleFromDrag(
  center: Point,
  edge: Point
): { cx: number; cy: number; r: number } {
  const r = Math.hypot(edge.x - center.x, edge.y - center.y);
  return {
    cx: center.x,
    cy: center.y,
    r,
  };
}

/**
 * Constructs an ellipse from a fixed center point and a live corner point.
 */
export function ellipseFromDrag(
  center: Point,
  edge: Point
): { cx: number; cy: number; rx: number; ry: number } {
  const rx = Math.abs(edge.x - center.x);
  const ry = Math.abs(edge.y - center.y);
  return {
    cx: center.x,
    cy: center.y,
    rx: Math.max(1, rx),
    ry: Math.max(1, ry),
  };
}

/**
 * Computes derived metrics for a circle.
 */
export function circleMetrics(
  cx: number,
  cy: number,
  r: number
): CircleMetricsResult {
  return {
    cx,
    cy,
    r,
    diameter: r * 2,
    circumference: 2 * Math.PI * r,
    area: Math.PI * r * r,
  };
}

/**
 * Generates vertex points for a regular polygon (e.g. triangle, pentagon, hexagon).
 */
export function getPolygonPoints(cx: number, cy: number, r: number, sides: number = 3): Point[] {
  const points: Point[] = [];
  const angleStep = (2 * Math.PI) / sides;
  const startAngle = -Math.PI / 2; // Point upwards

  for (let i = 0; i < sides; i++) {
    const angle = startAngle + i * angleStep;
    points.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }
  return points;
}

/**
 * Generates vertex points for a star.
 */
export function getStarPoints(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  points: number = 5
): Point[] {
  const pts: Point[] = [];
  const totalVertices = points * 2;
  const angleStep = Math.PI / points;
  const startAngle = -Math.PI / 2;

  for (let i = 0; i < totalVertices; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = startAngle + i * angleStep;
    pts.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }
  return pts;
}

/**
 * Converts an array of Point objects into an SVG polygon points string format ("x1,y1 x2,y2 ...").
 */
export function pointsToSvgString(points: Point[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

/**
 * Rotates a 2D point around a pivot center point by an angle in degrees.
 */
export function rotatePoint(point: Point, center: Point, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + (dx * cos - dy * sin),
    y: center.y + (dx * sin + dy * cos),
  };
}

/**
 * Gets the centroid/center of any shape.
 */
export function getShapeCenter(shape: Shape): Point {
  switch (shape.type) {
    case "line":
    case "arrow":
      return {
        x: (shape.x1 + shape.x2) / 2,
        y: (shape.y1 + shape.y2) / 2,
      };
    case "rectangle":
      return {
        x: shape.x + shape.width / 2,
        y: shape.y + shape.height / 2,
      };
    case "circle":
    case "ellipse":
    case "polygon":
    case "star":
      return {
        x: shape.cx,
        y: shape.cy,
      };
  }
}

/**
 * Computes the axis-aligned bounding box (AABB) for any single shape.
 * @deprecated UPCE-MASTER-1.0 §86: Bounding-box heuristics in candidate detection
 * and inference are deprecated in favor of real edge-to-edge Level-1 vector predicates
 * on DCEL half-edges/vertices. Reserved for rendering and viewport framing only.
 */
export function computeShapeBounds(shape: Shape): BoundingBox {
  switch (shape.type) {
    case "line":
    case "arrow": {
      const minX = Math.min(shape.x1, shape.x2);
      const maxX = Math.max(shape.x1, shape.x2);
      const minY = Math.min(shape.y1, shape.y2);
      const maxY = Math.max(shape.y1, shape.y2);
      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);
      return {
        minX,
        minY,
        maxX,
        maxY,
        width,
        height,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
      };
    }
    case "rectangle": {
      const minX = shape.x;
      const minY = shape.y;
      const maxX = shape.x + shape.width;
      const maxY = shape.y + shape.height;
      return {
        minX,
        minY,
        maxX,
        maxY,
        width: shape.width,
        height: shape.height,
        centerX: shape.x + shape.width / 2,
        centerY: shape.y + shape.height / 2,
      };
    }
    case "circle": {
      const minX = shape.cx - shape.r;
      const maxX = shape.cx + shape.r;
      const minY = shape.cy - shape.r;
      const maxY = shape.cy + shape.r;
      return {
        minX,
        minY,
        maxX,
        maxY,
        width: shape.r * 2,
        height: shape.r * 2,
        centerX: shape.cx,
        centerY: shape.cy,
      };
    }
    case "ellipse": {
      const minX = shape.cx - shape.rx;
      const maxX = shape.cx + shape.rx;
      const minY = shape.cy - shape.ry;
      const maxY = shape.cy + shape.ry;
      return {
        minX,
        minY,
        maxX,
        maxY,
        width: shape.rx * 2,
        height: shape.ry * 2,
        centerX: shape.cx,
        centerY: shape.cy,
      };
    }
    case "polygon": {
      const minX = shape.cx - shape.r;
      const maxX = shape.cx + shape.r;
      const minY = shape.cy - shape.r;
      const maxY = shape.cy + shape.r;
      return {
        minX,
        minY,
        maxX,
        maxY,
        width: shape.r * 2,
        height: shape.r * 2,
        centerX: shape.cx,
        centerY: shape.cy,
      };
    }
    case "star": {
      const minX = shape.cx - shape.outerR;
      const maxX = shape.cx + shape.outerR;
      const minY = shape.cy - shape.outerR;
      const maxY = shape.cy + shape.outerR;
      return {
        minX,
        minY,
        maxX,
        maxY,
        width: shape.outerR * 2,
        height: shape.outerR * 2,
        centerX: shape.cx,
        centerY: shape.cy,
      };
    }
  }
}

/**
 * Computes the collective bounding box enclosing multiple shapes (or a group).
 */
export function computeMultiShapeBounds(shapes: Shape[]): BoundingBox | null {
  if (shapes.length === 0) return null;
  if (shapes.length === 1) return computeShapeBounds(shapes[0]);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const s of shapes) {
    const b = computeShapeBounds(s);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/**
 * Formats a float numeric value cleanly to 1 or 2 decimal places.
 */
export function formatDimension(value: number, decimals: number = 1, unit: string = "px"): string {
  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(decimals);
  return unit ? `${rounded} ${unit}` : rounded;
}

export * from "./metrics/arcMetrics";
