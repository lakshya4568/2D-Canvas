import {
  Point,
  Shape,
  LineMetricsResult,
  RectMetricsResult,
  CircleMetricsResult,
  BoundingBox,
} from "./types";

/**
 * Calculates geometric metrics for a 2D line segment between two points.
 */
export function lineMetrics(p1: Point, p2: Point): LineMetricsResult {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);
  let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
  // Normalize angle to [0, 360) for clear readout
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
 * Handles negative deltas properly so width and height are always non-negative.
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
 * Computes the axis-aligned bounding box (AABB) for any shape.
 */
export function computeShapeBounds(shape: Shape): BoundingBox {
  switch (shape.type) {
    case "line": {
      const minX = Math.min(shape.x1, shape.x2);
      const maxX = Math.max(shape.x1, shape.x2);
      const minY = Math.min(shape.y1, shape.y2);
      const maxY = Math.max(shape.y1, shape.y2);
      const width = maxX - minX;
      const height = maxY - minY;
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
  }
}

/**
 * Formats a float numeric value cleanly to 1 or 2 decimal places.
 */
export function formatDimension(value: number, decimals: number = 1, unit: string = "px"): string {
  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(decimals);
  return unit ? `${rounded} ${unit}` : rounded;
}
