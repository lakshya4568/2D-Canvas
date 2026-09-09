import { describe, it, expect } from "vitest";
import { PlanarSet, BoundingBox2D } from "../../lib/geometry/topology/spatialIndex";

describe("PlanarSet Broad-Phase Spatial Index (UPCE-MASTER-1.0 §5.1)", () => {
  it("should insert items and correctly retrieve them via box queries", () => {
    const ps = new PlanarSet<string>(50);

    const b1: BoundingBox2D = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const b2: BoundingBox2D = { minX: 200, minY: 200, maxX: 300, maxY: 300 };
    const b3: BoundingBox2D = { minX: 50, minY: 50, maxX: 150, maxY: 150 };

    ps.insert("box1", b1, "data1");
    ps.insert("box2", b2, "data2");
    ps.insert("box3", b3, "data3");

    expect(ps.size()).toBe(3);

    // Query overlapping b1 and b3
    const q1 = ps.query({ minX: 20, minY: 20, maxX: 80, maxY: 80 });
    const ids1 = q1.map((i) => i.id).sort();
    expect(ids1).toEqual(["box1", "box3"]);

    // Query overlapping only b2
    const q2 = ps.query({ minX: 250, minY: 250, maxX: 260, maxY: 260 });
    expect(q2.map((i) => i.id)).toEqual(["box2"]);

    // Query empty region
    const q3 = ps.query({ minX: 500, minY: 500, maxX: 600, maxY: 600 });
    expect(q3).toHaveLength(0);
  });

  it("should remove items cleanly from all internal grid cells", () => {
    const ps = new PlanarSet<string>(25);
    const box: BoundingBox2D = { minX: 10, minY: 10, maxX: 80, maxY: 80 }; // spans multiple cells

    ps.insert("itemA", box, "A");
    expect(ps.size()).toBe(1);

    const qBefore = ps.query({ minX: 20, minY: 20, maxX: 30, maxY: 30 });
    expect(qBefore).toHaveLength(1);

    expect(ps.remove("itemA")).toBe(true);
    expect(ps.size()).toBe(0);

    const qAfter = ps.query({ minX: 20, minY: 20, maxX: 30, maxY: 30 });
    expect(qAfter).toHaveLength(0);
  });

  it("should query items within a given point radius", () => {
    const ps = new PlanarSet<string>(20);
    ps.insert("p1", { minX: 10, minY: 10, maxX: 10, maxY: 10 }, "Point 1");
    ps.insert("p2", { minX: 30, minY: 10, maxX: 30, maxY: 10 }, "Point 2");
    ps.insert("p3", { minX: 100, minY: 100, maxX: 100, maxY: 100 }, "Point 3");

    // Center at (10, 10) with radius 15
    const nearby = ps.queryPoint({ x: 10, y: 10 }, 15);
    expect(nearby.map((i) => i.id)).toEqual(["p1"]);

    // Center at (20, 10) with radius 15 (covers p1 at dist 10 and p2 at dist 10)
    const both = ps.queryPoint({ x: 20, y: 10 }, 15);
    expect(both.map((i) => i.id).sort()).toEqual(["p1", "p2"]);
  });

  it("should detect all candidate overlaps between items", () => {
    const ps = new PlanarSet<string>(30);
    // Box 1 and Box 2 overlap
    ps.insert("b1", { minX: 0, minY: 0, maxX: 50, maxY: 50 }, "1");
    ps.insert("b2", { minX: 40, minY: 40, maxX: 80, maxY: 80 }, "2");
    // Box 3 is isolated
    ps.insert("b3", { minX: 200, minY: 200, maxX: 250, maxY: 250 }, "3");

    const overlaps = ps.allCandidateOverlaps();
    expect(overlaps).toHaveLength(1);
    const pair = overlaps[0];
    const pairIds = [pair[0].id, pair[1].id].sort();
    expect(pairIds).toEqual(["b1", "b2"]);
  });
});
