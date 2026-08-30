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
 * Calculates line-line intersection point if two segments intersect.
 */
export function getLineIntersection(
  p1: Point,
  p2: Point,
  p3: Point,
  p4: Point
): Point | null {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-6) return null;

  const u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const v = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;

  if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
    return {
      x: p1.x + u * (p2.x - p1.x),
      y: p1.y + u * (p2.y - p1.y),
    };
  }
  return null;
}

/**
 * Extracts line segment definitions for any shape (for edge snapping and intersections).
 */
export function getShapeSegments(shape: Shape): { p1: Point; p2: Point }[] {
  if (shape.isVisible === false) return [];
  const center = getShapeCenter(shape);
  const rotation = shape.rotation || 0;

  const rawSegments: { p1: Point; p2: Point }[] = [];

  switch (shape.type) {
    case "line":
    case "arrow":
      rawSegments.push({ p1: { x: shape.x1, y: shape.y1 }, p2: { x: shape.x2, y: shape.y2 } });
      break;
    case "rectangle": {
      const { x, y, width: w, height: h } = shape;
      const c1 = { x, y };
      const c2 = { x: x + w, y };
      const c3 = { x: x + w, y: y + h };
      const c4 = { x, y: y + h };
      rawSegments.push(
        { p1: c1, p2: c2 },
        { p1: c2, p2: c3 },
        { p1: c3, p2: c4 },
        { p1: c4, p2: c1 }
      );
      break;
    }
    case "polygon": {
      const vertices = getPolygonPoints(shape.cx, shape.cy, shape.r, shape.sides);
      for (let i = 0; i < vertices.length; i++) {
        rawSegments.push({ p1: vertices[i], p2: vertices[(i + 1) % vertices.length] });
      }
      break;
    }
    case "star": {
      const vertices = getStarPoints(shape.cx, shape.cy, shape.innerR, shape.outerR, shape.points);
      for (let i = 0; i < vertices.length; i++) {
        rawSegments.push({ p1: vertices[i], p2: vertices[(i + 1) % vertices.length] });
      }
      break;
    }
  }

  if (rotation === 0) return rawSegments;

  return rawSegments.map((seg) => ({
    p1: rotatePoint(seg.p1, center, rotation),
    p2: rotatePoint(seg.p2, center, rotation),
  }));
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
      rawPoints.push({ pt: { x: cx, y: cy }, category: "centroid" });
      const vertices = getPolygonPoints(cx, cy, r, sides);
      vertices.forEach((v) => rawPoints.push({ pt: v, category: "corner" }));
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
 * Evaluates snapping for a raw cursor point against other shapes, perpendicular angles, edges, and grid.
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
    startPoint?: Point | null;
  }
): SnapResult {
  const {
    gridSnapEnabled,
    objectSnapEnabled,
    gridStep = 20,
    shapes = [],
    excludeId = null,
    vertexThresholdPx = 20,
    zoomScale = 1,
    startPoint = null,
  } = options;

  const worldThreshold = vertexThresholdPx / Math.max(0.01, zoomScale);

  // 1. Vertex / Corner / Midpoint / Centroid / Quadrant Connection Snapping (Highest Priority)
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

    // 2. Line-Line Intersections
    const allSegments: { p1: Point; p2: Point }[] = [];
    for (const s of shapes) {
      if (!excludeId || s.id !== excludeId) {
        allSegments.push(...getShapeSegments(s));
      }
    }

    for (let i = 0; i < allSegments.length; i++) {
      for (let j = i + 1; j < allSegments.length; j++) {
        const isect = getLineIntersection(
          allSegments[i].p1,
          allSegments[i].p2,
          allSegments[j].p1,
          allSegments[j].p2
        );
        if (isect) {
          const dist = Math.hypot(rawPoint.x - isect.x, rawPoint.y - isect.y);
          if (dist <= worldThreshold) {
            return {
              point: isect,
              snapped: true,
              snapType: "vertex",
              category: "intersection",
              targetPoint: isect,
            };
          }
        }
      }
    }

    // 3. Snap to Edge / Along Line
    let closestEdgePoint: Point | null = null;
    let minEdgeDist = worldThreshold * 0.75;

    for (const seg of allSegments) {
      const vx = seg.p2.x - seg.p1.x;
      const vy = seg.p2.y - seg.p1.y;
      const lenSq = vx * vx + vy * vy;
      if (lenSq > 0) {
        const dot = (rawPoint.x - seg.p1.x) * vx + (rawPoint.y - seg.p1.y) * vy;
        const t = Math.max(0, Math.min(1, dot / lenSq));
        const projX = seg.p1.x + t * vx;
        const projY = seg.p1.y + t * vy;
        const dist = Math.hypot(rawPoint.x - projX, rawPoint.y - projY);
        if (dist <= minEdgeDist) {
          minEdgeDist = dist;
          closestEdgePoint = { x: projX, y: projY };
        }
      }
    }

    if (closestEdgePoint) {
      return {
        point: closestEdgePoint,
        snapped: true,
        snapType: "vertex",
        category: "edge",
        targetPoint: closestEdgePoint,
      };
    }
  }

  // 4. Perpendicular / Orthogonal Alignment Snapping (When drawing from startPoint)
  if (startPoint) {
    const dx = Math.abs(rawPoint.x - startPoint.x);
    const dy = Math.abs(rawPoint.y - startPoint.y);

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

  // 5. Grid Snapping
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

  // 6. No Snap
  return {
    point: rawPoint,
    snapped: false,
    snapType: null,
  };
}
