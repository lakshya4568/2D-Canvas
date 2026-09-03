import { describe, it, expect } from "vitest";
import { recognizeHaunches } from "../../lib/inference/haunchRecognizer";
import { extractWallThicknessPairs } from "../../lib/inference/wallThicknessExtractor";
import { Point2D } from "../../lib/geometry/topology/types";

describe("Automated Haunch & Wall Thickness Discovery", () => {
  it("should recognize 45-degree corner haunches in an octagonal void", () => {
    // Octagonal void vertices:
    // Top wall: (30, 0) -> (70, 0)
    // Haunch 1: (70, 0) -> (100, 30) (dx = 30, dy = 30 -> 45 deg)
    // Right wall: (100, 30) -> (100, 70)
    // Haunch 2: (100, 70) -> (70, 100) (dx = -30, dy = 30 -> 45 deg)
    // Bottom wall: (70, 100) -> (30, 100)
    // Haunch 3: (30, 100) -> (0, 70) (dx = -30, dy = -30 -> 45 deg)
    // Left wall: (0, 70) -> (0, 30)
    // Haunch 4: (0, 30) -> (30, 0) (dx = 30, dy = -30 -> 45 deg)

    const octVertices: Point2D[] = [
      { x: 30, y: 0 },
      { x: 70, y: 0 },
      { x: 100, y: 30 },
      { x: 100, y: 70 },
      { x: 70, y: 100 },
      { x: 30, y: 100 },
      { x: 0, y: 70 },
      { x: 0, y: 30 },
    ];

    const haunches = recognizeHaunches(octVertices);

    expect(haunches.length).toBe(4);
    for (const h of haunches) {
      expect(h.legLength).toBeCloseTo(30, 4);
      expect(Math.abs(h.angleDeg)).toBeCloseTo(45, 1);
    }
  });

  it("should extract wall thickness offset pairs between parallel boundaries", () => {
    const outerSegments = [
      { p1: { x: -30, y: -30 }, p2: { x: 130, y: -30 } }, // Top outer
      { p1: { x: 130, y: -30 }, p2: { x: 130, y: 130 } }, // Right outer
      { p1: { x: 130, y: 130 }, p2: { x: -30, y: 130 } }, // Bottom outer
      { p1: { x: -30, y: 130 }, p2: { x: -30, y: -30 } }, // Left outer
    ];

    const innerSegments = [
      { p1: { x: 30, y: 0 }, p2: { x: 70, y: 0 } },       // Top inner (y=0, outer y=-30 -> t=30)
      { p1: { x: 100, y: 30 }, p2: { x: 100, y: 70 } },   // Right inner (x=100, outer x=130 -> t=30)
      { p1: { x: 70, y: 100 }, p2: { x: 30, y: 100 } },   // Bottom inner (y=100, outer y=130 -> t=30)
      { p1: { x: 0, y: 70 }, p2: { x: 0, y: 30 } },       // Left inner (x=0, outer x=-30 -> t=30)
    ];

    const pairs = extractWallThicknessPairs(outerSegments, innerSegments, 10, 50);

    expect(pairs.length).toBe(4);
    for (const pair of pairs) {
      expect(pair.thickness).toBeCloseTo(30, 4);
    }
  });
});
