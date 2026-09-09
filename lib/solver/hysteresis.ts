import { Point2D } from "../geometry/topology/types";
import { DcelPlanarMap } from "../geometry/topology/dcel";

/**
 * Validates that consecutive edge chirality (signed cross product) did not invert
 * between initial and trial states.
 */
export function validatePolygonChirality(
  initialLoop: Point2D[],
  trialLoop: Point2D[]
): boolean {
  const n = initialLoop.length;
  if (n < 3) return true;

  for (let i = 0; i < n; i++) {
    const prevIdx = (i - 1 + n) % n;
    const nextIdx = (i + 1) % n;

    // Initial cross product (v_i - v_{i-1}) x (v_{i+1} - v_i)
    const initAx = initialLoop[i].x - initialLoop[prevIdx].x;
    const initAy = initialLoop[i].y - initialLoop[prevIdx].y;
    const initBx = initialLoop[nextIdx].x - initialLoop[i].x;
    const initBy = initialLoop[nextIdx].y - initialLoop[i].y;
    const initCross = initAx * initBy - initAy * initBx;

    // Trial cross product
    const trialAx = trialLoop[i].x - trialLoop[prevIdx].x;
    const trialAy = trialLoop[i].y - trialLoop[prevIdx].y;
    const trialBx = trialLoop[nextIdx].x - trialLoop[i].x;
    const trialBy = trialLoop[nextIdx].y - trialLoop[i].y;
    const trialCross = trialAx * trialBy - trialAy * trialBx;

    // If initial angle was significant (> 1e-4) and sign changed, chirality was inverted
    if (Math.abs(initCross) > 1e-4 && initCross * trialCross < 0) {
      return false;
    }
  }

  return true;
}

/**
 * Computes the signed area of a polygon loop.
 * Positive = counter-clockwise, Negative = clockwise.
 */
export function signedArea(loop: Point2D[]): number {
  const n = loop.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += loop[i].x * loop[j].y;
    area -= loop[j].x * loop[i].y;
  }
  return area / 2.0;
}

/**
 * Validates that all interior DCEL faces maintain their signed area sign
 * after a coordinate update. Detects topology-inverting drags where solid
 * material regions collapse or turn inside-out.
 *
 * UPCE-MASTER-1.0 §34, §86, Gate G9 (§76)
 */
export function validateDcelFaceChirality(
  dcel: DcelPlanarMap,
  originalPoints: Map<string, Point2D>,
  updatedPoints: Map<string, Point2D>
): { valid: boolean; invertedFaceIds: string[] } {
  const invertedFaceIds: string[] = [];

  for (const face of dcel.faces.values()) {
    if (face.isExterior) continue;
    if (!face.outerBoundary) continue;

    // Collect original and updated boundary loops
    const originalLoop: Point2D[] = [];
    const updatedLoop: Point2D[] = [];

    let heId = face.outerBoundary;
    const visited = new Set<string>();

    while (!visited.has(heId)) {
      visited.add(heId);
      const he = dcel.halfEdges.get(heId);
      if (!he) break;

      const origPt = originalPoints.get(he.origin);
      const updPt = updatedPoints.get(he.origin);

      if (origPt) originalLoop.push(origPt);
      if (updPt) updatedLoop.push(updPt);

      heId = he.next;
    }

    if (originalLoop.length < 3 || updatedLoop.length < 3) continue;

    const origArea = signedArea(originalLoop);
    const updArea = signedArea(updatedLoop);

    // If original area was significant and sign changed, face chirality inverted
    if (Math.abs(origArea) > 1e-4 && origArea * updArea < 0) {
      invertedFaceIds.push(face.id);
    }
  }

  return { valid: invertedFaceIds.length === 0, invertedFaceIds };
}

/**
 * Clamps a proposed drag displacement to preserve DCEL face chirality.
 * Binary-searches for the maximum safe step fraction α ∈ [0, 1] such that
 * interpolating originalCoords → proposedCoords by α preserves all face orientations.
 *
 * UPCE-MASTER-1.0 §34, §86, Gate G9 (§76)
 */
export function clampDragToChirality(
  dcel: DcelPlanarMap,
  originalCoords: number[],
  proposedCoords: number[],
  pointIdToCoordIndex: Map<string, { xIdx: number; yIdx: number }>,
  tolerance: number = 0.001
): { clampedCoords: number[]; wasClamped: boolean; clampFraction: number } {
  const n = originalCoords.length;

  // Helper: interpolate coordinates at fraction alpha
  function interpolate(alpha: number): number[] {
    const result = new Array(n);
    for (let i = 0; i < n; i++) {
      result[i] = originalCoords[i] + alpha * (proposedCoords[i] - originalCoords[i]);
    }
    return result;
  }

  // Helper: build point map from coordinate array
  function buildPointMap(coords: number[]): Map<string, Point2D> {
    const map = new Map<string, Point2D>();
    for (const [ptId, idx] of pointIdToCoordIndex.entries()) {
      map.set(ptId, { x: coords[idx.xIdx], y: coords[idx.yIdx] });
    }
    return map;
  }

  // Build original point map
  const originalPointMap = buildPointMap(originalCoords);

  // Check if full step is safe
  const fullStepPoints = buildPointMap(proposedCoords);
  const fullCheck = validateDcelFaceChirality(dcel, originalPointMap, fullStepPoints);

  if (fullCheck.valid) {
    return { clampedCoords: [...proposedCoords], wasClamped: false, clampFraction: 1.0 };
  }

  // Binary search for maximum safe alpha
  let lo = 0.0;
  let hi = 1.0;
  const maxBisections = 10;

  for (let i = 0; i < maxBisections; i++) {
    const mid = (lo + hi) / 2.0;
    const midCoords = interpolate(mid);
    const midPoints = buildPointMap(midCoords);
    const midCheck = validateDcelFaceChirality(dcel, originalPointMap, midPoints);

    if (midCheck.valid) {
      lo = mid;
    } else {
      hi = mid;
    }

    if (hi - lo < tolerance) break;
  }

  const safeFraction = lo;
  const clampedCoords = interpolate(safeFraction);

  return { clampedCoords, wasClamped: true, clampFraction: safeFraction };
}

/**
 * Validates that no two non-welded vertices have collapsed within weld tolerance
 * during a drag operation. Detects topology collapse where distinct vertices merge.
 *
 * UPCE-MASTER-1.0 §34, Gate G9 (§76)
 */
export function validateWeldTolerance(
  points: Map<string, Point2D>,
  weldTolerance: number
): { valid: boolean; collapsingPairs: [string, string][] } {
  const collapsingPairs: [string, string][] = [];
  const entries = Array.from(points.entries());

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [idA, ptA] = entries[i];
      const [idB, ptB] = entries[j];
      const dist = Math.hypot(ptA.x - ptB.x, ptA.y - ptB.y);

      if (dist < weldTolerance && dist > 0) {
        collapsingPairs.push([idA, idB]);
      }
    }
  }

  return { valid: collapsingPairs.length === 0, collapsingPairs };
}
