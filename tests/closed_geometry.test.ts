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

  it("preserves triangle shape and autocalculates other sides when one side changes without formulas", () => {
    // 3 lines forming a right-angled 3-4-5 triangle:
    // L1 (base): (0, 0) -> (300, 0) [length 300]
    // L2 (height): (300, 0) -> (300, 400) [length 400]
    // L3 (hypotenuse): (300, 400) -> (0, 0) [length 500]
    const l1: Shape = { id: "t1", name: "L1", type: "line", x1: 0, y1: 0, x2: 300, y2: 0 };
    const l2: Shape = { id: "t2", name: "L2", type: "line", x1: 300, y1: 0, x2: 300, y2: 400 };
    const l3: Shape = { id: "t3", name: "L3", type: "line", x1: 300, y1: 400, x2: 0, y2: 0 };

    const model = new ParametricModel();
    model.setVariable("L1", 300);
    model.setVariable("L2", 400);
    model.setVariable("L3", 500);

    // Change L1 from 300 to 450 (scale factor = 1.5)
    model.setVariable("L1", 450);

    const { updatedShapes } = model.syncModel([l1, l2, l3]);

    const s1 = updatedShapes.find((s) => s.name === "L1") as any;
    const s2 = updatedShapes.find((s) => s.name === "L2") as any;
    const s3 = updatedShapes.find((s) => s.name === "L3") as any;

    // L1 should be 450
    expect(Math.hypot(s1.x2 - s1.x1, s1.y2 - s1.y1)).toBeCloseTo(450, 1);
    // L2 should autocalculate to 400 * 1.5 = 600
    expect(Math.hypot(s2.x2 - s2.x1, s2.y2 - s2.y1)).toBeCloseTo(600, 1);
    // L3 should autocalculate to 500 * 1.5 = 750
    expect(Math.hypot(s3.x2 - s3.x1, s3.y2 - s3.y1)).toBeCloseTo(750, 1);

    // Check that variable values were autocalculated!
    expect(model.variables.get("L2")?.value).toBe(600);
    expect(model.variables.get("L3")?.value).toBe(750);

    // Closed loop remains fully closed!
    expect(s1.x2).toBeCloseTo(s2.x1, 1);
    expect(s1.y2).toBeCloseTo(s2.y1, 1);
    expect(s2.x2).toBeCloseTo(s3.x1, 1);
    expect(s2.y2).toBeCloseTo(s3.y1, 1);
    expect(s3.x2).toBeCloseTo(s1.x1, 1);
    expect(s3.y2).toBeCloseTo(s1.y1, 1);
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
});
