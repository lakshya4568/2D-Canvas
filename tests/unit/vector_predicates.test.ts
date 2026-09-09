import { describe, it, expect } from "vitest";
import {
  evaluateParallel,
  evaluateParallelOffset,
  evaluateCoincidence,
  evaluatePointOnLine,
  evaluateDistance,
  evaluateSegmentLength,
  evaluateEqualLength,
  evaluatePerpendicular,
  evaluateFixedEntity,
  evaluateSignedAngle,
  evaluateCornerChamfer,
  evaluateConcentricRadialOffset,
  evaluateTangencyLineCircle,
  evaluateTangencyCircleCircle,
  evaluatePointOnCircle,
  evaluateSymmetry,
  SegmentPrimitive,
  CirclePrimitive,
  ArcPrimitive,
} from "../../lib/geometry/predicates/vectorPredicates";
import { DEFAULT_TOLERANCE_POLICY, createTolerancePolicy } from "../../lib/geometry/tolerance";
import { Point2D } from "../../lib/geometry/topology/types";

function rotatePoint(pt: Point2D, angleRad: number): Point2D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: pt.x * cos - pt.y * sin,
    y: pt.x * sin + pt.y * cos,
  };
}

function rotateSegment(seg: SegmentPrimitive, angleRad: number): SegmentPrimitive {
  return {
    id: seg.id,
    start: rotatePoint(seg.start, angleRad),
    end: rotatePoint(seg.end, angleRad),
    sourceShapeId: seg.sourceShapeId,
  };
}

describe("Level-1 Vector Predicates (UPCE-MASTER-1.0 §86, Part VI)", () => {
  const policy = DEFAULT_TOLERANCE_POLICY;

  describe("P1: Parallel Predicate", () => {
    it("should detect parallel segments in canonical horizontal alignment", () => {
      const eA: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
      const eB: SegmentPrimitive = { start: { x: 0, y: 20 }, end: { x: 100, y: 20 } };

      const res = evaluateParallel(eA, eB, policy);
      expect(res.isParallel).toBe(true);
      expect(res.aligned).toBe(true);
      expect(Math.abs(res.sinTheta)).toBeLessThan(1e-12);
    });

    it("should detect parallel segments pointing in opposite directions (anti-parallel)", () => {
      const eA: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
      const eB: SegmentPrimitive = { start: { x: 100, y: 20 }, end: { x: 0, y: 20 } };

      const res = evaluateParallel(eA, eB, policy);
      expect(res.isParallel).toBe(true);
      expect(res.aligned).toBe(false);
      expect(Math.abs(res.sinTheta)).toBeLessThan(1e-12);
    });

    it("should maintain parallel detection under arbitrary rotation angles (15°, 37°, 45°, 90°, 123°)", () => {
      const eA: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 250, y: 0 } };
      const eB: SegmentPrimitive = { start: { x: 10, y: 50 }, end: { x: 260, y: 50 } };

      const anglesDeg = [15, 37, 45, 90, 123, 180, 270];
      for (const deg of anglesDeg) {
        const rad = (deg * Math.PI) / 180;
        const rotA = rotateSegment(eA, rad);
        const rotB = rotateSegment(eB, rad);

        const res = evaluateParallel(rotA, rotB, policy);
        expect(res.isParallel).toBe(true);
        expect(Math.abs(res.sinTheta)).toBeLessThan(policy.angle_rad);
      }
    });

    it("should reject non-parallel segments exceeding angle tolerance", () => {
      const eA: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
      const eB: SegmentPrimitive = { start: { x: 0, y: 20 }, end: { x: 100, y: 30 } };

      const res = evaluateParallel(eA, eB, policy);
      expect(res.isParallel).toBe(false);
    });
  });

  describe("P3: Parallel Offset Predicate (Pure Rotation-Invariant Normal Projection)", () => {
    it("should compute exact normal offset and thickness in axis-aligned configuration", () => {
      const eA: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } };
      const eB: SegmentPrimitive = { start: { x: 100, y: 300 }, end: { x: 900, y: 300 } };

      const res = evaluateParallelOffset(eA, eB, policy);
      expect(res.isOffset).toBe(true);
      expect(res.isParallel).toBe(true);
      expect(res.thickness).toBeCloseTo(300, 4);
      expect(res.nominalOffset).toBeCloseTo(300, 4);
      expect(res.deviation).toBeCloseTo(0, 4);
      expect(res.overlapLength).toBeCloseTo(800, 4);
    });

    it("should produce the EXACT same offset and thickness when rotated at 15°, 37°, 45°, 90°, 123°", () => {
      const eA: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } };
      const eB: SegmentPrimitive = { start: { x: 100, y: 300 }, end: { x: 900, y: 300 } };

      const anglesDeg = [15, 37, 45, 71, 90, 123, 215];
      for (const deg of anglesDeg) {
        const rad = (deg * Math.PI) / 180;
        const rotA = rotateSegment(eA, rad);
        const rotB = rotateSegment(eB, rad);

        const res = evaluateParallelOffset(rotA, rotB, policy);
        expect(res.isOffset).toBe(true);
        expect(res.thickness).toBeCloseTo(300, 4);
        expect(res.deviation).toBeLessThan(policy.geometry_mm);
        expect(res.overlapLength).toBeCloseTo(800, 4);
      }
    });

    it("should handle anti-parallel offset correctly (normal projection is consistent)", () => {
      const eA: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } };
      // eB points backwards from 900 to 100 at y = 150
      const eB: SegmentPrimitive = { start: { x: 900, y: 150 }, end: { x: 100, y: 150 } };

      const res = evaluateParallelOffset(eA, eB, policy);
      expect(res.isOffset).toBe(true);
      expect(res.thickness).toBeCloseTo(150, 4);
      expect(res.deviation).toBeCloseTo(0, 4);
      expect(res.overlapLength).toBeCloseTo(800, 4);
    });

    it("should reject non-parallel segments for offset", () => {
      const eA: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } };
      const eB: SegmentPrimitive = { start: { x: 0, y: 100 }, end: { x: 1000, y: 150 } };

      const res = evaluateParallelOffset(eA, eB, policy);
      expect(res.isOffset).toBe(false);
      expect(res.isParallel).toBe(false);
    });
  });

  describe("P8: Coincidence Predicate", () => {
    it("should detect coincident points within weld tolerance", () => {
      const p1: Point2D = { x: 100.2, y: 200.1 };
      const p2: Point2D = { x: 100.4, y: 200.3 };

      const res = evaluateCoincidence(p1, p2, policy);
      // dist = hypot(0.2, 0.2) = 0.2828 < 0.5 mm
      expect(res.isCoincident).toBe(true);
      expect(res.distance).toBeCloseTo(0.2828, 3);
    });

    it("should reject points outside weld tolerance", () => {
      const p1: Point2D = { x: 100.0, y: 200.0 };
      const p2: Point2D = { x: 100.6, y: 200.0 };

      const res = evaluateCoincidence(p1, p2, policy);
      expect(res.isCoincident).toBe(false);
    });
  });

  describe("Point-on-Line Predicate", () => {
    it("should detect point on interior of segment", () => {
      const edge: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 200, y: 0 } };
      const pt: Point2D = { x: 100, y: 0.1 };

      const res = evaluatePointOnLine(pt, edge, policy);
      expect(res.isOnLine).toBe(true);
      expect(res.isOnSegment).toBe(true);
      expect(res.perpendicularDistance).toBeCloseTo(0.1, 4);
      expect(res.parameterT).toBeCloseTo(0.5, 4);
    });

    it("should detect point on infinite line but outside segment", () => {
      const edge: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 200, y: 0 } };
      const pt: Point2D = { x: 350, y: 0.1 };

      const res = evaluatePointOnLine(pt, edge, policy);
      expect(res.isOnLine).toBe(true);
      expect(res.isOnSegment).toBe(false);
      expect(res.parameterT).toBeCloseTo(1.75, 4);
    });
  });

  describe("Distance & Equal Length Predicates", () => {
    it("should compute distance and equal length accurately under rotation", () => {
      const eA: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 300, y: 0 } };
      const eB: SegmentPrimitive = { start: { x: 0, y: 100 }, end: { x: 0, y: 400 } };

      const res = evaluateEqualLength(eA, eB, policy);
      expect(res.isEqual).toBe(true);
      expect(res.lengthA).toBeCloseTo(300, 4);
      expect(res.lengthB).toBeCloseTo(300, 4);
      expect(res.deltaLength).toBeCloseTo(0, 4);

      // Rotate both by 37 degrees
      const rad = (37 * Math.PI) / 180;
      const rotA = rotateSegment(eA, rad);
      const rotB = rotateSegment(eB, rad);

      const resRot = evaluateEqualLength(rotA, rotB, policy);
      expect(resRot.isEqual).toBe(true);
      expect(resRot.lengthA).toBeCloseTo(300, 4);
      expect(resRot.lengthB).toBeCloseTo(300, 4);
    });
  });

  describe("Perpendicular Predicate & Fixed Entity", () => {
    it("should detect perpendicular segments under rotation", () => {
      const eA: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 200, y: 0 } };
      const eB: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 0, y: 200 } };

      const res = evaluatePerpendicular(eA, eB, policy);
      expect(res.isPerpendicular).toBe(true);

      const rotA = rotateSegment(eA, (45 * Math.PI) / 180);
      const rotB = rotateSegment(eB, (45 * Math.PI) / 180);

      const resRot = evaluatePerpendicular(rotA, rotB, policy);
      expect(resRot.isPerpendicular).toBe(true);
    });

    it("should recognize fixed entities and anchor tags", () => {
      expect(evaluateFixedEntity({ fixed: true })).toBe(true);
      expect(evaluateFixedEntity({ tags: ["anchor", "datum"] })).toBe(true);
      expect(evaluateFixedEntity({ tags: ["guide"] })).toBe(false);
      expect(evaluateFixedEntity({})).toBe(false);
    });
  });

  describe("Level-2: Signed Angle Predicate", () => {
    it("should compute exact signed angle between oriented segments", () => {
      const eA: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
      const eB: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 0, y: 100 } };

      const res = evaluateSignedAngle(eA, eB, policy);
      expect(res.angleDeg).toBeCloseTo(90, 4);
      expect(res.isPerpendicular).toBe(true);
      expect(res.isParallel).toBe(false);
    });

    it("should maintain invariant signed angle under arbitrary rotations (15°, 37°, 45°, 90°, 123°)", () => {
      const eA: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
      const eB: SegmentPrimitive = {
        start: { x: 0, y: 0 },
        end: { x: 100 * Math.cos(Math.PI / 6), y: 100 * Math.sin(Math.PI / 6) }, // 30°
      };

      const anglesDeg = [15, 37, 45, 90, 123];
      for (const deg of anglesDeg) {
        const rad = (deg * Math.PI) / 180;
        const rotA = rotateSegment(eA, rad);
        const rotB = rotateSegment(eB, rad);

        const res = evaluateSignedAngle(rotA, rotB, policy);
        expect(res.angleDeg).toBeCloseTo(30, 3);
      }
    });
  });

  describe("Level-2: P4 Corner Chamfer Predicate (Measured Angle & Legs)", () => {
    it("should measure 45° equal-leg chamfer exactly in axis-aligned corner", () => {
      // Corner formed by edgeA (horizontal, ending at (300, 0)) and edgeB (vertical, starting at (300, 300))
      // with equal-leg chamfer from (200, 0) to (300, 100)
      const edgeA: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 200, y: 0 } };
      const chamferEdge: SegmentPrimitive = { start: { x: 200, y: 0 }, end: { x: 300, y: 100 } };
      const edgeB: SegmentPrimitive = { start: { x: 300, y: 100 }, end: { x: 300, y: 300 } };

      const res = evaluateCornerChamfer(edgeA, edgeB, chamferEdge, policy);
      expect(res.isChamfer).toBe(true);
      expect(res.isEqualLeg).toBe(true);
      expect(res.cornerAngleDeg).toBeCloseTo(90, 2);
      expect(res.angleDeg).toBeCloseTo(45, 2);
      expect(res.legA).toBeCloseTo(100, 2);
      expect(res.legB).toBeCloseTo(100, 2);
      expect(res.cornerVertex).toBeDefined();
      expect(res.cornerVertex!.x).toBeCloseTo(300, 2);
      expect(res.cornerVertex!.y).toBeCloseTo(0, 2);
    });

    it("should measure non-45° (30° and 60°) chamfers with exact leg lengths", () => {
      // 30° chamfer: dx = 100 * sqrt(3) ≈ 173.205, dy = 100
      const legA = 100 * Math.sqrt(3);
      const legB = 100;
      const corner = { x: 500, y: 0 };

      const edgeA: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: corner.x - legA, y: 0 } };
      const chamferEdge: SegmentPrimitive = {
        start: { x: corner.x - legA, y: 0 },
        end: { x: corner.x, y: legB },
      };
      const edgeB: SegmentPrimitive = { start: { x: corner.x, y: legB }, end: { x: corner.x, y: 500 } };

      const res = evaluateCornerChamfer(edgeA, edgeB, chamferEdge, policy);
      expect(res.isChamfer).toBe(true);
      expect(res.isEqualLeg).toBe(false); // 173.2 != 100
      expect(res.angleDeg).toBeCloseTo(30, 1);
      expect(res.legA).toBeCloseTo(legA, 2);
      expect(res.legB).toBeCloseTo(legB, 2);
    });

    it("should retain exact measured angle and leg lengths under arbitrary rotations (15°, 37°, 45°, 90°, 123°)", () => {
      const edgeA: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 200, y: 0 } };
      const chamferEdge: SegmentPrimitive = { start: { x: 200, y: 0 }, end: { x: 300, y: 100 } };
      const edgeB: SegmentPrimitive = { start: { x: 300, y: 100 }, end: { x: 300, y: 300 } };

      const anglesDeg = [15, 37, 45, 90, 123];
      for (const deg of anglesDeg) {
        const rad = (deg * Math.PI) / 180;
        const rotA = rotateSegment(edgeA, rad);
        const rotC = rotateSegment(chamferEdge, rad);
        const rotB = rotateSegment(edgeB, rad);

        const res = evaluateCornerChamfer(rotA, rotB, rotC, policy);
        expect(res.isChamfer).toBe(true);
        expect(res.isEqualLeg).toBe(true);
        expect(res.angleDeg).toBeCloseTo(45, 2);
        expect(res.legA).toBeCloseTo(100, 2);
        expect(res.legB).toBeCloseTo(100, 2);
      }
    });
  });

  describe("Level-2: P5 Concentric Radial Offset Predicate", () => {
    it("should detect concentric circles and measure exact radial offset", () => {
      const c1: CirclePrimitive = { center: { x: 100, y: 200 }, radius: 50 };
      const c2: CirclePrimitive = { center: { x: 100, y: 200 }, radius: 80 };

      const res = evaluateConcentricRadialOffset(c1, c2, policy);
      expect(res.isConcentric).toBe(true);
      expect(res.centerDistance).toBeCloseTo(0, 4);
      expect(res.radialOffset).toBeCloseTo(30, 4);
    });

    it("should reject non-concentric circles when centers exceed tolerance", () => {
      const c1: CirclePrimitive = { center: { x: 100, y: 200 }, radius: 50 };
      const c2: CirclePrimitive = { center: { x: 105, y: 200 }, radius: 80 };

      const res = evaluateConcentricRadialOffset(c1, c2, policy);
      expect(res.isConcentric).toBe(false);
      expect(res.centerDistance).toBeCloseTo(5, 4);
    });

    it("should maintain concentricity under rigid translation and rotation", () => {
      const anglesDeg = [15, 37, 45, 90, 123];
      for (const deg of anglesDeg) {
        const rad = (deg * Math.PI) / 180;
        const centerRot = rotatePoint({ x: 100, y: 200 }, rad);
        const c1: CirclePrimitive = { center: centerRot, radius: 45 };
        const c2: CirclePrimitive = { center: centerRot, radius: 75 };

        const res = evaluateConcentricRadialOffset(c1, c2, policy);
        expect(res.isConcentric).toBe(true);
        expect(res.radialOffset).toBeCloseTo(30, 4);
      }
    });
  });

  describe("Level-2: P6 Tangency Predicates", () => {
    it("should detect line-to-circle tangency in axis-aligned orientation", () => {
      // Line y = 0 from (0, 0) to (100, 0). Circle at (50, 25) with radius 25.
      const line: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
      const circle: CirclePrimitive = { center: { x: 50, y: 25 }, radius: 25 };

      const res = evaluateTangencyLineCircle(line, circle, policy);
      expect(res.isTangent).toBe(true);
      expect(res.isOnSegment).toBe(true);
      expect(res.deviation).toBeCloseTo(0, 4);
      expect(res.tangentPoint.x).toBeCloseTo(50, 4);
      expect(res.tangentPoint.y).toBeCloseTo(0, 4);
    });

    it("should maintain line-to-circle tangency under arbitrary rotations (15°, 37°, 45°, 90°, 123°)", () => {
      const line: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
      const circleCenter: Point2D = { x: 50, y: 25 };
      const r = 25;

      const anglesDeg = [15, 37, 45, 90, 123];
      for (const deg of anglesDeg) {
        const rad = (deg * Math.PI) / 180;
        const rotLine = rotateSegment(line, rad);
        const rotCenter = rotatePoint(circleCenter, rad);
        const rotCircle: CirclePrimitive = { center: rotCenter, radius: r };

        const res = evaluateTangencyLineCircle(rotLine, rotCircle, policy);
        expect(res.isTangent).toBe(true);
        expect(res.isOnSegment).toBe(true);
        expect(res.deviation).toBeCloseTo(0, 3);
      }
    });

    it("should detect external and internal circle-to-circle tangency", () => {
      // External: C1=(0,0), r1=30, C2=(50,0), r2=20 -> D = 50 = 30 + 20
      const c1: CirclePrimitive = { center: { x: 0, y: 0 }, radius: 30 };
      const c2Ext: CirclePrimitive = { center: { x: 50, y: 0 }, radius: 20 };

      const resExt = evaluateTangencyCircleCircle(c1, c2Ext, policy);
      expect(resExt.isTangent).toBe(true);
      expect(resExt.tangencyType).toBe("external");
      expect(resExt.deviation).toBeCloseTo(0, 4);

      // Internal: C1=(0,0), r1=50, C2=(20,0), r2=30 -> D = 20 = 50 - 30
      const c1Int: CirclePrimitive = { center: { x: 0, y: 0 }, radius: 50 };
      const c2Int: CirclePrimitive = { center: { x: 20, y: 0 }, radius: 30 };
      const resInt = evaluateTangencyCircleCircle(c1Int, c2Int, policy);
      expect(resInt.isTangent).toBe(true);
      expect(resInt.tangencyType).toBe("internal");
      expect(resInt.deviation).toBeCloseTo(0, 4);
    });
  });

  describe("Level-2: Point on Circle & Arc", () => {
    it("should detect point on circle boundary", () => {
      const circle: CirclePrimitive = { center: { x: 100, y: 100 }, radius: 50 };
      const ptOn: Point2D = { x: 100 + 50 * Math.cos(Math.PI / 4), y: 100 + 50 * Math.sin(Math.PI / 4) };
      const ptOff: Point2D = { x: 100, y: 160 };

      expect(evaluatePointOnCircle(ptOn, circle, policy).isOnCircle).toBe(true);
      expect(evaluatePointOnCircle(ptOff, circle, policy).isOnCircle).toBe(false);
    });

    it("should check arc bounds when testing point on arc", () => {
      const arc: ArcPrimitive = {
        center: { x: 0, y: 0 },
        radius: 100,
        startAngleRad: 0,
        endAngleRad: Math.PI / 2, // First quadrant [0, 90°]
      };

      const ptInArc: Point2D = { x: 100 * Math.cos(Math.PI / 4), y: 100 * Math.sin(Math.PI / 4) };
      const ptOutArc: Point2D = { x: -100, y: 0 }; // 180° (on circle, but not on arc)

      expect(evaluatePointOnCircle(ptInArc, arc, policy).isOnArc).toBe(true);
      expect(evaluatePointOnCircle(ptOutArc, arc, policy).isOnArc).toBe(false);
    });
  });

  describe("Level-2: P9 Bilateral Symmetry", () => {
    it("should evaluate bilateral symmetry across arbitrary axis line", () => {
      // Axis: y = x (diagonal line from (0,0) to (100,100))
      const axis: SegmentPrimitive = { start: { x: 0, y: 0 }, end: { x: 100, y: 100 } };
      const ptA: Point2D = { x: 10, y: 30 };
      const ptB: Point2D = { x: 30, y: 10 }; // Swapped coordinates across y = x

      const res = evaluateSymmetry(ptA, ptB, axis, policy);
      expect(res.isSymmetric).toBe(true);
      expect(res.midpointOnAxis).toBe(true);
      expect(res.reflectionDeviation).toBeCloseTo(0, 4);
    });
  });
});
