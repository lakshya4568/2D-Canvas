/**
 * Geometric relationships, written as expressions.
 *
 * A draftsman does not put a wing wall at (4317, 2150). They put it at the
 * angle the design gives, running from the point where it meets the abutment,
 * for the length the design gives — and the coordinates follow. This module is
 * that sentence in code: every construction here takes points and values that
 * are already expressions of the drawing's named values, and returns new
 * expressions in the same terms.
 *
 * Nothing here knows what is being drawn. A slope is a slope whether it belongs
 * to a wing wall, a bracing member, an apron or a roof, and the intersection of
 * two lines is the same intersection in every trade. Anything that reads like a
 * structure type belongs in the agent's plan, not in this file.
 *
 * Two things stay decided at construction time, exactly as in `symbolic.ts`:
 * which of the two roots of a circle problem was meant, and which side of a
 * line an offset goes. Those are topology. The sizes and the angles stay live.
 *
 * Angles are degrees, counter-clockwise from +x, to match the expression
 * language's trigonometry.
 */

import { add, div, fn, lit, mul, neg, pt, sub, intersect, mirrorPoint, rotatePoint, type S, type SP } from "@/lib/components/symbolic";

export type { S, SP };

/** A construction that has two answers: the caller says which one it meant. */
export interface TwoPoints {
  first: SP;
  second: SP;
}

const square = (a: S): S => mul(a, a);

// ---------------------------------------------------------------------------
// Direction, length, slope, angle — reading a relationship off two points
// ---------------------------------------------------------------------------

/** Straight-line distance between two points. */
export function distance(a: SP, b: SP): S {
  return fn("hypot", sub(b.x, a.x), sub(b.y, a.y));
}

/** The direction from a to b, in degrees counter-clockwise from +x. */
export function angleOf(a: SP, b: SP): S {
  return fn("atan2", sub(b.y, a.y), sub(b.x, a.x));
}

/** Rise over run. Vertical lines have no slope — the caller gets null. */
export function slopeOf(a: SP, b: SP, tol: number): S | null {
  if (Math.abs(b.x.v - a.x.v) <= tol) return null;
  return div(sub(b.y, a.y), sub(b.x, a.x));
}

/** The angle between two directions, as the difference of their bearings. */
export function angleBetween(a1: SP, a2: SP, b1: SP, b2: SP): S {
  return sub(angleOf(b1, b2), angleOf(a1, a2));
}

// ---------------------------------------------------------------------------
// Placing a point from a relationship
// ---------------------------------------------------------------------------

/**
 * `distance` away from `from`, in the direction `angle`.
 *
 * The one construction every sloped member comes down to: rise = L sin θ,
 * run = L cos θ, both kept as expressions so changing either the angle or the
 * length moves the end of the member and everything built on it.
 */
export function polar(from: SP, angle: S, distance: S): SP {
  return pt(add(from.x, mul(distance, fn("cos", angle))), add(from.y, mul(distance, fn("sin", angle))));
}

/**
 * Along the line a→b, by a distance or by a fraction of its length, with an
 * optional perpendicular offset (positive to the left of a→b).
 */
export function along(a: SP, b: SP, by: { distance?: S; fraction?: S }, offset?: S): SP {
  const dx = sub(b.x, a.x);
  const dy = sub(b.y, a.y);
  const len = fn("hypot", dx, dy);
  const t = by.fraction ?? div(by.distance!, len);
  let p = pt(add(a.x, mul(t, dx)), add(a.y, mul(t, dy)));
  if (offset) p = pt(add(p.x, div(mul(neg(offset), dy), len)), add(p.y, div(mul(offset, dx), len)));
  return p;
}

/**
 * From `from`, `run` horizontally and `run × slope` vertically.
 *
 * Gradients on drawings are given as often as angles ("1 in 4", "2H:1V"), and
 * a batter written that way must stay written that way: the caller passes the
 * slope as the expression it really is — `1 / BatterRun`, `Rise / Run` — and
 * the geometry follows it.
 */
export function bySlope(from: SP, run: S, slope: S): SP {
  return pt(add(from.x, run), add(from.y, mul(run, slope)));
}

/** Where two lines cross, or null when they are parallel (within `tol`). */
export function crossing(a1: SP, a2: SP, b1: SP, b2: SP, tol: number): SP | null {
  return intersect(a1, a2, b1, b2, tol);
}

/** The foot of the perpendicular from p to the line through a and b. */
export function footOnLine(p: SP, a: SP, b: SP): SP {
  const dx = sub(b.x, a.x);
  const dy = sub(b.y, a.y);
  const t = div(add(mul(sub(p.x, a.x), dx), mul(sub(p.y, a.y), dy)), add(square(dx), square(dy)));
  return pt(add(a.x, mul(t, dx)), add(a.y, mul(t, dy)));
}

/** How far p stands from the line through a and b (positive to the left). */
export function offsetFromLine(p: SP, a: SP, b: SP): S {
  const dx = sub(b.x, a.x);
  const dy = sub(b.y, a.y);
  return div(sub(mul(dx, sub(p.y, a.y)), mul(dy, sub(p.x, a.x))), fn("hypot", dx, dy));
}

/** A point `distance` from p, square to the line a→b (positive to the left). */
export function perpendicularFrom(p: SP, a: SP, b: SP, distance: S): SP {
  const dx = sub(b.x, a.x);
  const dy = sub(b.y, a.y);
  const len = fn("hypot", dx, dy);
  return pt(add(p.x, div(mul(neg(distance), dy), len)), add(p.y, div(mul(distance, dx), len)));
}

/**
 * The direction that splits the angle at `vertex` between its two arms.
 *
 * Returned as a point one unit-length along the bisector, so it can be used as
 * the second point of a line — a mitre, a splay, a valley — without the caller
 * needing to know the arithmetic.
 */
export function bisector(vertex: SP, armA: SP, armB: SP, length: S): SP {
  const half = div(add(angleOf(vertex, armA), angleOf(vertex, armB)), lit(2));
  return polar(vertex, half, length);
}

// ---------------------------------------------------------------------------
// Circles — tangency and intersection
// ---------------------------------------------------------------------------

/** Where the line a→b cuts the circle (centre c, radius r), or null if it misses. */
export function lineCircle(a: SP, b: SP, c: SP, r: S): TwoPoints | null {
  const dx = sub(b.x, a.x);
  const dy = sub(b.y, a.y);
  const fx = sub(a.x, c.x);
  const fy = sub(a.y, c.y);
  const A = add(square(dx), square(dy));
  const B = mul(lit(2), add(mul(fx, dx), mul(fy, dy)));
  const C = sub(add(square(fx), square(fy)), square(r));
  const disc = sub(square(B), mul(lit(4), mul(A, C)));
  if (disc.v < 0) return null;
  const root = fn("sqrt", disc);
  const at = (t: S) => pt(add(a.x, mul(t, dx)), add(a.y, mul(t, dy)));
  return {
    first: at(div(sub(neg(B), root), mul(lit(2), A))),
    second: at(div(add(neg(B), root), mul(lit(2), A))),
  };
}

/** Where two circles cut each other, or null when they do not reach. */
export function circleCircle(c1: SP, r1: S, c2: SP, r2: S): TwoPoints | null {
  const dx = sub(c2.x, c1.x);
  const dy = sub(c2.y, c1.y);
  const d = fn("hypot", dx, dy);
  if (d.v > r1.v + r2.v || d.v < Math.abs(r1.v - r2.v) || d.v === 0) return null;
  const a = div(add(sub(square(r1), square(r2)), square(d)), mul(lit(2), d));
  const h = fn("sqrt", sub(square(r1), square(a)));
  const mid = pt(add(c1.x, div(mul(a, dx), d)), add(c1.y, div(mul(a, dy), d)));
  return {
    first: pt(add(mid.x, div(mul(h, dy), d)), sub(mid.y, div(mul(h, dx), d))),
    second: pt(sub(mid.x, div(mul(h, dy), d)), add(mid.y, div(mul(h, dx), d))),
  };
}

/**
 * The two points on a circle where a line from `p` touches it.
 *
 * `p` must lie outside the circle: from inside there is no tangent, and saying
 * so beats returning a point that is not one.
 */
export function tangentPoints(p: SP, c: SP, r: S): TwoPoints | null {
  const dx = sub(p.x, c.x);
  const dy = sub(p.y, c.y);
  const len = fn("hypot", dx, dy);
  if (len.v <= Math.abs(r.v)) return null;
  const base = fn("atan2", dy, dx);
  const spread = fn("acos", div(r, len));
  return { first: polar(c, add(base, spread), r), second: polar(c, sub(base, spread), r) };
}

// ---------------------------------------------------------------------------
// Frames — local and global
// ---------------------------------------------------------------------------

/**
 * A local frame: where its origin sits and how far it is turned.
 *
 * Skew structures, splayed returns and bracing are all easier to think about in
 * their own axes — "1200 along the wall, 300 out from it" — and impossible to
 * keep parametric if that thinking is done on a calculator. Both directions of
 * the transform are here so the agent can set out in whichever frame the
 * relationship is stated in and still write global coordinates.
 */
export interface Frame {
  origin: SP;
  /** Degrees counter-clockwise; the local +u axis relative to global +x. */
  angle: S;
}

/** A point given in frame coordinates (u along, v across), as global x, y. */
export function toGlobal(frame: Frame, u: S, v: S): SP {
  const c = fn("cos", frame.angle);
  const s = fn("sin", frame.angle);
  return pt(add(frame.origin.x, sub(mul(u, c), mul(v, s))), add(frame.origin.y, add(mul(u, s), mul(v, c))));
}

/** A global point, as coordinates in the frame (u along, v across). */
export function toLocal(frame: Frame, p: SP): { u: S; v: S } {
  const c = fn("cos", frame.angle);
  const s = fn("sin", frame.angle);
  const dx = sub(p.x, frame.origin.x);
  const dy = sub(p.y, frame.origin.y);
  return { u: add(mul(dx, c), mul(dy, s)), v: sub(mul(dy, c), mul(dx, s)) };
}

export { mirrorPoint, rotatePoint };
