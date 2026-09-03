import { describe, it, expect } from "vitest";
import {
  createSingleCellCulvertModel,
  solveSingleCellCulvertSpan,
} from "../../lib/state/presets/singleCellCulvert";

describe("Benchmark Case 1: Single-Cell Culvert Variational Expansion", () => {
  it("should expand clear span from 300 to 500 while preserving constant wall thickness and 45-degree haunches", () => {
    const initialSpan = 300.0;
    const initialHeight = 200.0;
    const wallThickness = 30.0;
    const haunchLeg = 35.0;

    const culvert = createSingleCellCulvertModel({
      clearSpan: initialSpan,
      clearHeight: initialHeight,
      wallThickness,
      haunchLeg,
    });

    expect(culvert.getClearSpan()).toBeCloseTo(300.0, 4);
    expect(culvert.getOuterWidth()).toBeCloseTo(360.0, 4); // 300 + 2*30

    // Expand clear span to 500
    const solved = solveSingleCellCulvertSpan(culvert, 500.0);

    expect(solved.converged).toBe(true);
    expect(solved.clearSpan).toBeCloseTo(500.0, 4);
    expect(solved.outerWidth).toBeCloseTo(560.0, 4); // 500 + 2*30

    // Verify wall thicknesses remain exactly 30px
    expect(solved.topWallThickness).toBeCloseTo(30.0, 3);
    expect(solved.bottomWallThickness).toBeCloseTo(30.0, 3);
    expect(solved.leftWallThickness).toBeCloseTo(30.0, 3);
    expect(solved.rightWallThickness).toBeCloseTo(30.0, 3);

    // Verify all 4 haunches retain 45-degree invariant and 35px leg length
    for (const haunch of solved.haunches) {
      expect(haunch.legX).toBeCloseTo(35.0, 3);
      expect(haunch.legY).toBeCloseTo(35.0, 3);
      expect(Math.abs(haunch.angleDeg)).toBeCloseTo(45.0, 1);
    }

    // Verify zero joint gaps (shared vertices)
    expect(solved.maxJointDiscontinuity).toBeLessThan(1e-6);
  });
});
