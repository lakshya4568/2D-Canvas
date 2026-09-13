/**
 * Polygon centroid as a differentiable quantity (UPCE-ADDENDUM-2.0 §2.1).
 *
 * `lib/geometry/metrics/polygonMoments.ts` already computes a centroid, and that
 * is all it computes: a number to print. A number you can print is not a number
 * the solver can drive towards, because the solver needs to know which way to
 * move each vertex to make the centroid go where the author asked. That is the
 * whole difference between a passive metric and an active constraint, and it is
 * why "align these two shapes on their centres" was previously a label rather
 * than a relationship.
 *
 * So this file computes the same centroid AND its exact gradient with respect to
 * every vertex coordinate. Analytically — no finite differences. The centroid is
 * a ratio of two polynomial sums, so the quotient rule gives the gradient in
 * closed form and the solver converges quadratically instead of crawling through
 * difference noise.
 *
 * Definitions, with cyclic indexing (x_k = x_0):
 *
 *     xi_i = x_i * y_{i+1} - x_{i+1} * y_i          (the shoelace cross term)
 *     Omega = 1/2 * SUM xi_i                        (signed area)
 *     M_y   = SUM (x_i + x_{i+1}) * xi_i            (first moment about y)
 *     M_x   = SUM (y_i + y_{i+1}) * xi_i
 *     C_x   = M_y / (6 * Omega),  C_y = M_x / (6 * Omega)
 *
 * Each coordinate x_j appears in exactly two cross terms — xi_{j-1} and xi_j —
 * which is what keeps the gradient local and cheap despite the sums running over
 * the whole loop.
 */

import { Point2D } from "../topology/types";

export interface CentroidEvaluation {
  /** The centroid itself. */
  center: Point2D;
  /** Signed shoelace area. Positive for counter-clockwise winding. */
  signedArea: number;
  /**
   * Row-major 2 x 2k gradient: row 0 is dCx/d[x0,y0,x1,y1,...], row 1 is dCy.
   * Laid out flat because it is consumed by Jacobian assembly, not by humans.
   */
  jacobian: Float64Array;
}

/** A polygon too small or too degenerate to have a meaningful centroid. */
const AREA_EPSILON = 1e-12;

/**
 * Centroid and its exact gradient for a closed polygon.
 *
 * `points` is the boundary in order, without repeating the first vertex at the
 * end — the cyclic indexing is handled here. Winding may be either way; the
 * signed area carries the sign and the ratio cancels it.
 */
export function evaluateCentroid(points: Point2D[]): CentroidEvaluation {
  const k = points.length;
  const jacobian = new Float64Array(2 * 2 * k);

  if (k < 3) {
    // A degenerate loop has no area to divide by. Report the vertex average so
    // callers still get a usable position, with a zero gradient that tells the
    // solver honestly that it has no way to move this.
    let sx = 0;
    let sy = 0;
    for (const p of points) {
      sx += p.x;
      sy += p.y;
    }
    const n = Math.max(1, k);
    return { center: { x: sx / n, y: sy / n }, signedArea: 0, jacobian };
  }

  const x = new Float64Array(k);
  const y = new Float64Array(k);
  for (let i = 0; i < k; i++) {
    x[i] = points[i].x;
    y[i] = points[i].y;
  }

  const xi = new Float64Array(k);
  let twoOmega = 0;
  let My = 0;
  let Mx = 0;
  for (let i = 0; i < k; i++) {
    const n = (i + 1) % k;
    xi[i] = x[i] * y[n] - x[n] * y[i];
    twoOmega += xi[i];
    My += (x[i] + x[n]) * xi[i];
    Mx += (y[i] + y[n]) * xi[i];
  }
  const omega = 0.5 * twoOmega;

  if (Math.abs(omega) < AREA_EPSILON) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < k; i++) {
      sx += x[i];
      sy += y[i];
    }
    return { center: { x: sx / k, y: sy / k }, signedArea: omega, jacobian };
  }

  const inv6Omega = 1 / (6 * omega);
  const Cx = My * inv6Omega;
  const Cy = Mx * inv6Omega;

  // d(C)/dv = 1/6 * [ (1/Omega) * dM/dv  -  (M / Omega^2) * dOmega/dv ]
  const invOmega = 1 / omega;
  const invOmegaSq = invOmega * invOmega;

  for (let j = 0; j < k; j++) {
    const p = (j - 1 + k) % k; // previous
    const n = (j + 1) % k; // next

    const dOmega_dxj = 0.5 * (y[n] - y[p]);
    const dOmega_dyj = 0.5 * (x[p] - x[n]);

    // M_y = SUM (x_i + x_{i+1}) * xi_i, and x_j lives in terms i = j-1 and i = j.
    const dMy_dxj =
      xi[p] + (x[p] + x[j]) * -y[p] + xi[j] + (x[j] + x[n]) * y[n];
    const dMy_dyj = (x[p] + x[j]) * x[p] + (x[j] + x[n]) * -x[n];

    // M_x = SUM (y_i + y_{i+1}) * xi_i, same two terms.
    const dMx_dxj = (y[p] + y[j]) * -y[p] + (y[j] + y[n]) * y[n];
    const dMx_dyj =
      xi[p] + (y[p] + y[j]) * x[p] + xi[j] + (y[j] + y[n]) * -x[n];

    const colX = 2 * j;
    const colY = 2 * j + 1;

    // Row 0: dCx
    jacobian[colX] = (invOmega * dMy_dxj - My * invOmegaSq * dOmega_dxj) / 6;
    jacobian[colY] = (invOmega * dMy_dyj - My * invOmegaSq * dOmega_dyj) / 6;

    // Row 1: dCy
    jacobian[2 * k + colX] = (invOmega * dMx_dxj - Mx * invOmegaSq * dOmega_dxj) / 6;
    jacobian[2 * k + colY] = (invOmega * dMx_dyj - Mx * invOmegaSq * dOmega_dyj) / 6;
  }

  return { center: { x: Cx, y: Cy }, signedArea: omega, jacobian };
}

/** Reads dCx/d(coordinate) out of the flat gradient. `slot` is 2*vertex (+1 for y). */
export function dCxAt(evaluation: CentroidEvaluation, slot: number): number {
  return evaluation.jacobian[slot];
}

/** Reads dCy/d(coordinate) out of the flat gradient. */
export function dCyAt(evaluation: CentroidEvaluation, slot: number): number {
  const half = evaluation.jacobian.length / 2;
  return evaluation.jacobian[half + slot];
}
