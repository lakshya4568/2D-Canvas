/**
 * Centroid-to-centroid distance as a driving constraint (UPCE-ADDENDUM-2.0 §2.1, P10).
 *
 * "Build a relationship between the centres of two shapes; when I close them up,
 * the rectangles come closer too." That sentence describes a constraint, not a
 * readout, and the difference is the Jacobian: a readout knows where the centre
 * IS, a constraint knows which way to push every vertex to move the centre where
 * it should be.
 *
 * The residual is written on SQUARED distance:
 *
 *     r = (Cx_A - Cx_B)^2 + (Cy_A - Cy_B)^2 - D^2
 *
 * rather than on the distance itself. Squared form has no square root, so it
 * stays smooth and differentiable even when the two centroids momentarily
 * coincide during a large pull — where `sqrt` would hand the solver an infinite
 * gradient and it would throw the geometry across the sheet.
 *
 * Both shapes move. Nothing here picks a winner: the minimum-norm step spreads
 * the correction over whichever vertices are free, which is why two unanchored
 * rectangles converge towards each other symmetrically rather than one of them
 * flying into the other.
 */

import { Point2D } from "../../geometry/topology/types";
import { evaluateCentroid, CentroidEvaluation } from "../../geometry/predicates/centroidPredicates";
import { ConstraintEvaluationResult } from "../../solver/jacobians/types";

export interface CentroidDistanceSpec {
  /** State-vector point indices forming shape A's boundary, in order. */
  loopA: number[];
  /** State-vector point indices forming shape B's boundary, in order. */
  loopB: number[];
  /** Target centre-to-centre distance in mm. */
  targetDistance: number;
}

function gather(X: number[], loop: number[]): Point2D[] {
  const out: Point2D[] = new Array(loop.length);
  for (let i = 0; i < loop.length; i++) {
    out[i] = { x: X[2 * loop[i]], y: X[2 * loop[i] + 1] };
  }
  return out;
}

/**
 * Scatters one shape's centroid gradient into the full-width Jacobian row.
 *
 * `sign` is +1 for shape A and -1 for shape B: the residual is symmetric in the
 * difference, so B's contribution is A's with the sign flipped.
 */
function scatter(
  row: Float64Array,
  loop: number[],
  evaluation: CentroidEvaluation,
  dx: number,
  dy: number,
  sign: number
): void {
  const k = loop.length;
  const half = 2 * k;
  for (let j = 0; j < k; j++) {
    const slotX = 2 * j;
    const slotY = 2 * j + 1;

    const dCx_dx = evaluation.jacobian[slotX];
    const dCx_dy = evaluation.jacobian[slotY];
    const dCy_dx = evaluation.jacobian[half + slotX];
    const dCy_dy = evaluation.jacobian[half + slotY];

    const col = 2 * loop[j];
    // dr/dv = 2*dx*dCx/dv + 2*dy*dCy/dv, with dx = Cx_A - Cx_B.
    // A vertex shared between the two loops accumulates both contributions,
    // hence += rather than =.
    row[col] += sign * 2 * (dx * dCx_dx + dy * dCy_dx);
    row[col + 1] += sign * 2 * (dx * dCx_dy + dy * dCy_dy);
  }
}

/**
 * One residual row plus its exact gradient, in the full state vector's width.
 */
export function evaluateCentroidDistanceConstraint(
  X: number[],
  spec: CentroidDistanceSpec
): ConstraintEvaluationResult {
  const n = X.length;
  const a = evaluateCentroid(gather(X, spec.loopA));
  const b = evaluateCentroid(gather(X, spec.loopB));

  const dx = a.center.x - b.center.x;
  const dy = a.center.y - b.center.y;
  const D = spec.targetDistance;

  const residual = dx * dx + dy * dy - D * D;

  const row = new Float64Array(n);
  scatter(row, spec.loopA, a, dx, dy, +1);
  scatter(row, spec.loopB, b, dx, dy, -1);

  return { residuals: [residual], jacobian: [Array.from(row)] };
}

/** Current centre-to-centre distance, for reporting and for seeding a target. */
export function measureCentroidDistance(X: number[], loopA: number[], loopB: number[]): number {
  const a = evaluateCentroid(gather(X, loopA));
  const b = evaluateCentroid(gather(X, loopB));
  return Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
}

/** The centroid of one loop, read off the current state vector. */
export function centroidOf(X: number[], loop: number[]): Point2D {
  return evaluateCentroid(gather(X, loop)).center;
}
