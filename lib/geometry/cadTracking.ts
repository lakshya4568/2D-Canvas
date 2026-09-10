import { Point } from "./types";

/**
 * Applies AutoCAD Ortho Mode (F8) constraint relative to a base point.
 * Constrains movement along the dominant cardinal axis (horizontal or vertical).
 *
 * @param startPt Base reference point.
 * @param candidatePt Target point from cursor.
 * @returns Projected point on horizontal or vertical axis.
 */
export function applyOrthoProjection(startPt: Point, candidatePt: Point): Point {
  const dx = candidatePt.x - startPt.x;
  const dy = candidatePt.y - startPt.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: candidatePt.x, y: startPt.y };
  } else {
    return { x: startPt.x, y: candidatePt.y };
  }
}

export interface PolarSnapResult {
  point: Point;
  snappedAngleDeg?: number;
  isSnapped: boolean;
}

/**
 * Applies AutoCAD Polar Tracking (F10) constraint relative to a base point.
 * Snaps cursor along radial increments (e.g. 45-degree rays: 0, 45, 90, 135, etc.)
 * when within angular tolerance.
 *
 * @param startPt Base reference point.
 * @param candidatePt Target point from cursor.
 * @param stepDeg Angular step in degrees (default 45).
 * @param maxAngleDiffRad Angular threshold window in radians (default ~5 deg = 0.0872665 rad).
 */
export function applyPolarTrackingProjection(
  startPt: Point,
  candidatePt: Point,
  stepDeg = 45,
  maxAngleDiffRad = 0.0872665
): PolarSnapResult {
  const dx = candidatePt.x - startPt.x;
  const dy = candidatePt.y - startPt.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 1e-6) {
    return { point: candidatePt, isSnapped: false };
  }

  const angle = Math.atan2(dy, dx);
  const stepRad = (stepDeg * Math.PI) / 180;
  const snappedIndex = Math.round(angle / stepRad);
  const targetAngle = snappedIndex * stepRad;

  let angleDiff = Math.abs(angle - targetAngle);
  // Normalize angular difference across +/- PI boundary
  if (angleDiff > Math.PI) {
    angleDiff = 2 * Math.PI - angleDiff;
  }

  if (angleDiff <= maxAngleDiffRad) {
    let normalizedDeg = Math.round((targetAngle * 180) / Math.PI) % 360;
    if (normalizedDeg < 0) normalizedDeg += 360;

    return {
      point: {
        x: startPt.x + dist * Math.cos(targetAngle),
        y: startPt.y + dist * Math.sin(targetAngle),
      },
      snappedAngleDeg: normalizedDeg,
      isSnapped: true,
    };
  }

  return { point: candidatePt, isSnapped: false };
}

export interface DynamicInputMetrics {
  distance: number;
  angleDeg: number;
  distanceLabel: string;
  angleLabel: string;
}

/**
 * Formats AutoCAD Dynamic Input HUD measurements (length, polar angle)
 * between a base point and current cursor position.
 */
export function formatDynamicInputMetrics(basePt: Point, cursorPt: Point): DynamicInputMetrics {
  const dx = cursorPt.x - basePt.x;
  const dy = cursorPt.y - basePt.y;
  const distance = Math.hypot(dx, dy);
  let angleDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
  if (angleDeg < 0) angleDeg += 360;

  return {
    distance,
    angleDeg,
    distanceLabel: distance.toFixed(1),
    angleLabel: `${angleDeg}°`,
  };
}
