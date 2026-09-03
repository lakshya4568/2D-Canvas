import { describe, it, expect } from "vitest";
import { DcelPlanarMap } from "../../lib/geometry/topology/dcel";
import { SpatialHashGrid } from "../../lib/geometry/topology/spatialHash";
import { Point2D } from "../../lib/geometry/topology/types";

describe("DCEL Topology & Spatial Vertex Welding", () => {
  it("should weld coincident endpoints within epsilon = 1e-4", () => {
    const grid = new SpatialHashGrid(1e-4);
    const p1: Point2D = { x: 100.0, y: 100.0 };
    const p2: Point2D = { x: 100.00001, y: 99.99999 }; // within 1e-4

    const v1 = grid.insertOrFind(p1, 1e-4);
    const v2 = grid.insertOrFind(p2, 1e-4);

    expect(v1.id).toBe(v2.id);
    expect(grid.size()).toBe(1);
  });

  it("should build a valid DCEL from closed octagon segments and verify Euler characteristic", () => {
    // 8-segment octagon vertices
    const pts: Point2D[] = [
      { x: 30, y: 0 },
      { x: 70, y: 0 },
      { x: 100, y: 30 },
      { x: 100, y: 70 },
      { x: 70, y: 100 },
      { x: 30, y: 100 },
      { x: 0, y: 70 },
      { x: 0, y: 30 },
    ];

    const segments: Array<{ p1: Point2D; p2: Point2D }> = [];
    for (let i = 0; i < pts.length; i++) {
      const nextIdx = (i + 1) % pts.length;
      // Introduce slight 1e-5 noise at shared joints
      segments.push({
        p1: { x: pts[i].x + 0.000005, y: pts[i].y - 0.000005 },
        p2: { x: pts[nextIdx].x - 0.000005, y: pts[nextIdx].y + 0.000005 },
      });
    }

    const map = DcelPlanarMap.buildFromSegments(segments, 1e-4);

    // 8 unique vertices, 8 undirected edges (16 half-edges), 2 faces (1 interior + 1 exterior)
    expect(map.vertices.size).toBe(8);
    expect(map.edges.size).toBe(8);
    expect(map.halfEdges.size).toBe(16);
    expect(map.faces.size).toBe(2);

    // Euler characteristic V - E + F = 8 - 8 + 2 = 2
    expect(map.vertices.size - map.edges.size + map.faces.size).toBe(2);

    // Verify all half-edges have valid twins and next/prev pointers
    for (const he of map.halfEdges.values()) {
      const twin = map.halfEdges.get(he.twin);
      expect(twin).toBeDefined();
      expect(twin?.twin).toBe(he.id);

      const next = map.halfEdges.get(he.next);
      expect(next).toBeDefined();
      expect(next?.prev).toBe(he.id);
    }
  });

  it("should identify outer boundary and nest inner hole loops via ray casting", () => {
    // Outer 200x200 box (CCW)
    const outer: Point2D[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ];

    // Inner 80x80 void at center (100, 100) (CW)
    const inner: Point2D[] = [
      { x: 60, y: 60 },
      { x: 60, y: 140 },
      { x: 140, y: 140 },
      { x: 140, y: 60 },
    ];

    const segments: Array<{ p1: Point2D; p2: Point2D }> = [];
    for (let i = 0; i < outer.length; i++) {
      segments.push({ p1: outer[i], p2: outer[(i + 1) % outer.length] });
    }
    for (let i = 0; i < inner.length; i++) {
      segments.push({ p1: inner[i], p2: inner[(i + 1) % inner.length] });
    }

    const map = DcelPlanarMap.buildFromSegments(segments, 1e-4);

    const interiorFaces = Array.from(map.faces.values()).filter((f) => !f.isExterior);
    // There should be the annular face (solid region between outer and hole)
    // plus the inner hole face
    expect(interiorFaces.length).toBeGreaterThanOrEqual(1);

    const solidFace = interiorFaces.find((f) => f.innerHoles.length > 0);
    expect(solidFace).toBeDefined();
    expect(solidFace?.innerHoles.length).toBe(1);
    expect(solidFace?.area).toBeGreaterThan(0); // Positive CCW outer area
  });
});
