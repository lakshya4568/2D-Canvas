import { Point2D } from "../topology/types";

export interface ArcInput {
  center: Point2D;
  radius: number;
  startAngleRad: number;
  endAngleRad: number;
  ccw?: boolean; // Default true (counter-clockwise)
}

export interface ArcMetricsResult {
  center: Point2D;
  radius: number;
  startAngleRad: number;
  endAngleRad: number;
  sweepAngleRad: number;
  sweepAngleDeg: number;
  arcLength: number;
  chordLength: number;
  sagitta: number;
  startPoint: Point2D;
  endPoint: Point2D;
  midpoint: Point2D;
  chordMidpoint: Point2D;
  startTangent: Point2D; // Unit vector in travel direction
  endTangent: Point2D;   // Unit vector in travel direction
  startNormal: Point2D;  // Unit outward radial normal
  endNormal: Point2D;    // Unit outward radial normal
  isCCW: boolean;
}

/**
 * Calculates arc length given radius and sweep angle (in radians).
 * L = r * |deltaTheta|
 */
export function arcLength(radius: number, sweepAngleRad: number): number {
  return Math.abs(radius * sweepAngleRad);
}

/**
 * Calculates chord length between endpoints:
 * C = 2 * r * sin(|deltaTheta| / 2)
 */
export function chordLength(radius: number, sweepAngleRad: number): number {
  return Math.abs(2 * radius * Math.sin(Math.abs(sweepAngleRad) / 2));
}

/**
 * Calculates sagitta (height of the circular arc above the chord):
 * S = r * (1 - cos(|deltaTheta| / 2))
 */
export function sagitta(radius: number, sweepAngleRad: number): number {
  return Math.abs(radius * (1 - Math.cos(Math.abs(sweepAngleRad) / 2)));
}

/**
 * Calculates unit tangent vector at a given polar angle along the arc.
 * Tangent points in the direction of traversal (CCW or CW).
 */
export function arcTangentVector(angleRad: number, ccw: boolean = true): Point2D {
  if (ccw) {
    return {
      x: -Math.sin(angleRad),
      y: Math.cos(angleRad),
    };
  } else {
    return {
      x: Math.sin(angleRad),
      y: -Math.cos(angleRad),
    };
  }
}

/**
 * Calculates unit outward radial normal vector at a given polar angle:
 * N = (cos(theta), sin(theta))
 */
export function arcNormalVector(angleRad: number): Point2D {
  return {
    x: Math.cos(angleRad),
    y: Math.sin(angleRad),
  };
}

/**
 * Normalizes sweep angle into the positive range [0, 2*PI).
 */
export function normalizeSweepAngle(
  startAngleRad: number,
  endAngleRad: number,
  ccw: boolean = true
): number {
  const twoPi = 2 * Math.PI;
  let diff = ccw ? endAngleRad - startAngleRad : startAngleRad - endAngleRad;

  diff = diff % twoPi;
  if (diff < 0) diff += twoPi;
  if (diff === 0 && startAngleRad !== endAngleRad) diff = twoPi;

  return diff;
}

/**
 * Computes comprehensive geometric metrics for an arc:
 * arc length, chord length, sagitta, boundary tangent vectors, and midpoints.
 */
export function computeArcMetrics(input: ArcInput): ArcMetricsResult {
  const ccw = input.ccw ?? true;
  const radius = Math.abs(input.radius);
  const sweepAngleRad = normalizeSweepAngle(input.startAngleRad, input.endAngleRad, ccw);
  const sweepAngleDeg = (sweepAngleRad * 180) / Math.PI;

  const len = arcLength(radius, sweepAngleRad);
  const chord = chordLength(radius, sweepAngleRad);
  const sag = sagitta(radius, sweepAngleRad);

  const startPoint: Point2D = {
    x: input.center.x + radius * Math.cos(input.startAngleRad),
    y: input.center.y + radius * Math.sin(input.startAngleRad),
  };

  const endPoint: Point2D = {
    x: input.center.x + radius * Math.cos(input.endAngleRad),
    y: input.center.y + radius * Math.sin(input.endAngleRad),
  };

  const midAngle = ccw
    ? input.startAngleRad + sweepAngleRad / 2
    : input.startAngleRad - sweepAngleRad / 2;

  const midpoint: Point2D = {
    x: input.center.x + radius * Math.cos(midAngle),
    y: input.center.y + radius * Math.sin(midAngle),
  };

  const chordMidpoint: Point2D = {
    x: (startPoint.x + endPoint.x) / 2,
    y: (startPoint.y + endPoint.y) / 2,
  };

  const startTangent = arcTangentVector(input.startAngleRad, ccw);
  const endTangent = arcTangentVector(input.endAngleRad, ccw);
  const startNormal = arcNormalVector(input.startAngleRad);
  const endNormal = arcNormalVector(input.endAngleRad);

  return {
    center: { ...input.center },
    radius,
    startAngleRad: input.startAngleRad,
    endAngleRad: input.endAngleRad,
    sweepAngleRad,
    sweepAngleDeg,
    arcLength: len,
    chordLength: chord,
    sagitta: sag,
    startPoint,
    endPoint,
    midpoint,
    chordMidpoint,
    startTangent,
    endTangent,
    startNormal,
    endNormal,
    isCCW: ccw,
  };
}

/**
 * Computes an arc through 3 non-collinear points (p1 = start, p2 = interior, p3 = end).
 */
export function computeArcFromThreePoints(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D
): ArcMetricsResult | null {
  const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
  if (Math.abs(d) < 1e-12) return null; // Collinear

  const p1Sq = p1.x * p1.x + p1.y * p1.y;
  const p2Sq = p2.x * p2.x + p2.y * p2.y;
  const p3Sq = p3.x * p3.x + p3.y * p3.y;

  const cx = (p1Sq * (p2.y - p3.y) + p2Sq * (p3.y - p1.y) + p3Sq * (p1.y - p2.y)) / d;
  const cy = (p1Sq * (p3.x - p2.x) + p2Sq * (p1.x - p3.x) + p3Sq * (p2.x - p1.x)) / d;
  const center: Point2D = { x: cx, y: cy };
  const radius = Math.hypot(p1.x - cx, p1.y - cy);

  const startAngleRad = Math.atan2(p1.y - cy, p1.x - cx);
  const midAngleRad = Math.atan2(p2.y - cy, p2.x - cx);
  const endAngleRad = Math.atan2(p3.y - cy, p3.x - cx);

  // Cross product (p2 - p1) x (p3 - p1) to determine CCW orientation
  const cross = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  const ccw = cross > 0;

  return computeArcMetrics({
    center,
    radius,
    startAngleRad,
    endAngleRad,
    ccw,
  });
}
