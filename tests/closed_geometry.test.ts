import { describe, it, expect } from "vitest";
import {
  analyzePolygon,
  detectClosedLoops,
  computeCompositeMassProperties,
} from "../lib/parametric/closedGeometry";
import { BUILTIN_TEMPLATES } from "../lib/parametric/templates";
import { Point, Shape } from "../lib/geometry/types";

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
});
