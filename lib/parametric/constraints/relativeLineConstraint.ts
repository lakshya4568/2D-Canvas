/**
 * Directed line-to-line relative movement (UPCE-ADDENDUM-2.0 §2.2).
 *
 * "Move l2 with l1 along the x/y coordinate, and the distance between the lines
 * is maintained." A plain distance constraint cannot say that. Distance is a
 * scalar and therefore unsigned: it pins how far apart two lines are and says
 * nothing about which side of l1 the line l2 is on, so a solver under pressure
 * is free to flip l2 straight through l1 and still report zero residual. On a
 * wall that reads as the inside face swapping with the outside face.
 *
 * Three residuals live here, and which one an author wants depends on what they
 * mean by "offset":
 *
 *   r_dX, r_dY   decoupled midpoint separation along the sheet axes. This is the
 *                one for orthogonal drafting — it keeps a horizontal gap and a
 *                vertical gap as two independent numbers a project engineer can
 *                type, instead of a single diagonal that changes when either
 *                moves.
 *
 *   r_offset     signed perpendicular distance from l1's carrier to l2's start.
 *                The one for rotated work: it holds a true thickness across a
 *                skewed boundary, and because it is SIGNED it also holds the
 *                side, so a wall cannot turn itself inside out under a large
 *                parameter change.
 *
 * All three are exact. The axis pair are linear, so their gradients are
 * constants; the perpendicular one is a ratio and gets the quotient rule.
 */

import { ConstraintEvaluationResult } from "../../solver/jacobians/types";

/**
 * Point indices into the state vector. Line 1 runs p1 -> p2 and is the reference;
 * line 2 runs p3 -> p4 and is the one held relative to it.
 */
export interface RelativeLineSpec {
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  /** Target separation along the chosen axis, or the signed normal offset. */
  target: number;
}

const at = (X: number[], i: number) => ({ x: X[2 * i], y: X[2 * i + 1] });

/**
 * Midpoint separation along x:  (x3+x4)/2 - (x1+x2)/2 - Dx = 0
 *
 * Midpoints rather than endpoints so the constraint does not silently also pin
 * the lines' lengths or their end alignment — it says where line 2 sits relative
 * to line 1 and nothing else, which is what leaves the remaining freedom for
 * other rules to claim.
 */
export function evaluateRelativeOffsetX(X: number[], spec: RelativeLineSpec): ConstraintEvaluationResult {
  const n = X.length;
  const a = at(X, spec.p1);
  const b = at(X, spec.p2);
  const c = at(X, spec.p3);
  const d = at(X, spec.p4);

  const residual = (c.x + d.x) / 2 - (a.x + b.x) / 2 - spec.target;

  const row = new Float64Array(n);
  row[2 * spec.p1] += -0.5;
  row[2 * spec.p2] += -0.5;
  row[2 * spec.p3] += 0.5;
  row[2 * spec.p4] += 0.5;

  return { residuals: [residual], jacobian: [Array.from(row)] };
}

/** Midpoint separation along y: (y3+y4)/2 - (y1+y2)/2 - Dy = 0 */
export function evaluateRelativeOffsetY(X: number[], spec: RelativeLineSpec): ConstraintEvaluationResult {
  const n = X.length;
  const a = at(X, spec.p1);
  const b = at(X, spec.p2);
  const c = at(X, spec.p3);
  const d = at(X, spec.p4);

  const residual = (c.y + d.y) / 2 - (a.y + b.y) / 2 - spec.target;

  const row = new Float64Array(n);
  row[2 * spec.p1 + 1] += -0.5;
  row[2 * spec.p2 + 1] += -0.5;
  row[2 * spec.p3 + 1] += 0.5;
  row[2 * spec.p4 + 1] += 0.5;

  return { residuals: [residual], jacobian: [Array.from(row)] };
}

/**
 * Signed perpendicular offset of P3 from the carrier of line 1:
 *
 *     r = [ -(y2-y1)(x3-x1) + (x2-x1)(y3-y1) ] / L  -  T,   L = |P2 - P1|
 *
 * The numerator is the 2D cross product, so its sign is the side; dividing by L
 * turns it from an area into the millimetres the author actually typed. Both
 * facts matter: without the division the residual is in mm^2 and a tolerance in
 * mm means nothing, and without the sign the wall can invert.
 */
export function evaluateDirectedNormalOffset(
  X: number[],
  spec: RelativeLineSpec
): ConstraintEvaluationResult {
  const n = X.length;
  const { x: x1, y: y1 } = at(X, spec.p1);
  const { x: x2, y: y2 } = at(X, spec.p2);
  const { x: x3, y: y3 } = at(X, spec.p3);

  const dx = x2 - x1;
  const dy = y2 - y1;
  const L2 = dx * dx + dy * dy;
  const L = Math.sqrt(L2);

  const row = new Float64Array(n);

  if (L < 1e-12) {
    // A zero-length reference has no direction, so there is no offset to hold.
    // Report the residual as unsatisfied but hand back a zero gradient rather
    // than a division by zero — the solver then leaves this row alone instead of
    // being steered by a number with no meaning.
    return { residuals: [-spec.target], jacobian: [Array.from(row)] };
  }

  // N = cross(P2-P1, P3-P1)
  const N = -dy * (x3 - x1) + dx * (y3 - y1);
  const residual = N / L - spec.target;

  // P1 appears three times over — inside dx, inside dy, and inside both
  // (P3 - P1) terms — so its partials are not simply the ones the two-point
  // reading suggests. Written out from N = -(y2-y1)(x3-x1) + (x2-x1)(y3-y1).
  const gN = new Float64Array(n);
  // d/dx1
  gN[2 * spec.p1] += dy - (y3 - y1);
  // d/dy1: N = -(y2-y1)(x3-x1) + (x2-x1)(y3-y1)
  //        d/dy1 = (x3-x1) - (x2-x1)
  gN[2 * spec.p1 + 1] += (x3 - x1) - dx;
  // d/dx2 = (y3-y1)
  gN[2 * spec.p2] += y3 - y1;
  // d/dy2 = -(x3-x1)
  gN[2 * spec.p2 + 1] += -(x3 - x1);
  // d/dx3 = -(y2-y1)
  gN[2 * spec.p3] += -dy;
  // d/dy3 = (x2-x1)
  gN[2 * spec.p3 + 1] += dx;

  // dL/dx1 = -dx/L, dL/dy1 = -dy/L, dL/dx2 = dx/L, dL/dy2 = dy/L
  const gL = new Float64Array(n);
  gL[2 * spec.p1] += -dx / L;
  gL[2 * spec.p1 + 1] += -dy / L;
  gL[2 * spec.p2] += dx / L;
  gL[2 * spec.p2 + 1] += dy / L;

  // Quotient rule: d(N/L) = (L * dN - N * dL) / L^2
  for (let j = 0; j < n; j++) {
    if (gN[j] === 0 && gL[j] === 0) continue;
    row[j] = (L * gN[j] - N * gL[j]) / L2;
  }

  return { residuals: [residual], jacobian: [Array.from(row)] };
}

/** Current signed normal offset of P3 from line 1's carrier, in mm. */
export function measureNormalOffset(X: number[], spec: RelativeLineSpec): number {
  const { x: x1, y: y1 } = at(X, spec.p1);
  const { x: x2, y: y2 } = at(X, spec.p2);
  const { x: x3, y: y3 } = at(X, spec.p3);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy);
  if (L < 1e-12) return 0;
  return (-dy * (x3 - x1) + dx * (y3 - y1)) / L;
}
