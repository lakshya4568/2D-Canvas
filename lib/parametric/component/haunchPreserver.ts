/**
 * Keeping haunches intact through large parameter changes (UPCE-ADDENDUM-2.0 §2.3).
 *
 * A haunch is three vertices: the wall vertex Pw, the virtual corner datum Pc
 * where the wall and slab faces would have met, and the slab vertex Ps. Holding
 * the two leg lengths is easy and not enough. The leg lengths are satisfied just
 * as well by the mirror-image corner that folds INTO the clear opening, and
 * during a big span change the solver will happily walk there: it is a valid
 * root of the same equations and it is nearer in the least-squares sense once
 * the geometry has been thrown far enough.
 *
 * Two things stop that, and they work at different levels.
 *
 * The BARRIER is algebraic. The signed area of the triangle (Pw, Pc, Ps) has one
 * sign for the correct corner and the opposite sign for the folded one, so it
 * must pass through zero to invert. A logarithmic interior-point term
 *
 *     Phi = -mu * ln(signed area)
 *
 * goes to infinity as the area approaches zero, which makes the wrong root
 * unreachable rather than merely unattractive. Note it is one-sided by
 * construction: `ln` of a negative number is not a number, so the residual is
 * already undefined on the wrong side.
 *
 * The SUB-STEPPING is about the path, not the destination. A barrier only helps
 * if the iterate stays inside the region where it is defined, and a single
 * 2000 mm jump can step clean over the wall. Splitting the change into
 * increments of at most 300 mm keeps every intermediate solve close to the last
 * one, so the geometry is continuous the whole way and the branch is never in
 * question.
 */

import { Point2D } from "../../geometry/topology/types";
import { ConstraintEvaluationResult } from "../../solver/jacobians/types";

/** Anything above this in one go is sub-stepped. */
export const HOMOTOPY_TRIGGER_MM = 500;
/** Largest increment a single sub-step may carry. */
export const HOMOTOPY_MAX_STEP_MM = 300;

export interface HaunchCorner {
  /** State-vector point index of the wall-side vertex. */
  wall: number;
  /** State-vector point index of the virtual corner datum. */
  corner: number;
  /** State-vector point index of the slab-side vertex. */
  slab: number;
  /** Leg length along the wall, mm. */
  legWall: number;
  /** Leg length along the slab, mm. */
  legSlab: number;
  /**
   * Which way round the correct corner winds, +1 or -1. Captured from the
   * geometry as drawn rather than assumed, because a culvert's four corners do
   * not all wind the same way and neither do the corners of anything else.
   */
  orientation: 1 | -1;
}

export interface HaunchMeasurement {
  legHorizontal: number;
  legVertical: number;
  angleDeg: number;
  signedArea: number;
}

const at = (X: number[], i: number): Point2D => ({ x: X[2 * i], y: X[2 * i + 1] });

/** Signed area x2 of (Pw, Pc, Ps). Sign is the chirality. */
export function haunchSignedArea(X: number[], corner: HaunchCorner): number {
  const w = at(X, corner.wall);
  const c = at(X, corner.corner);
  const s = at(X, corner.slab);
  return (w.x - c.x) * (s.y - c.y) - (w.y - c.y) * (s.x - c.x);
}

/** Reads a corner's current legs and included angle, for the invariant report. */
export function measureHaunch(X: number[], corner: HaunchCorner): HaunchMeasurement {
  const w = at(X, corner.wall);
  const c = at(X, corner.corner);
  const s = at(X, corner.slab);

  const legWall = Math.hypot(w.x - c.x, w.y - c.y);
  const legSlab = Math.hypot(s.x - c.x, s.y - c.y);

  // The angle the haunch face itself makes with the wall leg, which is what a
  // drawing calls "45 degrees", not the included angle at the datum.
  const fx = s.x - w.x;
  const fy = s.y - w.y;
  const wx = c.x - w.x;
  const wy = c.y - w.y;
  const denom = Math.hypot(fx, fy) * Math.hypot(wx, wy);
  const cosA = denom < 1e-12 ? 1 : (fx * wx + fy * wy) / denom;
  const angleDeg = (Math.acos(Math.max(-1, Math.min(1, cosA))) * 180) / Math.PI;

  return {
    legHorizontal: legWall,
    legVertical: legSlab,
    angleDeg,
    signedArea: 0.5 * haunchSignedArea(X, corner),
  };
}

/** Captures which way a corner winds as drawn, so the barrier defends that side. */
export function detectOrientation(X: number[], wall: number, cornerIdx: number, slab: number): 1 | -1 {
  const probe: HaunchCorner = {
    wall,
    corner: cornerIdx,
    slab,
    legWall: 0,
    legSlab: 0,
    orientation: 1,
  };
  return haunchSignedArea(X, probe) >= 0 ? 1 : -1;
}

/**
 * The chirality barrier as a solver row.
 *
 * Residual: -mu * ln(orientation * 2A). Gradient follows from d(2A)/dv, which is
 * linear in each coordinate, times -mu / (2A).
 *
 * When the corner has already inverted the logarithm has no value. Rather than
 * emit NaN and poison the whole system, a large finite penalty with a gradient
 * pointing back towards the valid side is returned — the solver is then pushed
 * home instead of stalling on an arithmetic fault.
 */
export function evaluateChiralityBarrier(
  X: number[],
  corner: HaunchCorner,
  mu = 1e-3
): ConstraintEvaluationResult {
  const n = X.length;
  const w = at(X, corner.wall);
  const c = at(X, corner.corner);
  const s = at(X, corner.slab);

  const twoA = corner.orientation * haunchSignedArea(X, corner);
  const row = new Float64Array(n);

  // d(2A)/dv for 2A = (wx-cx)(sy-cy) - (wy-cy)(sx-cx), times the orientation.
  const o = corner.orientation;
  const gWx = o * (s.y - c.y);
  const gWy = o * -(s.x - c.x);
  const gSx = o * -(w.y - c.y);
  const gSy = o * (w.x - c.x);
  const gCx = -(gWx + gSx);
  const gCy = -(gWy + gSy);

  const FLOOR = 1e-9;
  const safe = Math.max(twoA, FLOOR);
  const residual = twoA > FLOOR ? -mu * Math.log(twoA) : -mu * Math.log(FLOOR) + mu * (FLOOR - twoA) / FLOOR;
  const scale = -mu / safe;

  row[2 * corner.wall] = scale * gWx;
  row[2 * corner.wall + 1] = scale * gWy;
  row[2 * corner.corner] = scale * gCx;
  row[2 * corner.corner + 1] = scale * gCy;
  row[2 * corner.slab] = scale * gSx;
  row[2 * corner.slab + 1] = scale * gSy;

  return { residuals: [residual], jacobian: [Array.from(row)] };
}

/**
 * Splits a parameter change into increments the solver can follow continuously.
 *
 * Returns the intermediate VALUES, ending at `to`. A change inside the trigger
 * comes back as a single step, so the common case costs nothing.
 */
export function planHomotopy(
  from: number,
  to: number,
  trigger = HOMOTOPY_TRIGGER_MM,
  maxStep = HOMOTOPY_MAX_STEP_MM
): number[] {
  const delta = to - from;
  if (!Number.isFinite(delta) || Math.abs(delta) <= trigger) return [to];

  const steps = Math.ceil(Math.abs(delta) / maxStep);
  const out: number[] = [];
  for (let i = 1; i <= steps; i++) out.push(from + (delta * i) / steps);
  // Guard against float drift leaving the last step a hair short of the target.
  out[out.length - 1] = to;
  return out;
}

/**
 * Leg-length rows for one corner: |Pw - Pc| = legWall and |Ps - Pc| = legSlab.
 *
 * Written on the distance rather than its square so the residual is in
 * millimetres and can be compared against a millimetre tolerance directly.
 */
export function evaluateHaunchLegs(X: number[], corner: HaunchCorner): ConstraintEvaluationResult {
  const n = X.length;
  const w = at(X, corner.wall);
  const c = at(X, corner.corner);
  const s = at(X, corner.slab);

  const rows: number[][] = [];
  const residuals: number[] = [];

  const leg = (a: Point2D, ai: number, target: number) => {
    const dx = a.x - c.x;
    const dy = a.y - c.y;
    const L = Math.hypot(dx, dy);
    residuals.push(L - target);
    const row = new Float64Array(n);
    if (L > 1e-12) {
      row[2 * ai] = dx / L;
      row[2 * ai + 1] = dy / L;
      row[2 * corner.corner] = -dx / L;
      row[2 * corner.corner + 1] = -dy / L;
    }
    rows.push(Array.from(row));
  };

  leg(w, corner.wall, corner.legWall);
  leg(s, corner.slab, corner.legSlab);

  return { residuals, jacobian: rows };
}

/** True when every corner still winds the way it was drawn. */
export function haunchesIntact(X: number[], corners: HaunchCorner[]): boolean {
  return corners.every((c) => c.orientation * haunchSignedArea(X, c) > 0);
}
