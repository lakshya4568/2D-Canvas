import { describe, it, expect } from "vitest";
import { evaluateBoundaryLimits } from "../../lib/parametric/boundaryLimits";
import { RectangleShape, PolygonShape } from "../../lib/geometry/types";

describe("Design Boundary & Available Span Limits Engine", () => {
  it("should evaluate rectangular boundary limits and compute remaining span", () => {
    const outerFrame: RectangleShape = {
      id: "outer_frame",
      name: "Outer Frame",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 500,
      height: 300,
    };

    // Case 1: Safe span (current = 300, max = 500, remaining = 200)
    const innerShapeSafe: RectangleShape = {
      id: "inner_safe",
      name: "Inner Safe",
      type: "rectangle",
      x: 200,
      y: 150,
      width: 300,
      height: 150,
    };

    const resSafe = evaluateBoundaryLimits(innerShapeSafe, outerFrame);
    expect(resSafe.state).toBe("Safe");
    expect(resSafe.currentSpan).toBe(300);
    expect(resSafe.maximumSpan).toBe(500);
    expect(resSafe.remainingUnits).toBe(200);

    // Case 2: Approaching limit (current = 450, max = 500, remaining = 50 units)
    const innerShapeApproaching: RectangleShape = {
      id: "inner_appr",
      name: "Inner Approaching",
      type: "rectangle",
      x: 125,
      y: 150,
      width: 450,
      height: 150,
    };

    const resAppr = evaluateBoundaryLimits(innerShapeApproaching, outerFrame);
    expect(resAppr.state).toBe("Approaching Limit");
    expect(resAppr.remainingUnits).toBe(50);
    expect(resAppr.message).toContain("only 50 units remaining");

    // Case 3: At Limit (current = 500, max = 500, remaining = 0 units)
    const innerShapeAtLimit: RectangleShape = {
      id: "inner_limit",
      name: "Inner At Limit",
      type: "rectangle",
      x: 100,
      y: 150,
      width: 500,
      height: 150,
    };

    const resLimit = evaluateBoundaryLimits(innerShapeAtLimit, outerFrame);
    expect(resLimit.state).toBe("At Limit");
    expect(resLimit.remainingUnits).toBe(0);

    // Case 4: Exceeded (current = 550, max = 500, remaining = -50 units)
    const innerShapeExceeded: RectangleShape = {
      id: "inner_exceeded",
      name: "Inner Exceeded",
      type: "rectangle",
      x: 75,
      y: 150,
      width: 550,
      height: 150,
    };

    const resExceeded = evaluateBoundaryLimits(innerShapeExceeded, outerFrame);
    expect(resExceeded.state).toBe("Exceeded");
    expect(resExceeded.remainingUnits).toBe(-50);
    expect(resExceeded.message).toContain("Shape exceeds available span by 50 units");
  });

  it("should evaluate non-rectangular polygon/triangle boundary limits (media_1788433447396.png scenario)", () => {
    // Triangular outer boundary (polygon with 3 sides, apex pointing up)
    const outerTriangle: PolygonShape = {
      id: "outer_triangle",
      name: "Outer Triangular Truss",
      type: "polygon",
      cx: 430,
      cy: 280,
      r: 200,
      sides: 3,
    };

    // Inner rectangle as in screenshot (x: 355, y: 171, w: 150, h: 74)
    const innerRect: RectangleShape = {
      id: "inner_rect",
      name: "R1",
      type: "rectangle",
      x: 355,
      y: 171,
      width: 150,
      height: 74,
    };

    const res = evaluateBoundaryLimits(innerRect, outerTriangle);
    // In the triangular boundary, near the apex at Y = 171, the available span is significantly restricted
    expect(res.state).toBe("Exceeded");
    expect(res.maximumSpan).toBeLessThan(150);
    expect(res.remainingUnits).toBeLessThan(0);
    expect(res.message).toContain("Shape exceeds available span");
  });
});
