import { describe, it, expect } from "vitest";
import { AffineMatrix3x3 } from "../../lib/geometry/lcs/affineMatrix";
import { LocalFrame } from "../../lib/geometry/lcs/frame";
import { gramSchmidt2D } from "../../lib/geometry/lcs/gramSchmidt";

describe("Hierarchical Local Coordinate Systems (LCS)", () => {
  it("should perform forward and inverse projections with precision < 1e-12", () => {
    // Create frame at origin (120, 80) rotated by 45 deg, scale = 1.0
    const frame = new LocalFrame("frame_cell", { x: 120, y: 80 }, Math.PI / 4);

    const localPt = { x: 50, y: 0 };
    const worldPt = frame.toWorld(localPt);

    // x_w = 120 + 50 * cos(45) = 120 + 35.355339...
    // y_w = 80 + 50 * sin(45) = 80 + 35.355339...
    expect(worldPt.x).toBeCloseTo(120 + 50 * Math.cos(Math.PI / 4), 10);
    expect(worldPt.y).toBeCloseTo(80 + 50 * Math.sin(Math.PI / 4), 10);

    // Invert back to local
    const reconstructedLocal = frame.toLocal(worldPt);
    expect(reconstructedLocal.x).toBeCloseTo(localPt.x, 10);
    expect(reconstructedLocal.y).toBeCloseTo(localPt.y, 10);
  });

  it("should construct orthonormal basis via Gram-Schmidt from arbitrary guide vector", () => {
    const rawVector = { x: 30, y: 40 }; // length = 50
    const basis = gramSchmidt2D(rawVector);

    // u should be unit vector (0.6, 0.8)
    expect(basis.u.x).toBeCloseTo(0.6, 12);
    expect(basis.u.y).toBeCloseTo(0.8, 12);

    // v should be perpendicular (-0.8, 0.6)
    expect(basis.v.x).toBeCloseTo(-0.8, 12);
    expect(basis.v.y).toBeCloseTo(0.6, 12);

    // Dot product u . v == 0
    const dot = basis.u.x * basis.v.x + basis.u.y * basis.v.y;
    expect(Math.abs(dot)).toBeLessThan(1e-14);

    // Lengths == 1
    const lenU = Math.hypot(basis.u.x, basis.u.y);
    const lenV = Math.hypot(basis.v.x, basis.v.y);
    expect(lenU).toBeCloseTo(1.0, 12);
    expect(lenV).toBeCloseTo(1.0, 12);
  });

  it("should compose nested frames in hierarchy", () => {
    // Parent frame (e.g. culvert) at (100, 100)
    const parentFrame = new LocalFrame("culvert", { x: 100, y: 100 }, 0);
    // Child frame (e.g. cell 2) at offset (250, 0) relative to parent
    const childFrame = new LocalFrame("cell2", { x: 250, y: 0 }, 0, parentFrame);

    const localPt = { x: 20, y: 30 };
    const worldPt = childFrame.toWorld(localPt);

    expect(worldPt.x).toBe(370); // 100 + 250 + 20
    expect(worldPt.y).toBe(130); // 100 + 0 + 30

    const invertedLocal = childFrame.toLocal(worldPt);
    expect(invertedLocal.x).toBeCloseTo(20, 10);
    expect(invertedLocal.y).toBeCloseTo(30, 10);
  });
});
