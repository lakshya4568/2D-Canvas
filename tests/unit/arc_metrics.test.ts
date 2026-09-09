import { describe, it, expect } from "vitest";
import {
  arcLength,
  chordLength,
  sagitta,
  arcTangentVector,
  arcNormalVector,
  computeArcMetrics,
  computeArcFromThreePoints,
} from "../../lib/geometry/metrics/arcMetrics";

describe("Arc Metrics & Boundary Tangent Vectors (UPCE-MASTER-1.0 §5.1)", () => {
  it("should calculate exact arc length, chord length, and sagitta for quarter circle (90 deg)", () => {
    const r = 100;
    const sweep = Math.PI / 2; // 90 deg

    const len = arcLength(r, sweep);
    expect(len).toBeCloseTo(50 * Math.PI, 8);

    const chord = chordLength(r, sweep);
    expect(chord).toBeCloseTo(100 * Math.SQRT2, 8);

    const sag = sagitta(r, sweep);
    expect(sag).toBeCloseTo(100 * (1 - Math.SQRT1_2), 8);
  });

  it("should calculate exact metrics for semicircle (180 deg)", () => {
    const r = 250;
    const sweep = Math.PI;

    const len = arcLength(r, sweep);
    expect(len).toBeCloseTo(250 * Math.PI, 8);

    const chord = chordLength(r, sweep);
    expect(chord).toBeCloseTo(500, 8); // Diameter

    const sag = sagitta(r, sweep);
    expect(sag).toBeCloseTo(250, 8); // Radius
  });

  it("should satisfy geometric identity: sagitta equals distance from arc midpoint to chord midpoint", () => {
    const r = 180;
    const startAngle = 0.35; // ~20 deg
    const endAngle = 1.95;   // ~111.7 deg

    const res = computeArcMetrics({
      center: { x: 50, y: 75 },
      radius: r,
      startAngleRad: startAngle,
      endAngleRad: endAngle,
      ccw: true,
    });

    const distToChordMid = Math.hypot(
      res.midpoint.x - res.chordMidpoint.x,
      res.midpoint.y - res.chordMidpoint.y
    );

    expect(distToChordMid).toBeCloseTo(res.sagitta, 8);
  });

  it("should yield orthogonal unit tangent and normal vectors at arc boundaries", () => {
    const angles = [0, Math.PI / 6, Math.PI / 4, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

    for (const angle of angles) {
      const tangent = arcTangentVector(angle, true);
      const normal = arcNormalVector(angle);

      // Tangent must be unit vector
      expect(Math.hypot(tangent.x, tangent.y)).toBeCloseTo(1.0, 10);

      // Normal must be unit vector
      expect(Math.hypot(normal.x, normal.y)).toBeCloseTo(1.0, 10);

      // Dot product Tangent . Normal must be 0 (perpendicular)
      const dot = tangent.x * normal.x + tangent.y * normal.y;
      expect(Math.abs(dot)).toBeLessThan(1e-12);
    }
  });

  it("should reconstruct arc from three boundary points correctly", () => {
    const center = { x: 200, y: 150 };
    const r = 80;

    const p1 = { x: center.x + r, y: center.y }; // 0 deg
    const p2 = { x: center.x, y: center.y + r }; // 90 deg
    const p3 = { x: center.x - r, y: center.y }; // 180 deg

    const arc = computeArcFromThreePoints(p1, p2, p3);
    expect(arc).not.toBeNull();
    expect(arc!.center.x).toBeCloseTo(center.x, 8);
    expect(arc!.center.y).toBeCloseTo(center.y, 8);
    expect(arc!.radius).toBeCloseTo(r, 8);
    expect(arc!.chordLength).toBeCloseTo(160, 8);
    expect(arc!.sagitta).toBeCloseTo(80, 8);
  });

  it("should preserve arc length, chord length, and sagitta under rigid rotation", () => {
    const r = 120;
    const startAngle = Math.PI / 6;
    const endAngle = (2 * Math.PI) / 3;

    const original = computeArcMetrics({
      center: { x: 100, y: 100 },
      radius: r,
      startAngleRad: startAngle,
      endAngleRad: endAngle,
      ccw: true,
    });

    // Rotate by 45 degrees
    const rot = Math.PI / 4;
    const rotated = computeArcMetrics({
      center: { x: 300, y: 200 },
      radius: r,
      startAngleRad: startAngle + rot,
      endAngleRad: endAngle + rot,
      ccw: true,
    });

    expect(rotated.arcLength).toBeCloseTo(original.arcLength, 10);
    expect(rotated.chordLength).toBeCloseTo(original.chordLength, 10);
    expect(rotated.sagitta).toBeCloseTo(original.sagitta, 10);
  });
});
