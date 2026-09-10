import { describe, it, expect } from "vitest";
import {
  analyzePolygon,
  detectClosedLoops,
  computeCompositeMassProperties,
} from "../lib/parametric/closedGeometry";
import { BUILTIN_TEMPLATES } from "../lib/parametric/templates";
import { Point, Shape } from "../lib/geometry/types";
import { ParametricModel } from "../lib/parametric/model";

describe("Mathematical Closed Shape & Polygon Engine", () => {
  it("calculates exact Shoelace area and centroid for a 3-4-5 right triangle", () => {
    // Right triangle with vertices (0,0), (4,0), (0,3)
    // Analytical area = 0.5 * 4 * 3 = 6
    // Analytical centroid = ( (0+4+0)/3, (0+0+3)/3 ) = (1.333, 1.0)
    const vertices: Point[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 0, y: 3 },
    ];

    const analysis = analyzePolygon(vertices);
    expect(analysis.isClosed).toBe(true);
    expect(analysis.area).toBeCloseTo(6, 4);
    expect(analysis.centroid.x).toBeCloseTo(4 / 3, 3);
    expect(analysis.centroid.y).toBeCloseTo(1, 3);
    expect(analysis.perimeter).toBeCloseTo(12, 3); // 4 + 3 + 5
    expect(analysis.isCounterClockwise).toBe(true); // CCW orientation
  });

  it("calculates exact area and centroid for a rectangle", () => {
    // 200 x 100 rectangle starting at (50, 50)
    const vertices: Point[] = [
      { x: 50, y: 50 },
      { x: 250, y: 50 },
      { x: 250, y: 150 },
      { x: 50, y: 150 },
    ];

    const analysis = analyzePolygon(vertices);
    expect(analysis.area).toBe(20000);
    expect(analysis.perimeter).toBe(600);
    expect(analysis.centroid).toEqual({ x: 150, y: 100 });
    expect(analysis.boundingBox).toEqual({
      minX: 50,
      minY: 50,
      maxX: 250,
      maxY: 150,
      width: 200,
      height: 100,
    });
    // Sum of interior angles for quadrilateral is (4 - 2) * 180 = 360 deg
    const sumInterior = analysis.vertexMetrics.reduce((sum, v) => sum + v.interiorAngleDeg, 0);
    expect(sumInterior).toBeCloseTo(360, 1);
  });

  it("calculates exact area and centroid for an irregular concave L-shaped polygon", () => {
    // L-shape:
    // (0, 0) -> (100, 0) -> (100, 40) -> (40, 40) -> (40, 100) -> (0, 100)
    // Area = (100 * 40) + (40 * 60) = 4000 + 2400 = 6400
    const vertices: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
      { x: 40, y: 40 },
      { x: 40, y: 100 },
      { x: 0, y: 100 },
    ];

    const analysis = analyzePolygon(vertices);
    expect(analysis.area).toBe(6400);
    expect(analysis.vertexCount).toBe(6);

    // Sum of interior angles for hexagon = (6 - 2) * 180 = 720 deg
    const sumInterior = analysis.vertexMetrics.reduce((sum, v) => sum + v.interiorAngleDeg, 0);
    expect(sumInterior).toBeCloseTo(720, 1);
  });

  it("analyzes the 8-sided chamfered polygon from the user's sketch", () => {
    const tmpl = BUILTIN_TEMPLATES.find((t) => t.id === "chamfered_octagonal_polygon")!;
    expect(tmpl).toBeDefined();

    const instance = tmpl.generator({
      top_edge_length: 177,
      tr_chamfer_length: 38,
      right_edge_length: 92,
      br_chamfer_length: 38,
      bottom_edge_length: 176,
      bl_chamfer_length: 46,
      left_edge_length: 79,
      tl_chamfer_length: 44,
    });

    expect(instance.shapes.length).toBe(8);

    // Automatically detect closed loop from the 8 line segments
    const loops = detectClosedLoops(instance.shapes);
    expect(loops.length).toBe(1);

    const loop = loops[0];
    expect(loop.isClosed).toBe(true);
    expect(loop.vertices.length).toBe(8);

    const a = loop.analysis;
    const expectedPerimeter = instance.shapes.reduce(
      (sum, s: any) => sum + Math.hypot(s.x2 - s.x1, s.y2 - s.y1),
      0
    );
    expect(a.perimeter).toBeCloseTo(expectedPerimeter, 1);

    // Octagon interior angles sum to (8 - 2) * 180 = 1080 deg
    const sumAngles = a.vertexMetrics.reduce((sum, v) => sum + v.interiorAngleDeg, 0);
    expect(sumAngles).toBeCloseTo(1080, 1);

    // Centroid lies strictly within the bounding box
    expect(a.centroid.x).toBeGreaterThan(a.boundingBox.minX);
    expect(a.centroid.x).toBeLessThan(a.boundingBox.maxX);
    expect(a.centroid.y).toBeGreaterThan(a.boundingBox.minY);
    expect(a.centroid.y).toBeLessThan(a.boundingBox.maxY);
  });

  it("computes composite mass properties with density weighting", () => {
    const rect1 = analyzePolygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]); // Area = 100, Centroid = (5, 5)

    const rect2 = analyzePolygon([
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
    ]); // Area = 100, Centroid = (15, 5)

    // Equal density
    const comp1 = computeCompositeMassProperties([
      { analysis: rect1, density: 1 },
      { analysis: rect2, density: 1 },
    ]);
    expect(comp1.totalArea).toBe(200);
    expect(comp1.compositeCentroid).toEqual({ x: 10, y: 5 });
    expect(comp1.compositeCenterOfMass).toEqual({ x: 10, y: 5 });

    // Higher density on rect2 (density = 3): center of mass shifts right towards (15, 5)
    const comp2 = computeCompositeMassProperties([
      { analysis: rect1, density: 1 }, // mass = 100
      { analysis: rect2, density: 3 }, // mass = 300
    ]);
    // Weighted X: (100 * 5 + 300 * 15) / 400 = (500 + 4500) / 400 = 5000 / 400 = 12.5
    expect(comp2.compositeCenterOfMass.x).toBeCloseTo(12.5, 3);
    expect(comp2.compositeCenterOfMass.y).toBeCloseTo(5, 3);
  });

  it("lengthens one triangle side and PRESERVES the other two (§8, §29.4)", () => {
    // 3 lines forming a right-angled 3-4-5 triangle:
    // L1 (base): (0, 0) -> (300, 0) [length 300]
    // L2 (height): (300, 0) -> (300, 400) [length 400]
    // L3 (hypotenuse): (300, 400) -> (0, 0) [length 500]
    //
    // BEHAVIOUR CHANGE (2026-09-10, DEC-062): this test previously asserted that
    // driving L1 to 450 SCALED L2 to 600 and L3 to 750 — a conformal similarity
    // factor of 1.5 applied to the whole figure. §8 rejects that outright:
    //
    //   "The instinctive implementation of 'make it bigger' is a conformal scale
    //    factor k = L_target / L_original applied to all coordinates. For
    //    engineering geometry this is provably wrong."
    //
    // §29.4 requires the MINIMUM-norm update instead: "geometry not mechanically
    // coupled to the edited dimension does not move." So L2 and L3 keep their
    // lengths and the triangle re-closes around the longer base. 450/400/500 is
    // a perfectly valid triangle, and it is the one a real CAD kernel returns.
    const l1: Shape = { id: "t1", name: "L1", type: "line", x1: 0, y1: 0, x2: 300, y2: 0 };
    const l2: Shape = { id: "t2", name: "L2", type: "line", x1: 300, y1: 0, x2: 300, y2: 400 };
    const l3: Shape = { id: "t3", name: "L3", type: "line", x1: 300, y1: 400, x2: 0, y2: 0 };

    const model = new ParametricModel();
    model.setVariable("L1", 300);
    model.setVariable("L2", 400);
    model.setVariable("L3", 500);

    model.setVariable("L1", 450);

    const { updatedShapes } = model.syncModel([l1, l2, l3]);

    const s1 = updatedShapes.find((s) => s.name === "L1") as any;
    const s2 = updatedShapes.find((s) => s.name === "L2") as any;
    const s3 = updatedShapes.find((s) => s.name === "L3") as any;

    // The driven dimension is honoured exactly.
    expect(Math.hypot(s1.x2 - s1.x1, s1.y2 - s1.y1)).toBeCloseTo(450, 3);

    // The undriven dimensions are PRESERVED. This is the whole point: a span
    // change must not drag unrelated members along with it.
    expect(Math.hypot(s2.x2 - s2.x1, s2.y2 - s2.y1)).toBeCloseTo(400, 3);
    expect(Math.hypot(s3.x2 - s3.x1, s3.y2 - s3.y1)).toBeCloseTo(500, 3);

    // Measured values are reported back, unrounded.
    expect(model.variables.get("L2")?.value).toBeCloseTo(400, 3);
    expect(model.variables.get("L3")?.value).toBeCloseTo(500, 3);

    // The loop stays closed — joints are shared vertices, not nearby coordinates.
    expect(s1.x2).toBeCloseTo(s2.x1, 6);
    expect(s1.y2).toBeCloseTo(s2.y1, 6);
    expect(s2.x2).toBeCloseTo(s3.x1, 6);
    expect(s2.y2).toBeCloseTo(s3.y1, 6);
    expect(s3.x2).toBeCloseTo(s1.x1, 6);
    expect(s3.y2).toBeCloseTo(s1.y1, 6);

    // And there is no global scale factor: the figure did not grow by 1.5x.
    const perimeter =
      Math.hypot(s1.x2 - s1.x1, s1.y2 - s1.y1) +
      Math.hypot(s2.x2 - s2.x1, s2.y2 - s2.y1) +
      Math.hypot(s3.x2 - s3.x1, s3.y2 - s3.y1);
    expect(perimeter).toBeCloseTo(450 + 400 + 500, 3);
    expect(perimeter).not.toBeCloseTo(1.5 * (300 + 400 + 500), 1);
  });

  it("enforces 100% joint closure and self-correction for user-drawn 8-line polygon with custom dimensions", () => {
    // 8 lines forming the chamfered polygon from the user's screenshot:
    // L1: 124, L2: 30, L3: 66, L4: 30, L5: 124, L6: 30, L7: 24, L8: 64
    const l1: Shape = { id: "l1", name: "L1", type: "line", x1: 208, y1: 126, x2: 332, y2: 126 };
    const l2: Shape = { id: "l2", name: "L2", type: "line", x1: 332, y1: 126, x2: 353, y2: 147 };
    const l3: Shape = { id: "l3", name: "L3", type: "line", x1: 353, y1: 147, x2: 353, y2: 213 };
    const l4: Shape = { id: "l4", name: "L4", type: "line", x1: 353, y1: 213, x2: 332, y2: 234 };
    const l5: Shape = { id: "l5", name: "L5", type: "line", x1: 332, y1: 234, x2: 208, y2: 234 };
    const l6: Shape = { id: "l6", name: "L6", type: "line", x1: 208, y1: 234, x2: 187, y2: 213 };
    const l8: Shape = { id: "l8", name: "L8", type: "line", x1: 187, y1: 213, x2: 187, y2: 147 };
    const l7: Shape = { id: "l7", name: "L7", type: "line", x1: 187, y1: 147, x2: 208, y2: 126 };

    const model = new ParametricModel();
    model.setVariable("L1", 124);
    model.setVariable("L2", 30);
    model.setVariable("L3", 66);
    model.setVariable("L4", 30);
    model.setVariable("L5", 124);
    model.setVariable("L6", 30);
    model.setVariable("L7", 24); // Chamfer changed to 24
    model.setVariable("L8", 64);

    const { updatedShapes } = model.syncModel([l1, l2, l3, l4, l5, l6, l8, l7]);

    // Verify all 8 joints are STRICTLY coincident: no line gets out!
    for (let i = 0; i < updatedShapes.length; i++) {
      const curr = updatedShapes[i] as any;
      const next = updatedShapes[(i + 1) % updatedShapes.length] as any;
      const jointGap = Math.hypot(curr.x2 - next.x1, curr.y2 - next.y1);
      expect(jointGap).toBeLessThan(0.01);
    }
  });

  it("drives one leg of a right triangle and holds the other members (§29.4)", () => {
    // BEHAVIOUR CHANGE (DEC-062): previously asserted proportional scaling of
    // the whole triangle. Now the driven leg changes and the others hold.
    const l1: Shape = { id: "r1", name: "L1", type: "line", x1: 100, y1: 400, x2: 340, y2: 400 };
    const l2: Shape = { id: "r2", name: "L2", type: "line", x1: 100, y1: 400, x2: 100, y2: 200 };
    const l3: Shape = { id: "r3", name: "L3", type: "line", x1: 100, y1: 200, x2: 340, y2: 400 };

    const model = new ParametricModel();
    model.setVariable("L1", 240);
    model.setVariable("L2", 200);
    model.setVariable("L3", 312);

    model.setVariable("L1", 300);

    const { updatedShapes } = model.syncModel([l1, l2, l3]);
    const s1 = updatedShapes.find((s) => s.name === "L1") as any;
    const s2 = updatedShapes.find((s) => s.name === "L2") as any;
    const s3 = updatedShapes.find((s) => s.name === "L3") as any;

    expect(Math.hypot(s1.x2 - s1.x1, s1.y2 - s1.y1)).toBeCloseTo(300, 3);
    // Undriven members hold their declared lengths.
    expect(Math.hypot(s2.x2 - s2.x1, s2.y2 - s2.y1)).toBeCloseTo(200, 3);
    // The fixture DECLARES L3 = 312, but the drawn hypotenuse actually measures
    // hypot(240, 200) = 312.41. The 0.41 mm difference is inside ε_geometry, so
    // it is a rounded label rather than a driving edit — and the solver correctly
    // holds the real measured length instead of snapping to the rounded one.
    expect(Math.hypot(s3.x2 - s3.x1, s3.y2 - s3.y1)).toBeCloseTo(Math.hypot(240, 200), 3);

    // §18 anchor rule: the driven edge's start vertex is the anchor and does not
    // move, so the edit grows away from the joint the user did not touch.
    expect(s1.x1).toBeCloseTo(100, 6);
    expect(s1.y1).toBeCloseTo(400, 6);

    // Joints stay welded.
    expect(Math.hypot(s1.x1 - s2.x1, s1.y1 - s2.y1)).toBeLessThan(1e-6);
    expect(Math.hypot(s2.x2 - s3.x1, s2.y2 - s3.y1)).toBeLessThan(1e-6);
    expect(Math.hypot(s3.x2 - s1.x2, s3.y2 - s1.y2)).toBeLessThan(1e-6);
  });

  it("shortens a diagonal brace and racks the frame instead of shrinking it (§8)", () => {
    // The user's rectangle with a diagonal brace:
    // L1 top (262), L2 left (146), L4 bottom (262), L3 right (147), L5 diagonal (300)
    //
    // BEHAVIOUR CHANGE (DEC-062): this test previously asserted that driving the
    // diagonal 300 -> 150 halved every member ("Horizontal edges scaled to ~131",
    // "Vertical edges scaled to ~73"). That is conformal scaling, which §8
    // prohibits. The correct answer holds all four member lengths and lets the
    // frame RACK into a parallelogram — which is what physically happens when
    // you shorten a brace in a pin-jointed frame, and what a real CAD returns.
    const l1: Shape = { id: "l1", name: "L1", type: "line", x1: 375, y1: 142, x2: 637, y2: 142 };
    const l2: Shape = { id: "l2", name: "L2", type: "line", x1: 375, y1: 142, x2: 375, y2: 288 };
    const l4: Shape = { id: "l4", name: "L4", type: "line", x1: 375, y1: 288, x2: 637, y2: 288 };
    const l3: Shape = { id: "l3", name: "L3", type: "line", x1: 637, y1: 288, x2: 637, y2: 142 };
    const l5: Shape = { id: "l5", name: "L5", type: "line", x1: 375, y1: 288, x2: 637, y2: 142 };

    const model = new ParametricModel();
    model.setVariable("L1", 262);
    model.setVariable("L2", 146);
    model.setVariable("L4", 262);
    model.setVariable("L3", 147);
    model.setVariable("L5", 300);

    model.setVariable("L5", 150);

    const { updatedShapes } = model.syncModel([l1, l2, l4, l3, l5]);

    const s1 = updatedShapes.find((s) => s.name === "L1") as any;
    const s2 = updatedShapes.find((s) => s.name === "L2") as any;
    const s4 = updatedShapes.find((s) => s.name === "L4") as any;
    const s3 = updatedShapes.find((s) => s.name === "L3") as any;
    const s5 = updatedShapes.find((s) => s.name === "L5") as any;

    // The driven brace is honoured exactly.
    expect(Math.hypot(s5.x2 - s5.x1, s5.y2 - s5.y1)).toBeCloseTo(150, 3);

    // Every member length is PRESERVED — no member was scaled.
    expect(Math.hypot(s1.x2 - s1.x1, s1.y2 - s1.y1)).toBeCloseTo(262, 3);
    expect(Math.hypot(s4.x2 - s4.x1, s4.y2 - s4.y1)).toBeCloseTo(262, 3);
    expect(Math.hypot(s2.x2 - s2.x1, s2.y2 - s2.y1)).toBeCloseTo(146, 3);
    expect(Math.hypot(s3.x2 - s3.x1, s3.y2 - s3.y1)).toBeCloseTo(147, 3);

    // Explicitly NOT the old scaled answer.
    expect(Math.hypot(s1.x2 - s1.x1, s1.y2 - s1.y1)).not.toBeCloseTo(131, 0);
    expect(Math.hypot(s2.x2 - s2.x1, s2.y2 - s2.y1)).not.toBeCloseTo(73, 0);

    // All joints STRICTLY coincident: 0 gap.
    expect(Math.hypot(s1.x1 - s2.x1, s1.y1 - s2.y1)).toBeLessThan(1e-6);
    expect(Math.hypot(s2.x2 - s5.x1, s2.y2 - s5.y1)).toBeLessThan(1e-6);
    expect(Math.hypot(s4.x1 - s5.x1, s4.y1 - s5.y1)).toBeLessThan(1e-6);
    expect(Math.hypot(s1.x2 - s5.x2, s1.y2 - s5.y2)).toBeLessThan(1e-6);
    expect(Math.hypot(s3.x2 - s5.x2, s3.y2 - s5.y2)).toBeLessThan(1e-6);
    expect(Math.hypot(s4.x2 - s3.x1, s4.y2 - s3.y1)).toBeLessThan(1e-6);
  });
});
