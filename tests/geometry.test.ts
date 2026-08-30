import { describe, it, expect } from "vitest";
import {
  lineMetrics,
  rectFromDrag,
  rectMetrics,
  circleFromDrag,
  circleMetrics,
  computeShapeBounds,
  formatDimension,
  rotatePoint,
} from "@/lib/geometry/metrics";
import {
  distanceToSegment,
  hitTestLine,
  hitTestRect,
  hitTestCircle,
  hitTestShapes,
} from "@/lib/geometry/hitTest";
import {
  zoomAtPoint,
  screenToWorldPoint,
  worldToScreenPoint,
} from "@/lib/geometry/transform";
import {
  snapToGrid,
  getShapeKeyVertices,
  applySnapping,
} from "@/lib/geometry/snapping";
import { Shape } from "@/lib/geometry/types";

describe("Geometry Metrics", () => {
  describe("lineMetrics", () => {
    it("computes accurate length, angle, and midpoint for a 3-4-5 right triangle", () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 3, y: 4 };
      const metrics = lineMetrics(p1, p2);

      expect(metrics.length).toBeCloseTo(5);
      expect(metrics.angleDeg).toBeCloseTo(53.13, 1);
      expect(metrics.midpoint).toEqual({ x: 1.5, y: 2 });
      expect(metrics.dx).toBe(3);
      expect(metrics.dy).toBe(4);
    });

    it("handles horizontal and vertical lines properly", () => {
      const horizontal = lineMetrics({ x: 10, y: 20 }, { x: 110, y: 20 });
      expect(horizontal.length).toBe(100);
      expect(horizontal.angleDeg).toBe(0);

      const vertical = lineMetrics({ x: 50, y: 0 }, { x: 50, y: 50 });
      expect(vertical.length).toBe(50);
      expect(vertical.angleDeg).toBe(90);
    });
  });

  describe("rectFromDrag & rectMetrics", () => {
    it("normalizes negative drag directions correctly", () => {
      const p1 = { x: 100, y: 100 };
      const p2 = { x: 40, y: 60 };
      const rect = rectFromDrag(p1, p2);

      expect(rect).toEqual({
        x: 40,
        y: 60,
        width: 60,
        height: 40,
      });
    });

    it("computes accurate area, perimeter, and center", () => {
      const metrics = rectMetrics(10, 20, 100, 50);
      expect(metrics.area).toBe(5000);
      expect(metrics.perimeter).toBe(300);
      expect(metrics.center).toEqual({ x: 60, y: 45 });
    });
  });

  describe("circleFromDrag & circleMetrics", () => {
    it("computes radius using Euclidean distance", () => {
      const center = { x: 10, y: 10 };
      const edge = { x: 16, y: 18 };
      const circle = circleFromDrag(center, edge);

      expect(circle.cx).toBe(10);
      expect(circle.cy).toBe(10);
      expect(circle.r).toBeCloseTo(10); // 6^2 + 8^2 = 100 -> r = 10
    });

    it("calculates diameter, circumference, and area", () => {
      const metrics = circleMetrics(0, 0, 7);
      expect(metrics.diameter).toBe(14);
      expect(metrics.circumference).toBeCloseTo(43.98, 1);
      expect(metrics.area).toBeCloseTo(153.94, 1);
    });
  });

  describe("computeShapeBounds", () => {
    it("computes bounding box for line, rectangle, and circle", () => {
      const line: Shape = { id: "1", type: "line", x1: 10, y1: 50, x2: 90, y2: 20 };
      const lineBounds = computeShapeBounds(line);
      expect(lineBounds.minX).toBe(10);
      expect(lineBounds.maxX).toBe(90);
      expect(lineBounds.minY).toBe(20);
      expect(lineBounds.maxY).toBe(50);
      expect(lineBounds.width).toBe(80);
      expect(lineBounds.height).toBe(30);

      const rect: Shape = { id: "2", type: "rectangle", x: 20, y: 30, width: 40, height: 60 };
      const rectBounds = computeShapeBounds(rect);
      expect(rectBounds.minX).toBe(20);
      expect(rectBounds.maxX).toBe(60);
      expect(rectBounds.minY).toBe(30);
      expect(rectBounds.maxY).toBe(90);

      const circle: Shape = { id: "3", type: "circle", cx: 100, cy: 100, r: 25 };
      const circleBounds = computeShapeBounds(circle);
      expect(circleBounds.minX).toBe(75);
      expect(circleBounds.maxX).toBe(125);
      expect(circleBounds.minY).toBe(75);
      expect(circleBounds.maxY).toBe(125);
    });
  });

  describe("formatDimension", () => {
    it("formats integer and floating point dimensions", () => {
      expect(formatDimension(100)).toBe("100 px");
      expect(formatDimension(100.456, 1)).toBe("100.5 px");
      expect(formatDimension(50.2, 2, "mm")).toBe("50.20 mm");
    });
  });
});

describe("Analytical Hit-Testing", () => {
  it("distanceToSegment calculates clamped perpendicular distance", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };

    // Point directly on segment
    expect(distanceToSegment({ x: 50, y: 0 }, a, b)).toBe(0);

    // Point perpendicular to midpoint (distance 10)
    expect(distanceToSegment({ x: 50, y: 10 }, a, b)).toBe(10);

    // Point past endpoint B
    expect(distanceToSegment({ x: 103, y: 4 }, a, b)).toBe(5); // 3^2 + 4^2 = 5
  });

  it("hitTestLine detects hits within tolerance", () => {
    const line = { x1: 0, y1: 0, x2: 100, y2: 100 };
    expect(hitTestLine({ x: 50, y: 50 }, line, 4)).toBe(true);
    expect(hitTestLine({ x: 50, y: 53 }, line, 4)).toBe(true);
    expect(hitTestLine({ x: 50, y: 60 }, line, 4)).toBe(false);
  });

  it("hitTestRect detects points inside and on border", () => {
    const rect = { x: 50, y: 50, width: 100, height: 80 };
    expect(hitTestRect({ x: 80, y: 80 }, rect)).toBe(true);
    expect(hitTestRect({ x: 50, y: 50 }, rect)).toBe(true);
    expect(hitTestRect({ x: 200, y: 200 }, rect)).toBe(false);
  });

  it("hitTestCircle detects points within radius and tolerance", () => {
    const circle = { cx: 100, cy: 100, r: 50 };
    expect(hitTestCircle({ x: 100, y: 100 }, circle)).toBe(true);
    expect(hitTestCircle({ x: 150, y: 100 }, circle)).toBe(true);
    expect(hitTestCircle({ x: 154, y: 100 }, circle, 5)).toBe(true);
    expect(hitTestCircle({ x: 180, y: 100 }, circle)).toBe(false);
  });

  it("hitTestShapes returns topmost overlapping shape", () => {
    const shapes: Shape[] = [
      { id: "1", type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
      { id: "2", type: "circle", cx: 50, cy: 50, r: 20 },
    ];

    // Click at center (overlaps both, but circle is on top)
    const hit = hitTestShapes(shapes, { x: 50, y: 50 });
    expect(hit?.id).toBe("2");

    // Click in corner (only touches rectangle)
    const hitCorner = hitTestShapes(shapes, { x: 5, y: 5 });
    expect(hitCorner?.id).toBe("1");
  });
});

describe("Transformations & Cursor-Anchored Zoom", () => {
  it("converts between world and screen coordinates seamlessly", () => {
    const viewport = { x: 100, y: 50, scale: 2 };
    const worldPoint = { x: 20, y: 30 };

    const screen = worldToScreenPoint(worldPoint, viewport);
    expect(screen).toEqual({ x: 20 * 2 + 100, y: 30 * 2 + 50 }); // (140, 110)

    const backToWorld = screenToWorldPoint(screen, viewport);
    expect(backToWorld.x).toBeCloseTo(20);
    expect(backToWorld.y).toBeCloseTo(30);
  });

  it("keeps world point under cursor stationary during zoom", () => {
    const initialViewport = { x: 0, y: 0, scale: 1 };
    const screenCursor = { x: 300, y: 200 };

    const worldBefore = screenToWorldPoint(screenCursor, initialViewport);
    const zoomedViewport = zoomAtPoint(initialViewport, screenCursor, 2);

    expect(zoomedViewport.scale).toBe(2);
    const worldAfter = screenToWorldPoint(screenCursor, zoomedViewport);

    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
  });
});

describe("Snapping Mathematics", () => {
  it("snaps points to discrete grid steps", () => {
    expect(snapToGrid({ x: 18, y: 23 }, 20)).toEqual({ x: 20, y: 20 });
    expect(snapToGrid({ x: 32, y: 49 }, 20)).toEqual({ x: 40, y: 40 });
  });

  it("extracts key vertices for shapes", () => {
    const line: Shape = { id: "1", type: "line", x1: 0, y1: 0, x2: 100, y2: 100 };
    const lineVertices = getShapeKeyVertices(line);
    expect(lineVertices).toHaveLength(3); // Start, end, midpoint
  });

  it("prioritizes vertex snapping over grid snapping when close to a vertex", () => {
    const shapes: Shape[] = [
      { id: "1", type: "line", x1: 105, y1: 105, x2: 200, y2: 200 },
    ];

    const result = applySnapping(
      { x: 107, y: 106 },
      {
        gridSnapEnabled: true,
        objectSnapEnabled: true,
        gridStep: 20,
        shapes,
        vertexThresholdPx: 8,
        zoomScale: 1,
      }
    );

    expect(result.snapped).toBe(true);
    expect(result.snapType).toBe("vertex");
    expect(result.point).toEqual({ x: 105, y: 105 });
  });

  describe("rotatePoint", () => {
    it("rotates points accurately around an origin or center", () => {
      const center = { x: 0, y: 0 };
      const p = { x: 10, y: 0 };

      // 90° rotation
      const p90 = rotatePoint(p, center, 90);
      expect(p90.x).toBeCloseTo(0);
      expect(p90.y).toBeCloseTo(10);

      // 180° rotation
      const p180 = rotatePoint(p, center, 180);
      expect(p180.x).toBeCloseTo(-10);
      expect(p180.y).toBeCloseTo(0);
    });
  });
});
