import { describe, it, expect } from "vitest";
import {
  computePolygonMoments,
  computeCompositeProperties,
} from "../../lib/geometry/metrics/polygonMoments";
import { Point2D } from "../../lib/geometry/topology/types";

describe("Analytical Green's Theorem Metrics & Second Moments of Area", () => {
  it("should calculate exact area, perimeter, and centroid of a rectangle", () => {
    // 200x100 rectangle with bottom-left at (0, 0)
    const vertices: Point2D[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ];

    const metrics = computePolygonMoments(vertices);

    expect(metrics.area).toBeCloseTo(20000, 6);
    expect(metrics.perimeter).toBeCloseTo(600, 6);
    expect(metrics.centroid.x).toBeCloseTo(100, 6);
    expect(metrics.centroid.y).toBeCloseTo(50, 6);

    // Theoretical Ixx about centroid: b * h^3 / 12 = 200 * 100^3 / 12 = 16,666,666.67
    expect(metrics.IxxCentroid).toBeCloseTo(200 * Math.pow(100, 3) / 12, 2);
    // Theoretical Iyy about centroid: h * b^3 / 12 = 100 * 200^3 / 12 = 66,666,666.67
    expect(metrics.IyyCentroid).toBeCloseTo(100 * Math.pow(200, 3) / 12, 2);
  });

  it("should evaluate composite hollow section properties with parallel axis theorem", () => {
    // Outer rectangle 200x100 at (0, 0)
    const outer: Point2D[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ];

    // Concentric rectangular hole 100x50 centered at (100, 50)
    const hole: Point2D[] = [
      { x: 50, y: 25 },
      { x: 150, y: 25 },
      { x: 150, y: 75 },
      { x: 50, y: 75 },
    ];

    const composite = computeCompositeProperties(outer, [hole]);

    // Net area: 20000 - 5000 = 15000
    expect(composite.netArea).toBeCloseTo(15000, 6);
    expect(composite.grossArea).toBeCloseTo(20000, 6);
    expect(composite.voidArea).toBeCloseTo(5000, 6);

    // Centroid remains at (100, 50)
    expect(composite.centroid.x).toBeCloseTo(100, 6);
    expect(composite.centroid.y).toBeCloseTo(50, 6);

    // Ixx_net = 200*100^3/12 - 100*50^3/12 = 16666666.67 - 1041666.67 = 15625000
    expect(composite.IxxNet).toBeCloseTo(15625000, 2);
  });
});
