import { describe, it, expect } from "vitest";
import { DcelPlanarMap, LazyDcelManager } from "../../lib/geometry/topology/dcel";
import { DEFAULT_TOLERANCE_POLICY } from "../../lib/geometry/tolerance";
import { Point2D } from "../../lib/geometry/topology/types";

describe("DCEL Planar Arrangement, Intersection Splitting & Face Persistence (UPCE-MASTER-1.0 §5.1)", () => {
  it("should split intersecting crossing segments and construct valid planar arrangement", () => {
    // Cross / X configuration:
    // Horizontal line: (0, 50) -> (100, 50)
    // Vertical line: (50, 0) -> (50, 100)
    // Crossing at (50, 50)
    const segments = [
      { p1: { x: 0, y: 50 }, p2: { x: 100, y: 50 } },
      { p1: { x: 50, y: 0 }, p2: { x: 50, y: 100 } },
    ];

    const map = DcelPlanarMap.buildFromSegments(segments, {
      policy: DEFAULT_TOLERANCE_POLICY,
    });

    // 5 vertices: 4 endpoints + 1 central intersection vertex at (50, 50)
    expect(map.vertices.size).toBe(5);

    // 4 undirected edges (8 half-edges)
    expect(map.edges.size).toBe(4);
    expect(map.halfEdges.size).toBe(8);

    // Central vertex should have 4 outgoing half-edges (degree 4)
    const centerVertex = Array.from(map.vertices.values()).find(
      (v) => Math.abs(v.point.x - 50) < 1e-4 && Math.abs(v.point.y - 50) < 1e-4
    );
    expect(centerVertex).toBeDefined();

    // Verify Euler characteristic for tree/cross: V - E + F = 5 - 4 + 1 = 2 = 1 + C (C=1)
    expect(map.vertices.size - map.edges.size + map.faces.size).toBe(2);
  });

  it("should split T-junctions where an endpoint lies along another segment", () => {
    // Horizontal line: (0, 0) -> (100, 0)
    // Vertical line starting exactly on the horizontal: (40, 0) -> (40, 60)
    const segments = [
      { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } },
      { p1: { x: 40, y: 0 }, p2: { x: 40, y: 60 } },
    ];

    const map = DcelPlanarMap.buildFromSegments(segments, {
      policy: DEFAULT_TOLERANCE_POLICY,
    });

    // Vertices: (0,0), (100,0), (40,0) [T-junction split], (40,60) = 4 vertices
    expect(map.vertices.size).toBe(4);
    // Edges: (0,0)-(40,0), (40,0)-(100,0), (40,0)-(40,60) = 3 edges
    expect(map.edges.size).toBe(3);
  });

  it("should assign nesting depth: even = solid, odd = interior void", () => {
    // Outer 400x300 rectangle (CCW)
    const outer: Point2D[] = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 },
    ];

    // Inner 200x150 void at center (100, 75) to (300, 225)
    const inner: Point2D[] = [
      { x: 100, y: 75 },
      { x: 300, y: 75 },
      { x: 300, y: 225 },
      { x: 100, y: 225 },
    ];

    const segments = [];
    for (let i = 0; i < outer.length; i++) {
      segments.push({ p1: outer[i], p2: outer[(i + 1) % outer.length], tags: ["OUTER_WALL"] });
    }
    for (let i = 0; i < inner.length; i++) {
      segments.push({ p1: inner[i], p2: inner[(i + 1) % inner.length], tags: ["INTERNAL_VOID"] });
    }

    const map = DcelPlanarMap.buildFromSegments(segments, {
      policy: DEFAULT_TOLERANCE_POLICY,
    });

    const interiorFaces = Array.from(map.faces.values()).filter((f) => !f.isExterior);

    // Annular outer face (solid material): nesting depth 0 (even)
    const solidFace = interiorFaces.find((f) => f.innerHoles.length > 0);
    expect(solidFace).toBeDefined();
    expect(solidFace!.nestingDepth).toBe(0);
    expect(solidFace!.nestingDepth % 2).toBe(0); // Even = solid

    // Inner cavity face: nesting depth 1 (odd = void)
    const voidFace = interiorFaces.find((f) => f.innerHoles.length === 0 && f.nestingDepth > 0);
    expect(voidFace).toBeDefined();
    expect(voidFace!.nestingDepth).toBe(1);
    expect(voidFace!.nestingDepth % 2).toBe(1); // Odd = void
    expect(voidFace!.semanticCategory).toBe("VOID");
  });

  it("should persist face IDs and tags stably across DCEL rebuilds under dimensional changes", () => {
    // Initial rectangle 1000 x 600
    function makeRectSegments(w: number, h: number, tags: string[]) {
      const pts = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ];
      return [
        { p1: pts[0], p2: pts[1], tags },
        { p1: pts[1], p2: pts[2], tags },
        { p1: pts[2], p2: pts[3], tags },
        { p1: pts[3], p2: pts[0], tags },
      ];
    }

    // Build 1: 1000 x 600
    const map1 = DcelPlanarMap.buildFromSegments(
      makeRectSegments(1000, 600, ["BAY_1", "SLAB"]),
      { policy: DEFAULT_TOLERANCE_POLICY }
    );

    const face1 = Array.from(map1.faces.values()).find((f) => !f.isExterior)!;
    expect(face1).toBeDefined();
    const face1Id = face1.id;
    expect(face1.tags).toContain("BAY_1");

    // Build 2: Anisotropic expansion to 1400 x 750 (parameter change)
    const map2 = DcelPlanarMap.buildFromSegments(
      makeRectSegments(1400, 750, ["BAY_1", "SLAB"]),
      {
        policy: DEFAULT_TOLERANCE_POLICY,
        previousFaces: map1.faces,
      }
    );

    const face2 = Array.from(map2.faces.values()).find((f) => !f.isExterior)!;
    expect(face2).toBeDefined();

    // Face ID must be stably preserved across rebuild!
    expect(face2.id).toBe(face1Id);
    // Tags must survive!
    expect(face2.tags).toContain("BAY_1");
    expect(face2.tags).toContain("SLAB");
  });

  it("should lazily rebuild DCEL only when marked dirty", () => {
    const lazy = new LazyDcelManager();
    const segs = [
      { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } },
      { p1: { x: 100, y: 0 }, p2: { x: 100, y: 100 } },
      { p1: { x: 100, y: 100 }, p2: { x: 0, y: 100 } },
      { p1: { x: 0, y: 100 }, p2: { x: 0, y: 0 } },
    ];

    lazy.setSegments(segs);
    expect(lazy.getIsDirty()).toBe(true);

    const mapA = lazy.getDCEL();
    expect(lazy.getIsDirty()).toBe(false);
    expect(lazy.getRebuildCount()).toBe(1);

    // Subsequent access without dirtying returns identical cached instance
    const mapB = lazy.getDCEL();
    expect(mapB).toBe(mapA);
    expect(lazy.getRebuildCount()).toBe(1);

    // Marking dirty triggers rebuild on next call
    lazy.markDirty();
    expect(lazy.getIsDirty()).toBe(true);
    const mapC = lazy.getDCEL();
    expect(lazy.getRebuildCount()).toBe(2);
    expect(mapC).not.toBe(mapA);
  });

  it("should correctly handle adjacent rectangles sharing a dividing wall without multigraph edge duplicates", () => {
    // Cell 1: 500x400 at (0,0)
    // Cell 2: 500x400 at (500,0) sharing dividing wall between (500,0) and (500,400)
    const segsCell1 = [
      { p1: { x: 0, y: 0 }, p2: { x: 500, y: 0 }, tags: ["CELL_1"] },
      { p1: { x: 500, y: 0 }, p2: { x: 500, y: 400 }, tags: ["CELL_1", "DIVIDING_WALL"] },
      { p1: { x: 500, y: 400 }, p2: { x: 0, y: 400 }, tags: ["CELL_1"] },
      { p1: { x: 0, y: 400 }, p2: { x: 0, y: 0 }, tags: ["CELL_1"] },
    ];

    const segsCell2 = [
      { p1: { x: 500, y: 0 }, p2: { x: 1000, y: 0 }, tags: ["CELL_2"] },
      { p1: { x: 1000, y: 0 }, p2: { x: 1000, y: 400 }, tags: ["CELL_2"] },
      { p1: { x: 1000, y: 400 }, p2: { x: 500, y: 400 }, tags: ["CELL_2"] },
      { p1: { x: 500, y: 400 }, p2: { x: 500, y: 0 }, tags: ["CELL_2", "DIVIDING_WALL"] },
    ];

    const map = DcelPlanarMap.buildFromSegments([...segsCell1, ...segsCell2], {
      policy: DEFAULT_TOLERANCE_POLICY,
    });

    // 6 unique vertices, 7 undirected edges (shared wall deduplicated into 1 edge with 2 half-edges)
    expect(map.vertices.size).toBe(6);
    expect(map.edges.size).toBe(7);
    expect(map.halfEdges.size).toBe(14);

    // 2 interior rectangular faces + 1 exterior face = 3 faces
    expect(map.faces.size).toBe(3);
    const interiorFaces = Array.from(map.faces.values()).filter((f) => !f.isExterior);
    expect(interiorFaces).toHaveLength(2);
    for (const f of interiorFaces) {
      expect(Math.abs(f.area)).toBeCloseTo(200000, 1);
    }

    // Euler characteristic must be exact: V - E + F = 6 - 7 + 3 = 2 = 1 + C (C=1)
    expect(map.connectedComponentsCount).toBe(1);
    expect(map.vertices.size - map.edges.size + map.faces.size).toBe(1 + map.connectedComponentsCount);
  });

  it("should split and deduplicate collinear overlapping segments cleanly", () => {
    // Segment 1: (0,0) to (100, 0)
    // Segment 2: (50, 0) to (150, 0) (overlaps from 50 to 100)
    const segments = [
      { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, tags: ["SEG_1"] },
      { p1: { x: 50, y: 0 }, p2: { x: 150, y: 0 }, tags: ["SEG_2"] },
    ];

    const map = DcelPlanarMap.buildFromSegments(segments, {
      policy: DEFAULT_TOLERANCE_POLICY,
    });

    // Vertices: (0,0), (50,0), (100,0), (150,0) = 4 vertices
    expect(map.vertices.size).toBe(4);
    // Edges: (0,0)-(50,0), (50,0)-(100,0), (100,0)-(150,0) = 3 edges (no duplicate edge on overlap)
    expect(map.edges.size).toBe(3);
    expect(map.halfEdges.size).toBe(6);
    // Euler characteristic: 4 - 3 + 1 = 2 = 1 + 1
    expect(map.vertices.size - map.edges.size + map.faces.size).toBe(1 + map.connectedComponentsCount);
  });

  it("should resolve near-collinear micro-angle intersections near weld tolerance", () => {
    // Two lines crossing at (50, 0) with a micro-angle of 0.005 degrees
    const theta = (0.005 * Math.PI) / 180;
    const segments = [
      { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } },
      { p1: { x: 0, y: -50 * Math.tan(theta) }, p2: { x: 100, y: 50 * Math.tan(theta) } },
    ];

    const map = DcelPlanarMap.buildFromSegments(segments, {
      policy: DEFAULT_TOLERANCE_POLICY,
    });

    // Near endpoints weld within weld_mm (0.001mm), cleanly deduplicating edges
    expect(map.vertices.size).toBe(3);
    expect(map.edges.size).toBe(2);
    expect(map.faces.size).toBe(1);
    expect(map.vertices.size - map.edges.size + map.faces.size).toBe(1 + map.connectedComponentsCount);
  });
});
