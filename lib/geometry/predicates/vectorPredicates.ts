/**
 * Level-1 Vector Predicates per UPCE-MASTER-1.0 §86, §5.2, Part VI (GEOM-RP/1)
 *
 * All predicates are strictly rotation-invariant, operating purely on dot products,
 * cross products, and vector distances. Axis-aligned bounding boxes (AABBs) and
 * shape-type branching are strictly forbidden.
 *
 * Tolerances are injected exclusively via TolerancePolicy.
 */

import { Point2D } from "../topology/types";
import { TolerancePolicy, DEFAULT_TOLERANCE_POLICY } from "../tolerance";

export interface SegmentPrimitive {
  id?: string;
  start: Point2D;
  end: Point2D;
  sourceShapeId?: string;
  tags?: string[];
}

export interface ParallelPredicateResult {
  isParallel: boolean;
  sinTheta: number;
  cosTheta: number;
  angleRad: number;
  aligned: boolean; // true if dA . dB > 0, false if anti-parallel (dA . dB < 0)
}

export interface ParallelOffsetPredicateResult {
  isOffset: boolean;
  isParallel: boolean;
  offsetStart: number;
  offsetEnd: number;
  nominalOffset: number; // average signed normal projection
  thickness: number;     // absolute wall thickness |nominalOffset|
  deviation: number;     // |offsetStart - offsetEnd|
  overlapLength: number; // longitudinal overlap along edge direction
  aligned: boolean;
}

export interface CoincidencePredicateResult {
  isCoincident: boolean;
  distance: number;
}

export interface PointOnLineResult {
  isOnLine: boolean;
  isOnSegment: boolean;
  perpendicularDistance: number;
  parameterT: number;
  projectedPoint: Point2D;
  projectedSegmentPoint: Point2D;
}

export interface EqualLengthResult {
  isEqual: boolean;
  lengthA: number;
  lengthB: number;
  deltaLength: number;
}

export interface PerpendicularResult {
  isPerpendicular: boolean;
  cosTheta: number;
  angleRad: number;
}

export interface CirclePrimitive {
  id?: string;
  center: Point2D;
  radius: number;
  sourceShapeId?: string;
  tags?: string[];
}

export interface ArcPrimitive extends CirclePrimitive {
  startAngleRad: number;
  endAngleRad: number;
  ccw?: boolean;
}

export interface SignedAngleResult {
  angleRad: number; // atan2(dA x dB, dA . dB) in (-pi, pi]
  angleDeg: number;
  isParallel: boolean;
  isPerpendicular: boolean;
  cosTheta: number;
  sinTheta: number;
}

export interface CornerChamferPredicateResult {
  isChamfer: boolean;
  isEqualLeg: boolean;
  angleRad: number;       // Measured chamfer angle relative to edge A
  angleDeg: number;
  legA: number;           // Leg length along edge A
  legB: number;           // Leg length along edge B
  legDelta: number;       // ||legA| - |legB||
  cornerAngleRad: number; // Angle between edge A and edge B lines
  cornerAngleDeg: number;
  cornerVertex?: Point2D; // Intersection of parent edge lines
}

export interface ConcentricPredicateResult {
  isConcentric: boolean;
  centerDistance: number;
  radialOffset: number;   // |rA - rB|
  radiusA: number;
  radiusB: number;
}

export interface TangencyLineCircleResult {
  isTangent: boolean;
  isOnSegment: boolean;
  perpendicularDistance: number;
  deviation: number;      // ||dist| - radius|
  tangentPoint: Point2D;
  parameterT: number;     // Projection parameter along edge
}

export interface TangencyCircleCircleResult {
  isTangent: boolean;
  tangencyType: "external" | "internal" | "none";
  centerDistance: number;
  nominalDistance: number;
  deviation: number;
}

export interface PointOnCircleResult {
  isOnCircle: boolean;
  isOnArc: boolean;
  radialDistance: number;
  radialDeviation: number; // |dist - radius|
  polarAngleRad: number;
}

export interface SymmetryPredicateResult {
  isSymmetric: boolean;
  distanceAtoAxis: number;
  distanceBtoAxis: number;
  reflectionDeviation: number; // ||A' - B||
  midpointOnAxis: boolean;
}

/**
 * Computes the 2D Euclidean length of a vector [dx, dy].
 */
export function vectorLength(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

/**
 * Computes the 2D cross product scalar (A x B) = Ax * By - Ay * Bx.
 */
export function crossProduct2D(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/**
 * Computes the 2D dot product (A . B) = Ax * Bx + Ay * By.
 */
export function dotProduct2D(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

/**
 * P1 — Parallel Predicate (edge A, edge B)
 * |d̂_A × d̂_B| < ε_angle (using TolerancePolicy.angle_rad)
 */
export function evaluateParallel(
  edgeA: SegmentPrimitive,
  edgeB: SegmentPrimitive,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): ParallelPredicateResult {
  const dAx = edgeA.end.x - edgeA.start.x;
  const dAy = edgeA.end.y - edgeA.start.y;
  const lenA = Math.hypot(dAx, dAy);

  const dBx = edgeB.end.x - edgeB.start.x;
  const dBy = edgeB.end.y - edgeB.start.y;
  const lenB = Math.hypot(dBx, dBy);

  if (lenA < policy.geometry_mm || lenB < policy.geometry_mm) {
    return {
      isParallel: false,
      sinTheta: 1,
      cosTheta: 0,
      angleRad: Math.PI / 2,
      aligned: false,
    };
  }

  const uAx = dAx / lenA;
  const uAy = dAy / lenA;
  const uBx = dBx / lenB;
  const uBy = dBy / lenB;

  const cross = crossProduct2D(uAx, uAy, uBx, uBy);
  const dot = dotProduct2D(uAx, uAy, uBx, uBy);

  const sinTheta = cross;
  const cosTheta = Math.max(-1, Math.min(1, dot));
  const angleRad = Math.asin(Math.max(-1, Math.min(1, Math.abs(sinTheta))));

  const isParallel = Math.abs(sinTheta) < policy.angle_rad;

  return {
    isParallel,
    sinTheta,
    cosTheta,
    angleRad,
    aligned: dot >= 0,
  };
}

/**
 * P3 — Parallel Offset Predicate (edge A, edge B)
 * Pure rotation-invariant normal projection:
 * n̂_A = [-uAy, uAx]
 * offset_start = (B.start - A.start) · n̂_A
 * offset_end   = (B.end   - A.start) · n̂_A
 * Consistent if |offset_start - offset_end| < ε_dist (using TolerancePolicy.geometry_mm)
 */
export function evaluateParallelOffset(
  edgeA: SegmentPrimitive,
  edgeB: SegmentPrimitive,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): ParallelOffsetPredicateResult {
  const dAx = edgeA.end.x - edgeA.start.x;
  const dAy = edgeA.end.y - edgeA.start.y;
  const lenA = Math.hypot(dAx, dAy);

  if (lenA < policy.geometry_mm) {
    return {
      isOffset: false,
      isParallel: false,
      offsetStart: 0,
      offsetEnd: 0,
      nominalOffset: 0,
      thickness: 0,
      deviation: Infinity,
      overlapLength: 0,
      aligned: false,
    };
  }

  // Check parallel first
  const parRes = evaluateParallel(edgeA, edgeB, policy);
  if (!parRes.isParallel) {
    return {
      isOffset: false,
      isParallel: false,
      offsetStart: 0,
      offsetEnd: 0,
      nominalOffset: 0,
      thickness: 0,
      deviation: Infinity,
      overlapLength: 0,
      aligned: parRes.aligned,
    };
  }

  const uAx = dAx / lenA;
  const uAy = dAy / lenA;

  // Unit normal: n̂_A = [-uAy, uAx] (90° CCW rotation)
  const nAx = -uAy;
  const nAy = uAx;

  // Relative vectors from A.start
  const rStart_x = edgeB.start.x - edgeA.start.x;
  const rStart_y = edgeB.start.y - edgeA.start.y;
  const rEnd_x = edgeB.end.x - edgeA.start.x;
  const rEnd_y = edgeB.end.y - edgeA.start.y;

  // Normal projections
  const offsetStart = dotProduct2D(rStart_x, rStart_y, nAx, nAy);
  const offsetEnd = dotProduct2D(rEnd_x, rEnd_y, nAx, nAy);

  const deviation = Math.abs(offsetStart - offsetEnd);
  const isOffset = deviation < policy.geometry_mm;

  const nominalOffset = (offsetStart + offsetEnd) / 2.0;
  const thickness = Math.abs(nominalOffset);

  // Longitudinal projections along uA to measure overlap
  const tStartB = dotProduct2D(rStart_x, rStart_y, uAx, uAy);
  const tEndB = dotProduct2D(rEnd_x, rEnd_y, uAx, uAy);

  const bMin = Math.min(tStartB, tEndB);
  const bMax = Math.max(tStartB, tEndB);

  const overlapMin = Math.max(0, bMin);
  const overlapMax = Math.min(lenA, bMax);
  const overlapLength = Math.max(0, overlapMax - overlapMin);

  return {
    isOffset,
    isParallel: true,
    offsetStart,
    offsetEnd,
    nominalOffset,
    thickness,
    deviation,
    overlapLength,
    aligned: parRes.aligned,
  };
}

/**
 * P8 — Coincidence Predicate (point A, point B)
 * ‖P_A - P_B‖ < ε_weld (using TolerancePolicy.weld_mm)
 */
export function evaluateCoincidence(
  ptA: Point2D,
  ptB: Point2D,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): CoincidencePredicateResult {
  const dist = Math.hypot(ptA.x - ptB.x, ptA.y - ptB.y);
  return {
    isCoincident: dist < policy.weld_mm,
    distance: dist,
  };
}

/**
 * Point-on-Line Predicate (point P, edge A)
 * Evaluates whether point P lies along the line or line segment.
 */
export function evaluatePointOnLine(
  point: Point2D,
  edge: SegmentPrimitive,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): PointOnLineResult {
  const dx = edge.end.x - edge.start.x;
  const dy = edge.end.y - edge.start.y;
  const len = Math.hypot(dx, dy);

  if (len < policy.geometry_mm) {
    const dist = Math.hypot(point.x - edge.start.x, point.y - edge.start.y);
    return {
      isOnLine: dist < policy.geometry_mm,
      isOnSegment: dist < policy.geometry_mm,
      perpendicularDistance: dist,
      parameterT: 0,
      projectedPoint: { x: edge.start.x, y: edge.start.y },
      projectedSegmentPoint: { x: edge.start.x, y: edge.start.y },
    };
  }

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  const rx = point.x - edge.start.x;
  const ry = point.y - edge.start.y;

  const perpDist = Math.abs(dotProduct2D(rx, ry, nx, ny));
  const t = dotProduct2D(rx, ry, ux, uy);

  const isOnLine = perpDist < policy.geometry_mm;
  const isOnSegment = isOnLine && t >= -policy.geometry_mm && t <= len + policy.geometry_mm;

  const clampedT = Math.max(0, Math.min(len, t));
  const projectedPoint: Point2D = {
    x: edge.start.x + ux * t,
    y: edge.start.y + uy * t,
  };
  const projectedSegmentPoint: Point2D = {
    x: edge.start.x + ux * clampedT,
    y: edge.start.y + uy * clampedT,
  };

  return {
    isOnLine,
    isOnSegment,
    perpendicularDistance: perpDist,
    parameterT: t / len,
    projectedPoint,
    projectedSegmentPoint,
  };
}

/**
 * Distance Predicate: Computes Euclidean distance between two points.
 */
export function evaluateDistance(ptA: Point2D, ptB: Point2D): number {
  return Math.hypot(ptA.x - ptB.x, ptA.y - ptB.y);
}

/**
 * Segment Length Predicate: Computes length of an edge segment.
 */
export function evaluateSegmentLength(edge: SegmentPrimitive): number {
  return Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y);
}

/**
 * Equal Length Predicate: |len(A) - len(B)| < ε_dist
 */
export function evaluateEqualLength(
  edgeA: SegmentPrimitive,
  edgeB: SegmentPrimitive,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): EqualLengthResult {
  const lenA = evaluateSegmentLength(edgeA);
  const lenB = evaluateSegmentLength(edgeB);
  const deltaLength = Math.abs(lenA - lenB);
  return {
    isEqual: deltaLength < policy.geometry_mm,
    lengthA: lenA,
    lengthB: lenB,
    deltaLength,
  };
}

/**
 * Fixed Entity Predicate: checks if an entity has fixed coordinates or anchor tag.
 */
export function evaluateFixedEntity(entity: { fixed?: boolean; tags?: string[] }): boolean {
  if (entity.fixed === true) return true;
  if (entity.tags && entity.tags.includes("anchor")) return true;
  return false;
}

/**
 * P2 — Perpendicular Predicate (edge A, edge B)
 * |d̂_A · d̂_B| < ε_angle (using TolerancePolicy.angle_rad)
 */
export function evaluatePerpendicular(
  edgeA: SegmentPrimitive,
  edgeB: SegmentPrimitive,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): PerpendicularResult {
  const dAx = edgeA.end.x - edgeA.start.x;
  const dAy = edgeA.end.y - edgeA.start.y;
  const lenA = Math.hypot(dAx, dAy);

  const dBx = edgeB.end.x - edgeB.start.x;
  const dBy = edgeB.end.y - edgeB.start.y;
  const lenB = Math.hypot(dBx, dBy);

  if (lenA < policy.geometry_mm || lenB < policy.geometry_mm) {
    return {
      isPerpendicular: false,
      cosTheta: 1,
      angleRad: 0,
    };
  }

  const uAx = dAx / lenA;
  const uAy = dAy / lenA;
  const uBx = dBx / lenB;
  const uBy = dBy / lenB;

  const dot = dotProduct2D(uAx, uAy, uBx, uBy);
  const isPerpendicular = Math.abs(dot) < policy.angle_rad;
  const angleRad = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot))));

  return {
    isPerpendicular,
    cosTheta: dot,
    angleRad,
  };
}

/**
 * Computes signed angle from edgeA to edgeB:
 * θ = atan2(dA × dB, dA · dB) in (-π, π]
 */
export function evaluateSignedAngle(
  edgeA: SegmentPrimitive,
  edgeB: SegmentPrimitive,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): SignedAngleResult {
  const dAx = edgeA.end.x - edgeA.start.x;
  const dAy = edgeA.end.y - edgeA.start.y;
  const lenA = Math.hypot(dAx, dAy);

  const dBx = edgeB.end.x - edgeB.start.x;
  const dBy = edgeB.end.y - edgeB.start.y;
  const lenB = Math.hypot(dBx, dBy);

  if (lenA < policy.geometry_mm || lenB < policy.geometry_mm) {
    return {
      angleRad: 0,
      angleDeg: 0,
      isParallel: false,
      isPerpendicular: false,
      cosTheta: 1,
      sinTheta: 0,
    };
  }

  const uAx = dAx / lenA;
  const uAy = dAy / lenA;
  const uBx = dBx / lenB;
  const uBy = dBy / lenB;

  const cross = crossProduct2D(uAx, uAy, uBx, uBy);
  const dot = dotProduct2D(uAx, uAy, uBx, uBy);

  const angleRad = Math.atan2(cross, dot);
  const angleDeg = (angleRad * 180.0) / Math.PI;

  const isParallel = Math.abs(cross) < policy.angle_rad;
  const isPerpendicular = Math.abs(dot) < policy.angle_rad;

  return {
    angleRad,
    angleDeg,
    isParallel,
    isPerpendicular,
    cosTheta: dot,
    sinTheta: cross,
  };
}

/**
 * P4 — Corner with Chamfer (edge A, edge B, connecting chamfer edge C)
 * UPCE-MASTER-1.0 §5.2, Part VI (GEOM-RP/1)
 *
 * Replaces hardcoded 45° check by extracting the actual measured angle:
 * θ_C = atan2(|dC × ûA|, |dC · ûA|)
 * Leg projections:
 * legA = projection along edge A towards/from corner
 * legB = projection along edge B towards/from corner
 * Equal-leg condition: ||legA| - |legB|| < ε_dist
 */
export function evaluateCornerChamfer(
  edgeA: SegmentPrimitive,
  edgeB: SegmentPrimitive,
  chamferEdge: SegmentPrimitive,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): CornerChamferPredicateResult {
  const dAx = edgeA.end.x - edgeA.start.x;
  const dAy = edgeA.end.y - edgeA.start.y;
  const lenA = Math.hypot(dAx, dAy);

  const dBx = edgeB.end.x - edgeB.start.x;
  const dBy = edgeB.end.y - edgeB.start.y;
  const lenB = Math.hypot(dBx, dBy);

  const dCx = chamferEdge.end.x - chamferEdge.start.x;
  const dCy = chamferEdge.end.y - chamferEdge.start.y;
  const lenC = Math.hypot(dCx, dCy);

  if (lenA < policy.geometry_mm || lenB < policy.geometry_mm || lenC < policy.geometry_mm) {
    return {
      isChamfer: false,
      isEqualLeg: false,
      angleRad: 0,
      angleDeg: 0,
      legA: 0,
      legB: 0,
      legDelta: Infinity,
      cornerAngleRad: 0,
      cornerAngleDeg: 0,
    };
  }

  const uAx = dAx / lenA;
  const uAy = dAy / lenA;
  const uBx = dBx / lenB;
  const uBy = dBy / lenB;

  // Corner angle between lines of edge A and edge B
  const cornerCross = crossProduct2D(uAx, uAy, uBx, uBy);
  const cornerDot = dotProduct2D(uAx, uAy, uBx, uBy);

  // If edge A and edge B are parallel, they cannot form a corner
  if (Math.abs(cornerCross) < policy.angle_rad) {
    return {
      isChamfer: false,
      isEqualLeg: false,
      angleRad: 0,
      angleDeg: 0,
      legA: 0,
      legB: 0,
      legDelta: Infinity,
      cornerAngleRad: 0,
      cornerAngleDeg: 0,
    };
  }

  // Calculate intersection of infinite lines A and B to find virtual corner vertex:
  // edgeA.start + s * uA = edgeB.start + t * uB
  // s * (uA x uB) = (edgeB.start - edgeA.start) x uB
  const dxAB = edgeB.start.x - edgeA.start.x;
  const dyAB = edgeB.start.y - edgeA.start.y;
  const s = crossProduct2D(dxAB, dyAB, uBx, uBy) / cornerCross;
  const cornerVertex: Point2D = {
    x: edgeA.start.x + s * uAx,
    y: edgeA.start.y + s * uAy,
  };

  // Determine which end of chamfer attaches to A and which to B:
  const distStartA = Math.min(
    Math.hypot(chamferEdge.start.x - edgeA.start.x, chamferEdge.start.y - edgeA.start.y),
    Math.hypot(chamferEdge.start.x - edgeA.end.x, chamferEdge.start.y - edgeA.end.y)
  );
  const distEndA = Math.min(
    Math.hypot(chamferEdge.end.x - edgeA.start.x, chamferEdge.end.y - edgeA.end.y),
    Math.hypot(chamferEdge.end.x - edgeA.end.x, chamferEdge.end.y - edgeA.end.y)
  );

  let ptOnA: Point2D;
  let ptOnB: Point2D;
  if (distStartA <= distEndA) {
    ptOnA = chamferEdge.start;
    ptOnB = chamferEdge.end;
  } else {
    ptOnA = chamferEdge.end;
    ptOnB = chamferEdge.start;
  }

  // Leg lengths: distance from virtual corner to each chamfer endpoint along that line
  const legA = Math.hypot(ptOnA.x - cornerVertex.x, ptOnA.y - cornerVertex.y);
  const legB = Math.hypot(ptOnB.x - cornerVertex.x, ptOnB.y - cornerVertex.y);
  const legDelta = Math.abs(legA - legB);

  // Chamfer vector pointing from A-side to B-side
  const vCx = ptOnB.x - ptOnA.x;
  const vCy = ptOnB.y - ptOnA.y;

  // Direction of edge A towards corner
  const dirAx = cornerVertex.x - ptOnA.x;
  const dirAy = cornerVertex.y - ptOnA.y;
  const lenDirA = Math.hypot(dirAx, dirAy) + 1e-15;
  const uCornerAx = dirAx / lenDirA;
  const uCornerAy = dirAy / lenDirA;

  // Measured acute angle of chamfer with respect to edge A direction:
  const cDotA = Math.abs(dotProduct2D(vCx, vCy, uCornerAx, uCornerAy));
  const cCrossA = Math.abs(crossProduct2D(vCx, vCy, uCornerAx, uCornerAy));
  const angleRad = Math.atan2(cCrossA, cDotA);
  const angleDeg = (angleRad * 180.0) / Math.PI;

  const cornerAngleRad = Math.atan2(Math.abs(cornerCross), Math.abs(cornerDot));
  const cornerAngleDeg = (cornerAngleRad * 180.0) / Math.PI;

  const isEqualLeg = legDelta < policy.geometry_mm;
  const isChamfer = lenC >= policy.geometry_mm && legA >= policy.geometry_mm && legB >= policy.geometry_mm;

  return {
    isChamfer,
    isEqualLeg,
    angleRad,
    angleDeg,
    legA,
    legB,
    legDelta,
    cornerAngleRad,
    cornerAngleDeg,
    cornerVertex,
  };
}

/**
 * P5 — Concentric Radial Offset Predicate (circle/arc A, circle/arc B)
 * UPCE-MASTER-1.0 §5.2, Part VI (GEOM-RP/1)
 *
 * Concentric if ||C_A - C_B|| < ε_dist (using TolerancePolicy.geometry_mm).
 * Radial offset = |r_A - r_B|.
 */
export function evaluateConcentricRadialOffset(
  circleA: CirclePrimitive,
  circleB: CirclePrimitive,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): ConcentricPredicateResult {
  const centerDistance = Math.hypot(
    circleA.center.x - circleB.center.x,
    circleA.center.y - circleB.center.y
  );
  const isConcentric = centerDistance < policy.geometry_mm;
  const radialOffset = Math.abs(circleA.radius - circleB.radius);

  return {
    isConcentric,
    centerDistance,
    radialOffset,
    radiusA: circleA.radius,
    radiusB: circleB.radius,
  };
}

/**
 * P6 — Line-to-Circle Tangency Predicate
 * UPCE-MASTER-1.0 §5.2, Part VI (GEOM-RP/1)
 *
 * dist = |(C - edge.start) × d̂_edge|
 * Tangent if |dist - r| < ε_dist.
 */
export function evaluateTangencyLineCircle(
  edge: SegmentPrimitive,
  circle: CirclePrimitive,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): TangencyLineCircleResult {
  const dx = edge.end.x - edge.start.x;
  const dy = edge.end.y - edge.start.y;
  const len = Math.hypot(dx, dy);

  if (len < policy.geometry_mm) {
    const d = Math.hypot(circle.center.x - edge.start.x, circle.center.y - edge.start.y);
    return {
      isTangent: Math.abs(d - circle.radius) < policy.geometry_mm,
      isOnSegment: false,
      perpendicularDistance: d,
      deviation: Math.abs(d - circle.radius),
      tangentPoint: { ...edge.start },
      parameterT: 0,
    };
  }

  const ux = dx / len;
  const uy = dy / len;

  const rx = circle.center.x - edge.start.x;
  const ry = circle.center.y - edge.start.y;

  const t = dotProduct2D(rx, ry, ux, uy);
  const perpDist = Math.abs(crossProduct2D(rx, ry, ux, uy));
  const deviation = Math.abs(perpDist - circle.radius);
  const isTangent = deviation < policy.geometry_mm;

  const isOnSegment =
    isTangent && t >= -policy.geometry_mm && t <= len + policy.geometry_mm;

  const tangentPoint: Point2D = {
    x: edge.start.x + ux * t,
    y: edge.start.y + uy * t,
  };

  return {
    isTangent,
    isOnSegment,
    perpendicularDistance: perpDist,
    deviation,
    tangentPoint,
    parameterT: t / len,
  };
}

/**
 * P6 — Circle-to-Circle Tangency Predicate
 * UPCE-MASTER-1.0 §5.2, Part VI (GEOM-RP/1)
 *
 * External tangency: ||C_A - C_B|| - (r_A + r_B) ≈ 0
 * Internal tangency: ||C_A - C_B|| - |r_A - r_B| ≈ 0
 */
export function evaluateTangencyCircleCircle(
  circleA: CirclePrimitive,
  circleB: CirclePrimitive,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): TangencyCircleCircleResult {
  const centerDistance = Math.hypot(
    circleA.center.x - circleB.center.x,
    circleA.center.y - circleB.center.y
  );

  const rA = circleA.radius;
  const rB = circleB.radius;

  const extNominal = rA + rB;
  const extDev = Math.abs(centerDistance - extNominal);

  const intNominal = Math.abs(rA - rB);
  const intDev = Math.abs(centerDistance - intNominal);

  if (extDev < policy.geometry_mm) {
    return {
      isTangent: true,
      tangencyType: "external",
      centerDistance,
      nominalDistance: extNominal,
      deviation: extDev,
    };
  }

  // Exclude concentric circles where centerDistance is near 0
  if (intDev < policy.geometry_mm && centerDistance >= policy.geometry_mm) {
    return {
      isTangent: true,
      tangencyType: "internal",
      centerDistance,
      nominalDistance: intNominal,
      deviation: intDev,
    };
  }

  return {
    isTangent: false,
    tangencyType: "none",
    centerDistance,
    nominalDistance: extNominal,
    deviation: Math.min(extDev, intDev),
  };
}

/**
 * Point-on-Circle / Point-on-Arc Predicate
 */
export function evaluatePointOnCircle(
  point: Point2D,
  circle: CirclePrimitive | ArcPrimitive,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): PointOnCircleResult {
  const dx = point.x - circle.center.x;
  const dy = point.y - circle.center.y;
  const radialDistance = Math.hypot(dx, dy);
  const radialDeviation = Math.abs(radialDistance - circle.radius);
  const isOnCircle = radialDeviation < policy.geometry_mm;

  const polarAngleRad = Math.atan2(dy, dx);
  let isOnArc = isOnCircle;

  if ("startAngleRad" in circle && "endAngleRad" in circle) {
    const arc = circle as ArcPrimitive;
    const twoPi = 2 * Math.PI;
    let normAngle = (polarAngleRad - arc.startAngleRad) % twoPi;
    if (normAngle < 0) normAngle += twoPi;

    let sweep = (arc.endAngleRad - arc.startAngleRad) % twoPi;
    if (sweep < 0) sweep += twoPi;
    if (sweep === 0 && arc.startAngleRad !== arc.endAngleRad) sweep = twoPi;

    isOnArc = isOnCircle && normAngle <= sweep + policy.angle_rad;
  }

  return {
    isOnCircle,
    isOnArc,
    radialDistance,
    radialDeviation,
    polarAngleRad,
  };
}

/**
 * P9 — Bilateral Symmetry Predicate about an Axis
 * UPCE-MASTER-1.0 §5.2, Part VI (GEOM-RP/1)
 *
 * Reflection matrix about axis through origin with unit normal n̂:
 * R = I - 2 n̂ n̂^T
 * Reflect: A' = O + R(A - O)
 * Symmetric if ||A' - B|| < ε_dist.
 */
export function evaluateSymmetry(
  ptA: Point2D,
  ptB: Point2D,
  axisEdge: SegmentPrimitive,
  policy: TolerancePolicy = DEFAULT_TOLERANCE_POLICY
): SymmetryPredicateResult {
  const dx = axisEdge.end.x - axisEdge.start.x;
  const dy = axisEdge.end.y - axisEdge.start.y;
  const len = Math.hypot(dx, dy);

  if (len < policy.geometry_mm) {
    return {
      isSymmetric: false,
      distanceAtoAxis: 0,
      distanceBtoAxis: 0,
      reflectionDeviation: Infinity,
      midpointOnAxis: false,
    };
  }

  const ux = dx / len;
  const uy = dy / len;
  // Unit normal n = [-uy, ux]
  const nx = -uy;
  const ny = ux;

  // Distance of ptA and ptB from axis
  const rAx = ptA.x - axisEdge.start.x;
  const rAy = ptA.y - axisEdge.start.y;
  const rBx = ptB.x - axisEdge.start.x;
  const rBy = ptB.y - axisEdge.start.y;

  const distA = dotProduct2D(rAx, rAy, nx, ny);
  const distB = dotProduct2D(rBx, rBy, nx, ny);

  // Midpoint M = (A + B) / 2
  const mx = 0.5 * (ptA.x + ptB.x) - axisEdge.start.x;
  const my = 0.5 * (ptA.y + ptB.y) - axisEdge.start.y;
  const distMid = Math.abs(dotProduct2D(mx, my, nx, ny));
  const midpointOnAxis = distMid < policy.geometry_mm;

  // Reflected A': A' = ptA - 2 * (rA · n) * n
  const refA_x = ptA.x - 2.0 * distA * nx;
  const refA_y = ptA.y - 2.0 * distA * ny;

  const reflectionDeviation = Math.hypot(refA_x - ptB.x, refA_y - ptB.y);
  const isSymmetric = reflectionDeviation < policy.geometry_mm;

  return {
    isSymmetric,
    distanceAtoAxis: Math.abs(distA),
    distanceBtoAxis: Math.abs(distB),
    reflectionDeviation,
    midpointOnAxis,
  };
}

