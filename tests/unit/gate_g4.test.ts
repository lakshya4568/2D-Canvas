/**
 * Gate G4 Acceptance Verification Suite (UPCE-MASTER-1.0 §76, §86, §5.2, §40)
 *
 * Non-negotiable Gate G4 Criteria:
 * 1. Chamfers authored at 30°, 45°, and 60° retain their exact authored angles
 *    under parameter edits and variational re-solves.
 * 2. Concentric circles and arcs maintain exact concentricity (‖CA - CB‖ < tol)
 *    and radial offsets (|rA - rB|) under parameter edits and rigid body rotations.
 * 3. Line-to-circle and circle-to-circle tangencies remain exactly tangent
 *    after driving parameter updates and component transformations.
 * 4. Skewed sketches at 15°, 37°, 45°, 60° detect offsets, perpendiculars,
 *    and chamfers without distortion or metric degradation.
 * 5. Elimination of hardcoded 45° rule: recognizeGeneralChamfers measures exact
 *    angles (30°, 45°, 60°) and leg lengths without forcing 45°.
 * 6. SVD row-space admissibility gating for Level-2 constraints correctly classifies
 *    independent, redundant, and conflicting angular/circular constraints.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateSignedAngle,
  evaluateCornerChamfer,
  evaluateConcentricRadialOffset,
  evaluateTangencyLineCircle,
  evaluateTangencyCircleCircle,
  evaluatePerpendicular,
  evaluateParallelOffset,
  SegmentPrimitive,
  CirclePrimitive,
} from "../../lib/geometry/predicates/vectorPredicates";
import { DEFAULT_TOLERANCE_POLICY, createTolerancePolicy } from "../../lib/geometry/tolerance";
import { Point2D } from "../../lib/geometry/topology/types";
import { DcelPlanarMap, DcelSegmentInput } from "../../lib/geometry/topology/dcel";
import {
  detectCandidatesFromDcel,
  detectAndClusterCandidates,
} from "../../lib/inference/candidateDetector";
import {
  recognizeGeneralChamfers,
  recognizeHaunches,
} from "../../lib/inference/haunchRecognizer";
import { evaluateCandidateAdmissibility } from "../../lib/inference/admissibilityFilter";
import { solveLevenbergMarquardt, SystemModel } from "../../lib/solver/levenbergMarquardt";

function rotatePoint(pt: Point2D, angleRad: number, center: Point2D = { x: 0, y: 0 }): Point2D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = pt.x - center.x;
  const dy = pt.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function rotateSegment(seg: SegmentPrimitive, angleRad: number, center?: Point2D): SegmentPrimitive {
  return {
    id: seg.id,
    start: rotatePoint(seg.start, angleRad, center),
    end: rotatePoint(seg.end, angleRad, center),
    sourceShapeId: seg.sourceShapeId,
  };
}

describe("Gate G4 Acceptance Criterion (UPCE-MASTER-1.0 §76 & §86)", () => {
  const policy = DEFAULT_TOLERANCE_POLICY;

  describe("Criterion 1: 30°, 45°, 60° Chamfers Retain Authored Angle Under Parameter Edits", () => {
    it("should preserve authored angles (30°, 45°, 60°) during variational corner re-solves", () => {
      const angles = [
        { deg: 30, rad: (30 * Math.PI) / 180 },
        { deg: 45, rad: (45 * Math.PI) / 180 },
        { deg: 60, rad: (60 * Math.PI) / 180 },
      ];

      for (const { deg, rad } of angles) {
        const targetLegA = 100;
        const tanAngle = Math.tan(rad);

        const model: SystemModel = {
          evaluateResiduals(X: number[]) {
            const x1 = X[0], y1 = X[1], x2 = X[2], y2 = X[3];
            return [
              y1,
              x2,
              x1 - targetLegA,
              (y2 - y1) - (x1 - x2) * tanAngle,
            ];
          },
          evaluateJacobian(X: number[]) {
            return [
              [0, 1, 0, 0],
              [0, 0, 1, 0],
              [1, 0, 0, 0],
              [-tanAngle, -1, tanAngle, 1],
            ];
          },
        };

        const initialGuess = [80, 5, 5, 80 * tanAngle];
        const result = solveLevenbergMarquardt(model, initialGuess, {
          maxIterations: 50,
          toleranceResidual: 1e-7,
        });

        expect(result.converged).toBe(true);
        expect(result.maxResidual).toBeLessThan(1e-7);

        const [x1, y1, x2, y2] = result.solution;
        const edgeA: SegmentPrimitive = { start: { x: 500, y: 0 }, end: { x: x1, y: y1 } };
        const chamfer: SegmentPrimitive = { start: { x: x1, y: y1 }, end: { x: x2, y: y2 } };
        const edgeB: SegmentPrimitive = { start: { x: x2, y: y2 }, end: { x: 0, y: 500 } };

        const chamferMetrics = evaluateCornerChamfer(edgeA, edgeB, chamfer, policy);
        expect(chamferMetrics.isChamfer).toBe(true);
        expect(chamferMetrics.angleDeg).toBeCloseTo(deg, 2);
      }
    });
  });

  describe("Criterion 2: Concentric Circles & Tangency Under Edits & Rotations", () => {
    it("should maintain concentricity and exact radial offset after driving edits and rotation", () => {
      let c1: CirclePrimitive = { center: { x: 200, y: 300 }, radius: 60 };
      let c2: CirclePrimitive = { center: { x: 200, y: 300 }, radius: 110 };

      const baseRes = evaluateConcentricRadialOffset(c1, c2, policy);
      expect(baseRes.isConcentric).toBe(true);
      expect(baseRes.radialOffset).toBeCloseTo(50, 4);

      // Driving edit: expand outer radius to 150 mm
      c2 = { ...c2, radius: 150 };
      const editedRes = evaluateConcentricRadialOffset(c1, c2, policy);
      expect(editedRes.isConcentric).toBe(true);
      expect(editedRes.radialOffset).toBeCloseTo(90, 4);

      // Rotate by arbitrary angles: 15°, 37°, 45°, 60° around origin
      const anglesDeg = [15, 37, 45, 60];
      for (const deg of anglesDeg) {
        const rad = (deg * Math.PI) / 180;
        const rotCenter = rotatePoint(c1.center, rad);
        const rotC1: CirclePrimitive = { center: rotCenter, radius: c1.radius };
        const rotC2: CirclePrimitive = { center: rotCenter, radius: c2.radius };

        const rotRes = evaluateConcentricRadialOffset(rotC1, rotC2, policy);
        expect(rotRes.isConcentric).toBe(true);
        expect(rotRes.centerDistance).toBeCloseTo(0, 4);
        expect(rotRes.radialOffset).toBeCloseTo(90, 4);
      }
    });

    it("should preserve exact line-circle and circle-circle tangency under parameter edits and rotation", () => {
      // Circle tangent to line y = 0 at x = 100, radius = 50 -> center = (100, 50)
      const line: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 300, y: 0 } };
      let circle: CirclePrimitive = { center: { x: 100, y: 50 }, radius: 50 };

      expect(evaluateTangencyLineCircle(line, circle, policy).isTangent).toBe(true);

      // Driving edit: increase radius to 80 -> center moves to (100, 80) to maintain tangency
      circle = { center: { x: 100, y: 80 }, radius: 80 };
      expect(evaluateTangencyLineCircle(line, circle, policy).isTangent).toBe(true);

      // Rotate system by 37° and 60°
      for (const deg of [37, 60]) {
        const rad = (deg * Math.PI) / 180;
        const rotLine = rotateSegment(line, rad);
        const rotCircle: CirclePrimitive = {
          center: rotatePoint(circle.center, rad),
          radius: circle.radius,
        };
        const res = evaluateTangencyLineCircle(rotLine, rotCircle, policy);
        expect(res.isTangent).toBe(true);
        expect(res.isOnSegment).toBe(true);
        expect(res.deviation).toBeCloseTo(0, 3);
      }
    });
  });

  describe("Criterion 3: Skewed Sketches Detect Offsets, Perpendiculars & Chamfers Without Distortion", () => {
    it("should detect identical candidate sets on sketches skewed at 15°, 37°, 45°, 60°", () => {
      const outerSegs: DcelSegmentInput[] = [
        { p1: { x: 0, y: 0 }, p2: { x: 1000, y: 0 }, sourceShapeId: "outer" },
        { p1: { x: 1000, y: 0 }, p2: { x: 1000, y: 600 }, sourceShapeId: "outer" },
        { p1: { x: 1000, y: 600 }, p2: { x: 0, y: 600 }, sourceShapeId: "outer" },
        { p1: { x: 0, y: 600 }, p2: { x: 0, y: 0 }, sourceShapeId: "outer" },
      ];
      const innerSegs: DcelSegmentInput[] = [
        { p1: { x: 100, y: 100 }, p2: { x: 800, y: 100 }, sourceShapeId: "inner" },
        { p1: { x: 800, y: 100 }, p2: { x: 900, y: 200 }, sourceShapeId: "inner" },
        { p1: { x: 900, y: 200 }, p2: { x: 900, y: 500 }, sourceShapeId: "inner" },
        { p1: { x: 900, y: 500 }, p2: { x: 100, y: 500 }, sourceShapeId: "inner" },
        { p1: { x: 100, y: 500 }, p2: { x: 100, y: 100 }, sourceShapeId: "inner" },
      ];

      const baseSegments = [...outerSegs, ...innerSegs];
      const baseMap = DcelPlanarMap.buildFromSegments(baseSegments, { policy });
      const baseCands = detectCandidatesFromDcel(baseMap, {
        policy,
        conformanceLevel: 2,
        maxOffsetMm: 150,
      });

      const baseOffsets = baseCands.filter((c) => c.predicate === "P3_PARALLEL_OFFSET");
      const baseChamfers = baseCands.filter((c) => c.predicate === "P4_CORNER_CHAMFER");
      const basePerps = baseCands.filter((c) => c.predicate === "P2_PERPENDICULAR");

      expect(baseOffsets.length).toBeGreaterThanOrEqual(4);
      expect(baseChamfers.length).toBeGreaterThanOrEqual(1);
      expect(basePerps.length).toBeGreaterThanOrEqual(4);

      const anglesDeg = [15, 37, 45, 60];
      for (const deg of anglesDeg) {
        const rad = (deg * Math.PI) / 180;
        const rotSegments: DcelSegmentInput[] = baseSegments.map((s) => ({
          p1: rotatePoint(s.p1, rad),
          p2: rotatePoint(s.p2, rad),
          sourceShapeId: s.sourceShapeId,
        }));

        const rotMap = DcelPlanarMap.buildFromSegments(rotSegments, { policy });
        const rotCands = detectCandidatesFromDcel(rotMap, {
          policy,
          conformanceLevel: 2,
          maxOffsetMm: 150,
        });

        const rotOffsets = rotCands.filter((c) => c.predicate === "P3_PARALLEL_OFFSET");
        const rotChamfers = rotCands.filter((c) => c.predicate === "P4_CORNER_CHAMFER");
        const rotPerps = rotCands.filter((c) => c.predicate === "P2_PERPENDICULAR");

        expect(rotOffsets.length).toBe(baseOffsets.length);
        expect(rotChamfers.length).toBe(baseChamfers.length);
        expect(rotPerps.length).toBe(basePerps.length);

        for (let i = 0; i < baseOffsets.length; i++) {
          expect(rotOffsets[i].nominalValue).toBeCloseTo(baseOffsets[i].nominalValue, 2);
        }
      }
    });
  });

  describe("Criterion 4: Elimination of Hardcoded 45° Haunch Rule", () => {
    it("should measure 30°, 45°, and 60° chamfers without forcing 45°", () => {
      // 30° chamfer polygon
      const poly30: Point2D[] = [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 400, y: 100 * Math.tan((30 * Math.PI) / 180) },
        { x: 400, y: 500 },
        { x: 0, y: 500 },
      ];
      const chamfers30 = recognizeGeneralChamfers(poly30);
      expect(chamfers30.length).toBe(1);
      expect(chamfers30[0].angleDeg).toBeCloseTo(30, 1);

      // 60° chamfer polygon
      const poly60: Point2D[] = [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 400, y: 100 * Math.tan((60 * Math.PI) / 180) },
        { x: 400, y: 500 },
        { x: 0, y: 500 },
      ];
      const chamfers60 = recognizeGeneralChamfers(poly60);
      expect(chamfers60.length).toBe(1);
      expect(chamfers60[0].angleDeg).toBeCloseTo(60, 1);

      // 45° equal-leg polygon
      const poly45: Point2D[] = [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 400, y: 100 },
        { x: 400, y: 500 },
        { x: 0, y: 500 },
      ];
      const chamfers45 = recognizeGeneralChamfers(poly45);
      expect(chamfers45.length).toBe(1);
      expect(chamfers45[0].angleDeg).toBeCloseTo(45, 1);
      expect(chamfers45[0].isEqualLeg).toBe(true);
    });
  });

  describe("Criterion 5: SVD Row-Space Admissibility Gating for Level-2 Candidates", () => {
    it("should classify independent, redundant, and conflicting Level-2 constraints correctly", () => {
      // 1. Independent Level-2 angle constraint
      const currentJacobian = [
        [1, 0, -1, 0, 0, 0, 0, 0], // distance constraint on P1-P2
      ];
      const indepGradient = [0, 0, 0, 0, 0, 1, 0, -1];
      const evalIndep = evaluateCandidateAdmissibility(currentJacobian, indepGradient, 0.0, { policy });
      expect(evalIndep.isAdmissible).toBe(true);
      expect(evalIndep.status).toBe("independent");

      // 2. Redundant Level-2 constraint: identical row gradient with residual < tol
      const redundGradient = [1, 0, -1, 0, 0, 0, 0, 0];
      const evalRedund = evaluateCandidateAdmissibility(currentJacobian, redundGradient, 1e-9, { policy });
      expect(evalRedund.isAdmissible).toBe(false);
      expect(evalRedund.status).toBe("redundant");

      // 3. Conflicting Level-2 constraint: linearly dependent row gradient with residual >= tol
      const conflictGradient = [1, 0, -1, 0, 0, 0, 0, 0];
      const evalConflict = evaluateCandidateAdmissibility(currentJacobian, conflictGradient, 25.0, { policy });
      expect(evalConflict.isAdmissible).toBe(false);
      expect(evalConflict.status).toBe("conflicting");
      expect(evalConflict.diagnosis).toContain("Conflicting constraint");
    });
  });

  describe("Criterion 6: Bidirectional Chamfer Re-Solve", () => {
    it("should re-solve chamfer leg bidirectionally (50 -> 100 -> 50) without inversion", () => {
      const createModel = (targetLeg: number): SystemModel => ({
        evaluateResiduals(X: number[]) {
          const x1 = X[0], y1 = X[1], x2 = X[2], y2 = X[3];
          return [
            y1,
            x2,
            x1 - targetLeg,
            y2 - targetLeg,
          ];
        },
        evaluateJacobian() {
          return [
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [1, 0, 0, 0],
            [0, 0, 0, 1],
          ];
        },
      });

      const sol = [50, 0, 0, 50];

      // Forward edit to 100 mm
      const resForward = solveLevenbergMarquardt(
        createModel(100),
        sol,
        { toleranceResidual: 1e-7 }
      );
      expect(resForward.converged).toBe(true);
      expect(resForward.solution[0]).toBeCloseTo(100, 4);
      expect(resForward.solution[3]).toBeCloseTo(100, 4);

      // Reverse edit back to 50 mm
      const resReverse = solveLevenbergMarquardt(
        createModel(50),
        resForward.solution,
        { toleranceResidual: 1e-7 }
      );
      expect(resReverse.converged).toBe(true);
      expect(resReverse.solution[0]).toBeCloseTo(50, 4);
      expect(resReverse.solution[3]).toBeCloseTo(50, 4);
    });
  });
});
