import { Point, Shape, SnapResult } from "./types";

/**
 * Snaps a 2D point to the nearest grid intersection.
 */
export function snapToGrid(point: Point, step: number = 20): Point {
  if (step <= 0) return point;
  return {
    x: Math.round(point.x / step) * step,
    y: Math.round(point.y / step) * step,
  };
}

/**
 * Extracts key geometric vertices (endpoints, corners, midpoints, centers) for a shape.
 */
export function getShapeKeyVertices(shape: Shape): Point[] {
  switch (shape.type) {
    case "line": {
      return [
        { x: shape.x1, y: shape.y1 },
        { x: shape.x2, y: shape.y2 },
        { x: (shape.x1 + shape.x2) / 2, y: (shape.y1 + shape.y2) / 2 },
      ];
    }
    case "rectangle": {
      const { x, y, width: w, height: h } = shape;
      return [
        { x, y }, // Top-left
        { x: x + w, y }, // Top-right
        { x: x + w, y: y + h }, // Bottom-right
        { x, y: y + h }, // Bottom-left
        { x: x + w / 2, y: y + h / 2 }, // Center
        { x: x + w / 2, y }, // Top-mid
        { x: x + w, y: y + h / 2 }, // Right-mid
        { x: x + w / 2, y: y + h }, // Bottom-mid
        { x, y: y + h / 2 }, // Left-mid
      ];
    }
    case "circle": {
      const { cx, cy, r } = shape;
      return [
        { x: cx, y: cy }, // Center
        { x: cx + r, y: cy }, // East
        { x: cx - r, y: cy }, // West
        { x: cx, y: cy + r }, // South
        { x: cx, y: cy - r }, // North
      ];
    }
  }
}

/**
 * Evaluates snapping for a raw cursor point against other shapes and/or the background grid.
 */
export function applySnapping(
  rawPoint: Point,
  options: {
    gridSnapEnabled: boolean;
    objectSnapEnabled: boolean;
    gridStep?: number;
    shapes?: Shape[];
    excludeId?: string | null;
    vertexThresholdPx?: number;
    zoomScale?: number;
  }
): SnapResult {
  const {
    gridSnapEnabled,
    objectSnapEnabled,
    gridStep = 20,
    shapes = [],
    excludeId = null,
    vertexThresholdPx = 8,
    zoomScale = 1,
  } = options;

  // 1. Check Vertex / Object Snapping first (higher priority for precise CAD-like snapping)
  if (objectSnapEnabled && shapes.length > 0) {
    const worldThreshold = vertexThresholdPx / Math.max(0.01, zoomScale);
    let closestVertex: Point | null = null;
    let minDistance = worldThreshold;

    for (const shape of shapes) {
      if (excludeId && shape.id === excludeId) continue;
      const vertices = getShapeKeyVertices(shape);
      for (const vertex of vertices) {
        const dist = Math.hypot(rawPoint.x - vertex.x, rawPoint.y - vertex.y);
        if (dist <= minDistance) {
          minDistance = dist;
          closestVertex = vertex;
        }
      }
    }

    if (closestVertex) {
      return {
        point: { x: closestVertex.x, y: closestVertex.y },
        snapped: true,
        snapType: "vertex",
        targetPoint: closestVertex,
      };
    }
  }

  // 2. Check Grid Snapping
  if (gridSnapEnabled && gridStep > 0) {
    const snapped = snapToGrid(rawPoint, gridStep);
    return {
      point: snapped,
      snapped: true,
      snapType: "grid",
      targetPoint: snapped,
    };
  }

  // 3. No Snap
  return {
    point: rawPoint,
    snapped: false,
    snapType: null,
  };
}
