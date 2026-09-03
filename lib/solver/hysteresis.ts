import { Point2D } from "../geometry/topology/types";

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
