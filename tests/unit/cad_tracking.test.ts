import { describe, it, expect } from "vitest";
import {
  applyOrthoProjection,
  applyPolarTrackingProjection,
  formatDynamicInputMetrics,
} from "../../lib/geometry/cadTracking";
import { drawingReducer, initialDrawingState } from "../../lib/state/drawingReducer";

describe("AutoCAD Drafting Tracking & Constraints", () => {
  describe("Ortho Mode Projections (F8)", () => {
    it("locks to horizontal axis when horizontal displacement dominates", () => {
      const startPt = { x: 100, y: 100 };
      const candidatePt = { x: 250, y: 140 }; // dx = 150, dy = 40

      const orthoPt = applyOrthoProjection(startPt, candidatePt);
      expect(orthoPt.x).toBe(250);
      expect(orthoPt.y).toBe(100);
    });

    it("locks to vertical axis when vertical displacement dominates", () => {
      const startPt = { x: 100, y: 100 };
      const candidatePt = { x: 130, y: 300 }; // dx = 30, dy = 200

      const orthoPt = applyOrthoProjection(startPt, candidatePt);
      expect(orthoPt.x).toBe(100);
      expect(orthoPt.y).toBe(300);
    });

    it("prefers horizontal axis on diagonal tie |dx| === |dy|", () => {
      const startPt = { x: 100, y: 100 };
      const candidatePt = { x: 200, y: 200 }; // dx = 100, dy = 100

      const orthoPt = applyOrthoProjection(startPt, candidatePt);
      expect(orthoPt.x).toBe(200);
      expect(orthoPt.y).toBe(100);
    });
  });

  describe("Polar Tracking Projections (F10)", () => {
    const startPt = { x: 50, y: 50 };

    it("snaps to 0-degree horizontal ray when close", () => {
      const candidatePt = { x: 150, y: 53 }; // angle approx 1.7 deg
      const result = applyPolarTrackingProjection(startPt, candidatePt, 45);

      expect(result.isSnapped).toBe(true);
      expect(result.snappedAngleDeg).toBe(0);
      expect(result.point.y).toBeCloseTo(50, 4);
      expect(result.point.x).toBeGreaterThan(149);
    });

    it("snaps to 45-degree ray when close", () => {
      // 45 degrees from (50,50) at dist 100 is (50 + 70.71, 50 + 70.71)
      const candidatePt = { x: 120, y: 122 }; // close to 45 deg
      const result = applyPolarTrackingProjection(startPt, candidatePt, 45);

      expect(result.isSnapped).toBe(true);
      expect(result.snappedAngleDeg).toBe(45);
      const dx = result.point.x - startPt.x;
      const dy = result.point.y - startPt.y;
      expect(dx).toBeCloseTo(dy, 4);
    });

    it("snaps to 90-degree vertical ray when close", () => {
      const candidatePt = { x: 52, y: 200 };
      const result = applyPolarTrackingProjection(startPt, candidatePt, 45);

      expect(result.isSnapped).toBe(true);
      expect(result.snappedAngleDeg).toBe(90);
      expect(result.point.x).toBeCloseTo(50, 4);
      expect(result.point.y).toBeCloseTo(200, 1);
    });

    it("does not snap when angular difference exceeds tolerance", () => {
      // 25 degrees is not near 0 or 45 (within 5 degrees threshold)
      const dist = 100;
      const angleRad = (25 * Math.PI) / 180;
      const candidatePt = {
        x: startPt.x + dist * Math.cos(angleRad),
        y: startPt.y + dist * Math.sin(angleRad),
      };

      const result = applyPolarTrackingProjection(startPt, candidatePt, 45);
      expect(result.isSnapped).toBe(false);
      expect(result.point.x).toBe(candidatePt.x);
      expect(result.point.y).toBe(candidatePt.y);
    });
  });

  describe("Dynamic Input Metrics (F12)", () => {
    it("formats dynamic input metrics accurately", () => {
      const basePt = { x: 100, y: 100 };
      const cursorPt = { x: 200, y: 100 }; // dist 100, angle 0 deg

      const metrics = formatDynamicInputMetrics(basePt, cursorPt);
      expect(metrics.distance).toBe(100);
      expect(metrics.angleDeg).toBe(0);
      expect(metrics.distanceLabel).toBe("100.0");
      expect(metrics.angleLabel).toBe("0°");
    });

    it("computes 90-degree and 270-degree angles correctly", () => {
      const basePt = { x: 100, y: 100 };
      const pt90 = { x: 100, y: 250 };
      const metrics90 = formatDynamicInputMetrics(basePt, pt90);
      expect(metrics90.distance).toBe(150);
      expect(metrics90.angleDeg).toBe(90);

      const pt180 = { x: 0, y: 100 };
      const metrics180 = formatDynamicInputMetrics(basePt, pt180);
      expect(metrics180.distance).toBe(100);
      expect(metrics180.angleDeg).toBe(180);
    });
  });

  describe("Reducer Drafting Modes Mutual Exclusivity", () => {
    it("enabling Ortho automatically disables Polar Tracking", () => {
      let state = { ...initialDrawingState, polarTrackingEnabled: true, orthoEnabled: false };
      state = drawingReducer(state, { type: "TOGGLE_ORTHO" });
      expect(state.orthoEnabled).toBe(true);
      expect(state.polarTrackingEnabled).toBe(false);
    });

    it("enabling Polar Tracking automatically disables Ortho", () => {
      let state = { ...initialDrawingState, orthoEnabled: true, polarTrackingEnabled: false };
      state = drawingReducer(state, { type: "TOGGLE_POLAR_TRACKING" });
      expect(state.polarTrackingEnabled).toBe(true);
      expect(state.orthoEnabled).toBe(false);
    });

    it("toggles Dynamic Input independently", () => {
      let state = { ...initialDrawingState, dynamicInputEnabled: true };
      state = drawingReducer(state, { type: "TOGGLE_DYNAMIC_INPUT" });
      expect(state.dynamicInputEnabled).toBe(false);
      state = drawingReducer(state, { type: "TOGGLE_DYNAMIC_INPUT" });
      expect(state.dynamicInputEnabled).toBe(true);
    });
  });
});
