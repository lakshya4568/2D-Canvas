import { Point, Shape, SnapResult, SnapCategory } from "./types";
import { getShapeCenter, rotatePoint, getPolygonPoints, getStarPoints } from "./metrics";

export interface KeySnapPoint {
  point: Point;
  category: SnapCategory;
  shapeId: string;
}

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
 * Extracts key geometric vertices (endpoints, corners, midpoints, centers, quadrants)
 * for any shape, fully rotated by the shape's rotation angle.
 */
export function getShapeKeySnapPoints(shape: Shape): KeySnapPoint[] {
  if (shape.isVisible === false) return [];

  const center = getShapeCenter(shape);
  const rotation = shape.rotation || 0;

  const rawPoints: { pt: Point; category: SnapCategory }[] = [];

  switch (shape.type) {
    case "line":
    case "arrow": {
      rawPoints.push(
        { pt: { x: shape.x1, y: shape.y1 }, category: "endpoint" },
        { pt: { x: shape.x2, y: shape.y2 }, category: "endpoint" },
        { pt: { x: (shape.x1 + shape.x2) / 2, y: (shape.y1 + shape.y2) / 2 }, category: "midpoint" }
      );
      break;
    }
    case "rectangle": {
      const { x, y, width: w, height: h } = shape;
      rawPoints.push(
        { pt: { x, y }, category: "corner" },
        { pt: { x: x + w, y }, category: "corner" },
        { pt: { x: x + w, y: y + h }, category: "corner" },
        { pt: { x, y: y + h }, category: "corner" },
        { pt: { x: x + w / 2, y: y + h / 2 }, category: "center" },
        { pt: { x: x + w / 2, y }, category: "midpoint" },
        { pt: { x: x + w, y: y + h / 2 }, category: "midpoint" },
        { pt: { x: x + w / 2, y: y + h }, category: "midpoint" },
        { pt: { x, y: y + h / 2 }, category: "midpoint" }
      );
      break;
    }
    case "circle": {
      const { cx, cy, r } = shape;
      rawPoints.push(
        { pt: { x: cx, y: cy }, category: "center" },
        { pt: { x: cx + r, y: cy }, category: "quadrant" },
        { pt: { x: cx - r, y: cy }, category: "quadrant" },
        { pt: { x: cx, y: cy + r }, category: "quadrant" },
        { pt: { x: cx, y: cy - r }, category: "quadrant" }
      );
      break;
    }
    case "ellipse": {
      const { cx, cy, rx, ry } = shape;
      rawPoints.push(
        { pt: { x: cx, y: cy }, category: "center" },
        { pt: { x: cx + rx, y: cy }, category: "quadrant" },
        { pt: { x: cx - rx, y: cy }, category: "quadrant" },
        { pt: { x: cx, y: cy + ry }, category: "quadrant" },
        { pt: { x: cx, y: cy - ry }, category: "quadrant" }
      );
      break;
    }
    case "polygon": {
      const { cx, cy, r, sides } = shape;
      rawPoints.push({ pt: { x: cx, y: cy }, category: "center" });
      const vertices = getPolygonPoints(cx, cy, r, sides);
      vertices.forEach((v) => rawPoints.push({ pt: v, category: "corner" }));
      // Midpoints between adjacent polygon vertices
      for (let i = 0; i < vertices.length; i++) {
        const next = vertices[(i + 1) % vertices.length];
        rawPoints.push({
          pt: { x: (vertices[i].x + next.x) / 2, y: (vertices[i].y + next.y) / 2 },
          category: "midpoint",
        });
      }
      break;
    }
    case "star": {
      const { cx, cy, innerR, outerR, points } = shape;
      rawPoints.push({ pt: { x: cx, y: cy }, category: "center" });
      const starPts = getStarPoints(cx, cy, innerR, outerR, points);
      starPts.forEach((v) => rawPoints.push({ pt: v, category: "corner" }));
      break;
    }
  }

  // Apply rotation around centroid
  return rawPoints.map((item) => {
    const finalPt = rotation !== 0 ? rotatePoint(item.pt, center, rotation) : item.pt;
    return {
      point: finalPt,
      category: item.category,
      shapeId: shape.id,
    };
  });
}

/**
 * Legacy compatibility helper for unit tests
 */
export function getShapeKeyVertices(shape: Shape): Point[] {
  return getShapeKeySnapPoints(shape).map((s) => s.point);
}

/**
 * Evaluates snapping for a raw cursor point against other shapes, perpendicular angles, and the grid.
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
    startPoint?: Point | null; // For perpendicular / orthogonal line snapping
  }
): SnapResult {
  const {
    gridSnapEnabled,
    objectSnapEnabled,
    gridStep = 20,
    shapes = [],
    excludeId = null,
    vertexThresholdPx = 14,
    zoomScale = 1,
    startPoint = null,
  } = options;

  const worldThreshold = vertexThresholdPx / Math.max(0.01, zoomScale);

  // 1. Vertex / Object Connection Snapping (Highest Priority)
  if (objectSnapEnabled && shapes.length > 0) {
    let closestSnap: KeySnapPoint | null = null;
    let minDistance = worldThreshold;

    for (const shape of shapes) {
      if (excludeId && shape.id === excludeId) continue;
      const snapPoints = getShapeKeySnapPoints(shape);

      for (const sp of snapPoints) {
        const dist = Math.hypot(rawPoint.x - sp.point.x, rawPoint.y - sp.point.y);
        if (dist <= minDistance) {
          minDistance = dist;
          closestSnap = sp;
        }
      }
    }

    if (closestSnap) {
      const guideLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
      if (startPoint) {
        guideLines.push({
          x1: startPoint.x,
          y1: startPoint.y,
          x2: closestSnap.point.x,
          y2: closestSnap.point.y,
        });
      }

      return {
        point: { x: closestSnap.point.x, y: closestSnap.point.y },
        snapped: true,
        snapType: "vertex",
        category: closestSnap.category,
        targetPoint: closestSnap.point,
        guideLines,
      };
    }
  }

  // 2. Perpendicular / Orthogonal Alignment Snapping (When drawing from startPoint)
  if (startPoint) {
    const dx = Math.abs(rawPoint.x - startPoint.x);
    const dy = Math.abs(rawPoint.y - startPoint.y);

    // Horizontal lock (dy near 0)
    if (dy <= worldThreshold) {
      return {
        point: { x: rawPoint.x, y: startPoint.y },
        snapped: true,
        snapType: "vertex",
        category: "perpendicular",
        targetPoint: { x: rawPoint.x, y: startPoint.y },
        guideLines: [{ x1: startPoint.x - 2000, y1: startPoint.y, x2: startPoint.x + 2000, y2: startPoint.y }],
      };
    }

    // Vertical lock (dx near 0)
    if (dx <= worldThreshold) {
      return {
        point: { x: startPoint.x, y: rawPoint.y },
        snapped: true,
        snapType: "vertex",
        category: "perpendicular",
        targetPoint: { x: startPoint.x, y: rawPoint.y },
        guideLines: [{ x1: startPoint.x, y1: startPoint.y - 2000, x2: startPoint.x, y2: startPoint.y + 2000 }],
      };
    }

    // 45-degree diagonal lock
    if (Math.abs(dx - dy) <= worldThreshold) {
      const avg = (dx + dy) / 2;
      const snapX = startPoint.x + (rawPoint.x >= startPoint.x ? avg : -avg);
      const snapY = startPoint.y + (rawPoint.y >= startPoint.y ? avg : -avg);
      return {
        point: { x: snapX, y: snapY },
        snapped: true,
        snapType: "vertex",
        category: "perpendicular",
        targetPoint: { x: snapX, y: snapY },
      };
    }
  }

  // 3. Grid Snapping
  if (gridSnapEnabled && gridStep > 0) {
    const snapped = snapToGrid(rawPoint, gridStep);
    return {
      point: snapped,
      snapped: true,
      snapType: "grid",
      category: "grid",
      targetPoint: snapped,
    };
  }

  // 4. No Snap
  return {
    point: rawPoint,
    snapped: false,
    snapType: null,
  };
}
