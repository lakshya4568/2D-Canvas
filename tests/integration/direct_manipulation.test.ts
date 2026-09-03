import { describe, it, expect } from "vitest";
import { validatePolygonChirality } from "../../lib/solver/hysteresis";
import { Point2D } from "../../lib/geometry/topology/types";

describe("Direct Manipulation & Solution Hysteresis", () => {
  it("should preserve polygon chirality during smooth coordinate displacement", () => {
    // Original CCW square
    const initialSquare: Point2D[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    // Smooth drag top-right corner to (120, 20)
    const validTrial: Point2D[] = [
      { x: 0, y: 0 },
      { x: 120, y: 20 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    expect(validatePolygonChirality(initialSquare, validTrial)).toBe(true);

    // Inverted corner that self-intersects / flips inside-out
    const invertedTrial: Point2D[] = [
      { x: 0, y: 0 },
      { x: 50, y: 150 }, // Inverted across diagonal
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    expect(validatePolygonChirality(initialSquare, invertedTrial)).toBe(false);
  });
});
