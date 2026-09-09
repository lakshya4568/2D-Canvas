import { Point2D } from "../geometry/topology/types";
import {
  evaluateCornerChamfer,
  SegmentPrimitive,
} from "../geometry/predicates/vectorPredicates";
import { DEFAULT_TOLERANCE_POLICY } from "../geometry/tolerance";

export interface RecognizedHaunch {
  startIndex: number;
  endIndex: number;
  startPoint: Point2D;
  endPoint: Point2D;
  legLength: number;
  angleDeg: number;
  signX: number;
  signY: number;
  legA?: number;
  legB?: number;
  isEqualLeg?: boolean;
}

export type RecognizedChamfer = RecognizedHaunch;

/**
 * Universal Corner Chamfer Recognition Engine (P4 Measured Angle).
 * UPCE-MASTER-1.0 §86, §5.2, Part VI (GEOM-RP/1), DEC-027.
 *
 * Measures the exact chamfer angle and leg lengths rather than assuming 45°.
 * Supports 30°, 45°, 60°, and arbitrary angle corner chamfers.
 */
export function recognizeGeneralChamfers(
  polygonVertices: Point2D[],
  options?: {
    minEdgeLength?: number;
    targetAngleDeg?: number;
    angleToleranceDeg?: number;
  }
): RecognizedChamfer[] {
  const n = polygonVertices.length;
  if (n < 3) return [];

  const minLen = options?.minEdgeLength ?? 1.0;
  const targetAngle = options?.targetAngleDeg;
  const angleTol = options?.angleToleranceDeg ?? 2.5;

  const chamfers: RecognizedChamfer[] = [];

  for (let i = 0; i < n; i++) {
    const prevIdx = (i - 1 + n) % n;
    const nextIdx = (i + 1) % n;
    const afterNextIdx = (i + 2) % n;

    const pPrev = polygonVertices[prevIdx];
    const p1 = polygonVertices[i];
    const p2 = polygonVertices[nextIdx];
    const pAfter = polygonVertices[afterNextIdx];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < minLen || absDy < minLen) continue;

    // Evaluate vector corner chamfer against adjacent edges
    const edgeA: SegmentPrimitive = { start: pPrev, end: p1 };
    const chamferEdge: SegmentPrimitive = { start: p1, end: p2 };
    const edgeB: SegmentPrimitive = { start: p2, end: pAfter };

    const p4Res = evaluateCornerChamfer(edgeA, edgeB, chamferEdge, DEFAULT_TOLERANCE_POLICY);

    let angleDeg: number;
    let legLength: number;
    let legA: number;
    let legB: number;
    let isEqualLeg: boolean;

    if (p4Res.isChamfer) {
      angleDeg = p4Res.angleDeg;
      legLength = (p4Res.legA + p4Res.legB) / 2.0;
      legA = p4Res.legA;
      legB = p4Res.legB;
      isEqualLeg = p4Res.isEqualLeg;
    } else {
      // Fallback to direct diagonal measurement
      const angleRad = Math.atan2(absDy, absDx);
      angleDeg = (angleRad * 180.0) / Math.PI;
      legLength = (absDx + absDy) / 2.0;
      legA = absDx;
      legB = absDy;
      isEqualLeg = Math.abs(absDx - absDy) < DEFAULT_TOLERANCE_POLICY.geometry_mm;
    }

    if (targetAngle !== undefined) {
      if (Math.abs(angleDeg - targetAngle) > angleTol) {
        continue;
      }
    }

    chamfers.push({
      startIndex: i,
      endIndex: nextIdx,
      startPoint: { ...p1 },
      endPoint: { ...p2 },
      legLength,
      angleDeg,
      signX: dx >= 0 ? 1 : -1,
      signY: dy >= 0 ? 1 : -1,
      legA,
      legB,
      isEqualLeg,
    });
  }

  return chamfers;
}

/**
 * @deprecated Use recognizeGeneralChamfers or evaluateCornerChamfer per UPCE-MASTER-1.0 §5.2 / DEC-027.
 * Kept for backward compatibility.
 */
export function recognizeHaunches(
  polygonVertices: Point2D[],
  angleToleranceDeg: number = 2.5,
  targetAngleDeg?: number
): RecognizedHaunch[] {
  return recognizeGeneralChamfers(polygonVertices, {
    angleToleranceDeg,
    targetAngleDeg,
  });
}
