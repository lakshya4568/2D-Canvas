import { describe, it, expect } from "vitest";
import {
  createTwoSpanCulvertModel,
  solveTwoSpanCulvertBay1,
} from "../../lib/state/presets/twoSpanCulvert";

describe("Benchmark Case 2: Two-Span Culvert Anisotropic Expansion", () => {
  it("should expand Bay 1 by +150px, shifting Bay 2 as a rigid body and retaining dividing wall thickness", () => {
    const culvert = createTwoSpanCulvertModel({
      bay1Span: 250.0,
      bay2Span: 250.0,
      clearHeight: 200.0,
      extWallThickness: 30.0,
      midWallThickness: 40.0,
      haunchLeg: 35.0,
    });

    const initialTotalWidth = culvert.getTotalWidth();
    // 30 (left) + 250 (bay 1) + 40 (mid) + 250 (bay 2) + 30 (right) = 600
    expect(initialTotalWidth).toBeCloseTo(600.0, 4);

    // Expand Bay 1 from 250 to 400 (+150px)
    const solved = solveTwoSpanCulvertBay1(culvert, 400.0);

    expect(solved.converged).toBe(true);
    expect(solved.bay1Span).toBeCloseTo(400.0, 4);

    // Total width must expand by exactly 150px (600 + 150 = 750)
    expect(solved.totalWidth).toBeCloseTo(750.0, 4);

    // Dividing wall thickness must remain 40px
    expect(solved.midWallThickness).toBeCloseTo(40.0, 3);

    // Bay 2 internal span must remain exactly 250px (rigid translation)
    expect(solved.bay2Span).toBeCloseTo(250.0, 4);

    // Both bays must retain 35px 45-degree corner haunches
    for (const h of solved.bay1Haunches) {
      expect(h.legX).toBeCloseTo(35.0, 3);
      expect(h.legY).toBeCloseTo(35.0, 3);
      expect(Math.abs(h.angleDeg)).toBeCloseTo(45.0, 1);
    }
    for (const h of solved.bay2Haunches) {
      expect(h.legX).toBeCloseTo(35.0, 3);
      expect(h.legY).toBeCloseTo(35.0, 3);
      expect(Math.abs(h.angleDeg)).toBeCloseTo(45.0, 1);
    }

    // Zero joint gap
    expect(solved.maxJointDiscontinuity).toBeLessThan(1e-6);
  });
});
