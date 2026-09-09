/**
 * Gate G2 Acceptance Verification Suite (UPCE-MASTER-1.0 §76, §86, Part VI GEOM-RP/1)
 *
 * Mandatory Gate Criteria:
 * 1. Rotated nested rectangle fixtures (at 15°, 37°, 45°, etc.) produce the EXACT same
 *    offset candidates and nominal thickness values as the unrotated one.
 * 2. Arbitrary polygons (e.g. trapezoids with slanted walls, rotated voids) detect
 *    true edge offsets and distances using their real edges, never bounding boxes.
 * 3. Pre-display candidate clustering merges candidate proposals binned at cluster_mm (1.0 mm)
 *    into unified parameter cards (e.g. 4 parallel offsets collapse into 1 WallThickness card).
 * 4. SVD row-space admissibility gate (§32) correctly tri-states candidates into
 *    independent (admissible), redundant (silently discarded), or conflicting (flagged with diagnosis).
 * 5. Zero shape-type branching (`if (shape.type === ...)`) in predicate or candidate paths.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { DcelPlanarMap, DcelSegmentInput } from "../../lib/geometry/topology/dcel";
import { DEFAULT_TOLERANCE_POLICY } from "../../lib/geometry/tolerance";
import { Point2D } from "../../lib/geometry/topology/types";
import {
  detectCandidatesFromSegments,
  detectCandidatesFromDcel,
  detectAndClusterCandidates,
} from "../../lib/inference/candidateDetector";
import {
  evaluateParallelOffset,
  SegmentPrimitive,
} from "../../lib/geometry/predicates/vectorPredicates";
import {
  evaluateCandidateAdmissibility,
} from "../../lib/inference/admissibilityFilter";
import { runLint } from "../../scripts/lint-tolerance";

function rotatePoint(pt: Point2D, angleRad: number): Point2D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: pt.x * cos - pt.y * sin,
    y: pt.x * sin + pt.y * cos,
  };
}

function loadFixtureSegments(filePath: string, rotationRad: number = 0): DcelSegmentInput[] {
  const content = readFileSync(filePath, "utf-8");
  const data = JSON.parse(content);
  const points = data.primitives.points;
  const lines = data.primitives.lines;

  const segments: DcelSegmentInput[] = [];
  for (const line of Object.values(lines) as any[]) {
    const p1Raw = points[line.startPointId];
    const p2Raw = points[line.endPointId];
    if (!p1Raw || !p2Raw) continue;

    const p1 = rotationRad !== 0 ? rotatePoint(p1Raw, rotationRad) : { x: p1Raw.x, y: p1Raw.y };
    const p2 = rotationRad !== 0 ? rotatePoint(p2Raw, rotationRad) : { x: p2Raw.x, y: p2Raw.y };

    segments.push({
      p1,
      p2,
      sourceShapeId: line.id.startsWith("il") ? "inner" : "outer",
    });
  }
  return segments;
}

describe("Gate G2 Acceptance Criterion (UPCE-MASTER-1.0 §76 & §86)", () => {
  const policy = DEFAULT_TOLERANCE_POLICY;
  const fixturesDir = resolve(__dirname, "../../fixtures");
  const nestedRectFixture = resolve(fixturesDir, "basic/nested_rectangle.json");

  describe("Criterion 1: Rotation Invariance of Offset Candidates & Nominal Thickness Values", () => {
    const rotationAnglesDeg = [15, 37, 45, 60, 90, 120, 180, 270];

    it("should produce the EXACT same offset candidates and nominal thickness values (100 mm) across all rotation angles", () => {
      // 1. Unrotated baseline (0°)
      const segsBase = loadFixtureSegments(nestedRectFixture, 0);
      const { candidates: cBase, cards: cardsBase } = detectAndClusterCandidates(segsBase, {
        policy,
        maxOffsetMm: 250, // isolate wall thickness candidates
      });

      // Exactly 4 parallel offset candidates (top, bottom, left, right walls)
      expect(cBase.length).toBe(4);
      for (const cand of cBase) {
        expect(cand.predicate).toBe("P3_PARALLEL_OFFSET");
        expect(cand.nominalValue).toBeCloseTo(100.0, 4);
      }

      // Exactly 1 clustered parameter card for WallThickness with 4 occurrences
      expect(cardsBase.length).toBe(1);
      const baseCard = cardsBase[0];
      expect(baseCard.parameterName).toBe("WallThickness");
      expect(baseCard.nominalValue).toBeCloseTo(100.0, 4);
      expect(baseCard.occurrences).toBe(4);

      // 2. Rotate nested rectangle by each target angle and verify mathematical invariance
      for (const deg of rotationAnglesDeg) {
        const rad = (deg * Math.PI) / 180;
        const segsRot = loadFixtureSegments(nestedRectFixture, rad);
        const { candidates: cRot, cards: cardsRot } = detectAndClusterCandidates(segsRot, {
          policy,
          maxOffsetMm: 250,
        });

        // Must detect identical count of candidates
        expect(cRot.length).toBe(cBase.length);

        // Every candidate must have nominal value within 1e-4 mm of 100.0 mm
        for (const cand of cRot) {
          expect(cand.predicate).toBe("P3_PARALLEL_OFFSET");
          expect(cand.nominalValue).toBeCloseTo(100.0, 4);
        }

        // Clustered card must be identical in parameterName, nominalValue, and occurrences
        expect(cardsRot.length).toBe(1);
        const rotCard = cardsRot[0];
        expect(rotCard.parameterName).toBe(baseCard.parameterName);
        expect(rotCard.occurrences).toBe(baseCard.occurrences);
        expect(rotCard.nominalValue).toBeCloseTo(baseCard.nominalValue, 4);
      }
    });
  });

  describe("Criterion 2: Arbitrary Polygons Detect True Edge Offsets and Distances (Zero Bounding Boxes)", () => {
    it("should detect true normal offsets and wall thicknesses on arbitrary trapezoids with non-orthogonal slanted edges", () => {
      // Create a trapezoidal hollow box:
      // Outer trapezoid:
      // Bottom: (0, 0) -> (1000, 0) [L = 1000, normal = (0, 1)]
      // Right slanted: (1000, 0) -> (800, 600) [vector = (-200, 600), len = 632.455]
      // Top: (800, 600) -> (200, 600) [L = 600, normal = (0, -1)]
      // Left slanted: (200, 600) -> (0, 0) [vector = (-200, -600), len = 632.455]
      const outerSegs: DcelSegmentInput[] = [
        { p1: { x: 0, y: 0 }, p2: { x: 1000, y: 0 }, sourceShapeId: "outer" },
        { p1: { x: 1000, y: 0 }, p2: { x: 800, y: 600 }, sourceShapeId: "outer" },
        { p1: { x: 800, y: 600 }, p2: { x: 200, y: 600 }, sourceShapeId: "outer" },
        { p1: { x: 200, y: 600 }, p2: { x: 0, y: 0 }, sourceShapeId: "outer" },
      ];

      // Compute exact corner intersections for inner trapezoid offset by 80 mm inward:
      // Outer bottom y = 0, top y = 600. Slanted lines: 3x - y = 0 (left), 3x + y = 3000 (right).
      // Inner bottom y = 80, top y = 520. Inward offset normal shift: 80 * sqrt(10).
      const ip1 = { x: 80 * (1 + Math.sqrt(10)) / 3, y: 80 };       // ~110.994, 80
      const ip2 = { x: (2920 - 80 * Math.sqrt(10)) / 3, y: 80 };   // ~889.006, 80
      const ip3 = { x: (2480 - 80 * Math.sqrt(10)) / 3, y: 520 };  // ~742.339, 520
      const ip4 = { x: (520 + 80 * Math.sqrt(10)) / 3, y: 520 };   // ~257.661, 520

      const innerSegs: DcelSegmentInput[] = [
        { p1: ip1, p2: ip2, sourceShapeId: "inner" },
        { p1: ip2, p2: ip3, sourceShapeId: "inner" },
        { p1: ip3, p2: ip4, sourceShapeId: "inner" },
        { p1: ip4, p2: ip1, sourceShapeId: "inner" },
      ];

      const trapezoidSegments = [...outerSegs, ...innerSegs];

      const { candidates, cards } = detectAndClusterCandidates(trapezoidSegments, {
        policy,
        maxOffsetMm: 150,
      });

      // 4 true normal offsets detected (including the two slanted walls)
      expect(candidates.length).toBe(4);
      for (const cand of candidates) {
        expect(cand.nominalValue).toBeCloseTo(80.0, 3);
      }

        // Clustered into a single 80 mm WallThickness card with 4 occurrences!
      expect(cards.length).toBe(1);
      expect(cards[0].parameterName).toBe("WallThickness");
      expect(cards[0].nominalValue).toBeCloseTo(80.0, 3);
      expect(cards[0].occurrences).toBe(4);

      // Verify that rotated trapezoid at 15°, 37°, 45°, 90° produces the EXACT same 80 mm candidates
      const rotAngles = [15, 37, 45, 90];
      for (const deg of rotAngles) {
        const rad = (deg * Math.PI) / 180;
        const rotTrapSegs = trapezoidSegments.map((s) => ({
          p1: rotatePoint(s.p1, rad),
          p2: rotatePoint(s.p2, rad),
          sourceShapeId: s.sourceShapeId,
        }));
        const rotRes = detectAndClusterCandidates(rotTrapSegs, {
          policy,
          maxOffsetMm: 150,
        });

        expect(rotRes.candidates.length).toBe(4);
        expect(rotRes.cards.length).toBe(1);
        expect(rotRes.cards[0].parameterName).toBe("WallThickness");
        expect(rotRes.cards[0].nominalValue).toBeCloseTo(80.0, 3);
        expect(rotRes.cards[0].occurrences).toBe(4);
      }
    });

    it("should detect true edge offsets for arbitrary non-convex polygonal channels (L-shaped void)", () => {
      // Outer L-shaped profile
      const outerL: DcelSegmentInput[] = [
        { p1: { x: 0, y: 0 }, p2: { x: 300, y: 0 }, sourceShapeId: "outer" },
        { p1: { x: 300, y: 0 }, p2: { x: 300, y: 100 }, sourceShapeId: "outer" },
        { p1: { x: 300, y: 100 }, p2: { x: 100, y: 100 }, sourceShapeId: "outer" },
        { p1: { x: 100, y: 100 }, p2: { x: 100, y: 300 }, sourceShapeId: "outer" },
        { p1: { x: 100, y: 300 }, p2: { x: 0, y: 300 }, sourceShapeId: "outer" },
        { p1: { x: 0, y: 300 }, p2: { x: 0, y: 0 }, sourceShapeId: "outer" },
      ];

      // Inner L-shaped cavity offset uniformly inward by 20 mm
      const innerL: DcelSegmentInput[] = [
        { p1: { x: 20, y: 20 }, p2: { x: 280, y: 20 }, sourceShapeId: "inner" },
        { p1: { x: 280, y: 20 }, p2: { x: 280, y: 80 }, sourceShapeId: "inner" },
        { p1: { x: 280, y: 80 }, p2: { x: 80, y: 80 }, sourceShapeId: "inner" },
        { p1: { x: 80, y: 80 }, p2: { x: 80, y: 280 }, sourceShapeId: "inner" },
        { p1: { x: 80, y: 280 }, p2: { x: 20, y: 280 }, sourceShapeId: "inner" },
        { p1: { x: 20, y: 280 }, p2: { x: 20, y: 20 }, sourceShapeId: "inner" },
      ];

      const lChannelSegs = [...outerL, ...innerL];
      const { candidates, cards } = detectAndClusterCandidates(lChannelSegs, {
        policy,
        maxOffsetMm: 50,
      });

      // 6 wall boundaries detected
      expect(candidates.length).toBe(6);
      for (const cand of candidates) {
        expect(cand.nominalValue).toBeCloseTo(20.0, 3);
      }

      // Clustered into a single 20 mm WallThickness card with 6 occurrences
      expect(cards.length).toBe(1);
      expect(cards[0].parameterName).toBe("WallThickness");
      expect(cards[0].nominalValue).toBeCloseTo(20.0, 3);
      expect(cards[0].occurrences).toBe(6);
    });

    it("should detect true edge offsets for rotated civil single-cell culvert voids", () => {
      const culvertPath = resolve(fixturesDir, "civil/single_cell_culvert.json");
      const segs0 = loadFixtureSegments(culvertPath, 0);

      const { candidates: c0, cards: cards0 } = detectAndClusterCandidates(segs0, {
        policy,
        maxOffsetMm: 400,
      });

      expect(c0.length).toBeGreaterThan(0);
      expect(cards0.length).toBeGreaterThan(0);

      // Rotate culvert by 37 degrees
      const segs37 = loadFixtureSegments(culvertPath, (37 * Math.PI) / 180);
      const { candidates: c37, cards: cards37 } = detectAndClusterCandidates(segs37, {
        policy,
        maxOffsetMm: 400,
      });

      expect(c37.length).toBe(c0.length);
      expect(cards37.length).toBe(cards0.length);

      // Compare sorted nominal values between 0° and 37°
      const vals0 = cards0.map((c) => c.nominalValue).sort((a, b) => a - b);
      const vals37 = cards37.map((c) => c.nominalValue).sort((a, b) => a - b);

      expect(vals37.length).toBe(vals0.length);
      for (let k = 0; k < vals0.length; k++) {
        expect(vals37[k]).toBeCloseTo(vals0[k], 3);
      }
    });
  });

  describe("Criterion 3: SVD Row-Space Admissibility Gate Integration (§32)", () => {
    it("should accept independent candidate constraints and set status to admissible", () => {
      const J = [
        [1, 0, 0, 0, 0, 0],
        [0, 1, 0, 0, 0, 0],
      ];

      const independentGrad = [0, 0, 1, 0, 0, 0];
      const evalRes = evaluateCandidateAdmissibility(J, independentGrad, 0.0, { policy });

      expect(evalRes.status).toBe("independent");
      expect(evalRes.isAdmissible).toBe(true);
      expect(evalRes.perpNorm).toBeGreaterThanOrEqual(policy.independence_eps);
    });

    it("should discard/silence redundant candidate constraints when residual < tol", () => {
      const J = [
        [1, -1, 0, 0],
        [0, 1, -1, 0],
      ];

      // Redundant gradient: row 0 + row 1 with zero residual
      const redundantGrad = [1, 0, -1, 0];
      const evalRes = evaluateCandidateAdmissibility(J, redundantGrad, 0.0, { policy });

      expect(evalRes.status).toBe("redundant");
      expect(evalRes.isAdmissible).toBe(false);
      expect(evalRes.perpNorm).toBeLessThan(policy.independence_eps);
    });

    it("should reject conflicting candidate constraints with non-zero residual and report diagnosis", () => {
      const J = [
        [1, -1, 0, 0],
        [0, 1, -1, 0],
      ];

      // Conflicting gradient: row 0 + row 1 with 15 mm conflicting residual
      const conflictingGrad = [1, 0, -1, 0];
      const evalRes = evaluateCandidateAdmissibility(J, conflictingGrad, 15.0, { policy });

      expect(evalRes.status).toBe("conflicting");
      expect(evalRes.isAdmissible).toBe(false);
      expect(evalRes.residual).toBe(15.0);
      expect(evalRes.diagnosis).toBeDefined();
      expect(evalRes.diagnosis).toContain("Conflicting constraint");
    });

    it("wires SVD admissibility directly into detectCandidatesFromDcel and detectAndClusterCandidates", () => {
      const segs = loadFixtureSegments(nestedRectFixture, 0);
      const map = DcelPlanarMap.buildFromSegments(segs, { policy });

      // First run: detect candidates with empty Jacobian -> all admissible
      const candsEmpty = detectCandidatesFromDcel(map, {
        policy,
        maxOffsetMm: 250,
        currentJacobian: [],
      });
      expect(candsEmpty.length).toBe(4);
      for (const c of candsEmpty) {
        expect(c.status).toBe("admissible");
        expect(c.gradient).toBeDefined();
      }

      // Second run: inject candidate 0 gradient as an active constraint in the Jacobian
      const activeJacobian = [candsEmpty[0].gradient!];

      // Detect again without discarding redundant
      const candsWithActive = detectCandidatesFromDcel(map, {
        policy,
        maxOffsetMm: 250,
        currentJacobian: activeJacobian,
        discardRedundant: false,
      });

      // The candidate matching active gradient is redundant
      const redCand = candsWithActive.find((c) => c.entityIds[0] === candsEmpty[0].entityIds[0]);
      expect(redCand).toBeDefined();
      expect(redCand!.status).toBe("redundant");

      // With discardRedundant: true, the redundant candidate is silently dropped per §32
      const candsSilenced = detectCandidatesFromDcel(map, {
        policy,
        maxOffsetMm: 250,
        currentJacobian: activeJacobian,
        discardRedundant: true,
      });
      expect(candsSilenced.length).toBe(3);

      // Third run: detect with conflicting residual (15 mm conflict on active constraint)
      const conflictKey = candsEmpty[0].entityIds.join("::");
      const { candidates: candsConflict, cards: cardsConflict } = detectAndClusterCandidates(map, {
        policy,
        maxOffsetMm: 250,
        currentJacobian: activeJacobian,
        candidateResiduals: { [conflictKey]: 15.0 },
      });

      const confCand = candsConflict.find((c) => c.entityIds.join("::") === conflictKey);
      expect(confCand).toBeDefined();
      expect(confCand!.status).toBe("conflicting");
      expect(confCand!.diagnosis).toContain("Conflicting constraint");
      expect(cardsConflict[0].status).toBe("conflicting");
      expect(cardsConflict[0].diagnosis).toContain("Conflicting constraint");
    });
  });

  describe("Criterion 4: Candidate Clustering and Merged Parameter Card Synthesis (§42)", () => {
    it("should collapse multiple occurrences of identical wall thickness into one parameter card", () => {
      const segs = loadFixtureSegments(nestedRectFixture, (15 * Math.PI) / 180);
      const { cards } = detectAndClusterCandidates(segs, {
        policy,
        maxOffsetMm: 200,
      });

      expect(cards).toHaveLength(1);
      const card = cards[0];
      expect(card.parameterName).toBe("WallThickness");
      expect(card.displayName).toBe("Wall Thickness");
      expect(card.occurrences).toBe(4);
      expect(card.nominalValue).toBeCloseTo(100.0, 4);
    });
  });

  describe("Criterion 5: Zero Shape-Type Branching & Tolerance Discipline (§2.4 & §2.5)", () => {
    it("verifies zero shape-type branching in inference and predicate modules", () => {
      const violations = runLint();
      const shapeBranchViolations = violations.filter(
        (v) => v.rule === "NO_SHAPE_TYPE_BRANCHING"
      );
      expect(shapeBranchViolations).toEqual([]);
    });
  });

  describe("Criterion 6: P8 Coincidence Detection on Raw Drafted Geometry", () => {
    it("detects coincident endpoints within weld tolerance on input segments and clusters them into VertexWeld cards", () => {
      const touchingSegments: DcelSegmentInput[] = [
        { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, sourceShapeId: "lineA" },
        // Endpoint p1 of lineB is 0.2 mm away from lineA.p2 (within weld_mm = 0.5 mm)
        { p1: { x: 100.2, y: 0.1 }, p2: { x: 200, y: 0 }, sourceShapeId: "lineB" },
      ];

      const { candidates, cards } = detectAndClusterCandidates(touchingSegments, { policy });

      const coincCand = candidates.find((c) => c.predicate === "P8_COINCIDENCE");
      expect(coincCand).toBeDefined();
      expect(coincCand!.nominalValue).toBeCloseTo(0.2236, 3);
      expect(coincCand!.parameterName).toBe("VertexWeld");

      const coincCard = cards.find((c) => c.predicate === "P8_COINCIDENCE");
      expect(coincCard).toBeDefined();
      expect(coincCard!.displayName).toBe("Vertex Weld");
      expect(coincCard!.nominalValue).toBeCloseTo(0.2236, 3);
    });
  });
});
