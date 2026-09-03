import { describe, it, expect } from "vitest";
import {
  computeDerivedProperties,
  evaluateDerivedPropertyExpression,
} from "../../lib/geometry/derivedModel";
import { RectangleShape, LineShape, CircleShape, PolygonShape } from "../../lib/geometry/types";

describe("Unified Derived Geometry Model", () => {
  it("should derive length, angle, midpoint, and normal for line segments", () => {
    const line: LineShape = {
      id: "L1",
      name: "Line 1",
      type: "line",
      x1: 100,
      y1: 100,
      x2: 400,
      y2: 100,
    };

    const derived = computeDerivedProperties(line);
    expect(derived.kind).toBe("line");
    if (derived.kind === "line") {
      expect(derived.props.length).toBe(300);
      expect(derived.props.angleDeg).toBe(0);
      expect(derived.props.midpoint).toEqual({ x: 250, y: 100 });
      expect(derived.props.normal.nx).toBeCloseTo(0, 4);
      expect(derived.props.normal.ny).toBeCloseTo(1, 4);
    }
  });

  it("should derive center, corners, area, and aspect ratio for rectangles", () => {
    const rect: RectangleShape = {
      id: "R1",
      name: "Rect 1",
      type: "rectangle",
      x: 50,
      y: 50,
      width: 200,
      height: 100,
    };

    const derived = computeDerivedProperties(rect);
    expect(derived.kind).toBe("rectangle");
    if (derived.kind === "rectangle") {
      expect(derived.props.area).toBe(20000);
      expect(derived.props.perimeter).toBe(600);
      expect(derived.props.aspectRatio).toBe(2);
      expect(derived.props.center).toEqual({ x: 150, y: 100 });
      expect(derived.props.corners.tl).toEqual({ x: 50, y: 50 });
      expect(derived.props.corners.br).toEqual({ x: 250, y: 150 });
    }
  });

  it("should evaluate functional expressions like length(L1), area(R1), radius(C1)", () => {
    const line: LineShape = { id: "L1", name: "L1", type: "line", x1: 0, y1: 0, x2: 150, y2: 0 };
    const rect: RectangleShape = { id: "R1", name: "R1", type: "rectangle", x: 0, y: 0, width: 80, height: 40 };
    const circle: CircleShape = { id: "C1", name: "C1", type: "circle", cx: 0, cy: 0, r: 25 };

    const shapes = [line, rect, circle];

    expect(evaluateDerivedPropertyExpression("length(L1)", shapes)).toBe(150);
    expect(evaluateDerivedPropertyExpression("area(R1)", shapes)).toBe(3200);
    expect(evaluateDerivedPropertyExpression("radius(C1)", shapes)).toBe(25);
    expect(evaluateDerivedPropertyExpression("diameter(C1)", shapes)).toBe(50);
  });
});
