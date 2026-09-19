/**
 * Symbolic coordinates: an expression paired with its current value.
 *
 * Construction operations — mirror, rotate, offset, line intersection, polygon
 * booleans — build new points FROM the expressions of existing ones, so the
 * result is still written in the named values it came from. Change a value and
 * the derived geometry follows by re-evaluation: no solver, no scaling (§8,
 * §23). What the current values decide, once, is the TOPOLOGY — which edge
 * meets which, whether an edge is horizontal — exactly as a component's
 * repeat counts and loop orders are fixed data. A later value that would
 * change that topology shows up as a collapsed, crossed or inverted loop and
 * is refused by the component checks like any other broken edit.
 *
 * Nothing here knows what is being drawn.
 */

import type { Expr, XY } from "./types";
import { evalExpr, type Scope } from "./expr";

export interface S {
  e: string;
  v: number;
}
export interface SP {
  x: S;
  y: S;
}

const NUM = /^-?\d+(\.\d+)?$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A plain number, written without exponent notation (the grammar has none). */
export function lit(v: number): S {
  const r = Math.abs(v) < 5e-10 ? 0 : v;
  const e = Number.isInteger(r) ? String(r) : r.toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
  return { e, v: Number(e) };
}

export function sym(e: Expr, scope: Scope): S {
  if (typeof e === "number") return lit(e);
  return { e: e.trim(), v: evalExpr(e, scope) };
}

export function symPoint(p: XY, scope: Scope): SP {
  return { x: sym(p[0], scope), y: sym(p[1], scope) };
}

export function toXY(p: SP): XY {
  return [NUM.test(p.x.e) ? Number(p.x.e) : p.x.e, NUM.test(p.y.e) ? Number(p.y.e) : p.y.e];
}

const isNum = (s: S) => NUM.test(s.e);
const atom = (e: string) => (IDENT.test(e) || (NUM.test(e) && !e.startsWith("-")) || /^[A-Za-z_]\w*\([^()]*\)$/.test(e) ? e : `(${e})`);

export function add(a: S, b: S): S {
  if (isNum(a) && isNum(b)) return lit(a.v + b.v);
  if (isNum(b) && b.v === 0) return a;
  if (isNum(a) && a.v === 0) return b;
  if (isNum(b) && b.v < 0) return { e: `${a.e} - ${lit(-b.v).e}`, v: a.v + b.v };
  return { e: `${a.e} + ${atom(b.e)}`, v: a.v + b.v };
}

export function sub(a: S, b: S): S {
  if (isNum(a) && isNum(b)) return lit(a.v - b.v);
  if (isNum(b) && b.v === 0) return a;
  if (a.e === b.e) return lit(0);
  if (isNum(b) && b.v < 0) return { e: `${a.e} + ${lit(-b.v).e}`, v: a.v - b.v };
  return { e: `${a.e} - ${atom(b.e)}`, v: a.v - b.v };
}

export function mul(a: S, b: S): S {
  if (isNum(a) && isNum(b)) return lit(a.v * b.v);
  if ((isNum(a) && a.v === 0) || (isNum(b) && b.v === 0)) return lit(0);
  if (isNum(a) && a.v === 1) return b;
  if (isNum(b) && b.v === 1) return a;
  if (isNum(a) && a.v === -1) return neg(b);
  if (isNum(b) && b.v === -1) return neg(a);
  return { e: `${atom(a.e)} * ${atom(b.e)}`, v: a.v * b.v };
}

export function div(a: S, b: S): S {
  if (isNum(a) && isNum(b) && b.v !== 0) return lit(a.v / b.v);
  if (isNum(b) && b.v === 1) return a;
  return { e: `${atom(a.e)} / ${atom(b.e)}`, v: a.v / b.v };
}

export function neg(a: S): S {
  if (isNum(a)) return lit(-a.v);
  if (a.e.startsWith("-") && IDENT.test(a.e.slice(1))) return { e: a.e.slice(1), v: -a.v };
  return { e: `-${atom(a.e)}`, v: -a.v };
}

export function fn(name: string, ...args: S[]): S {
  const v = evalExpr(`${name}(${args.map((a) => lit(a.v).e).join(", ")})`, {});
  return { e: `${name}(${args.map((a) => a.e).join(", ")})`, v };
}

export const pt = (x: S, y: S): SP => ({ x, y });
export const translate = (p: SP, dx: S, dy: S): SP => pt(add(p.x, dx), add(p.y, dy));

/**
 * Where the lines a1→a2 and b1→b2 cross. Horizontal and vertical lines (as the
 * current values have them, within `tol` mm) give the short forms — the
 * crossing of a wall face x = X and a slab face y = Y is just (X, Y).
 */
export function intersect(a1: SP, a2: SP, b1: SP, b2: SP, tol: number): SP | null {
  const rx = a2.x.v - a1.x.v;
  const ry = a2.y.v - a1.y.v;
  const sx = b2.x.v - b1.x.v;
  const sy = b2.y.v - b1.y.v;
  const la = Math.hypot(rx, ry);
  const lb = Math.hypot(sx, sy);
  if (la <= tol || lb <= tol) return null;
  // Parallel: over the shorter line the two directions part by less than tol.
  if (Math.abs(rx * sy - ry * sx) / Math.max(la, lb) <= tol) return null;
  const aV = Math.abs(rx) <= tol;
  const aH = Math.abs(ry) <= tol;
  const bV = Math.abs(sx) <= tol;
  const bH = Math.abs(sy) <= tol;
  if (aV && bH) return pt(a1.x, b1.y);
  if (aH && bV) return pt(b1.x, a1.y);
  // One line axis-aligned: read the other at that x (or y).
  const atX = (x: S, p: SP, q: SP): SP => pt(x, add(p.y, div(mul(sub(x, p.x), sub(q.y, p.y)), sub(q.x, p.x))));
  const atY = (y: S, p: SP, q: SP): SP => pt(add(p.x, div(mul(sub(y, p.y), sub(q.x, p.x)), sub(q.y, p.y))), y);
  if (aV) return atX(a1.x, b1, b2);
  if (bV) return atX(b1.x, a1, a2);
  if (aH) return atY(a1.y, b1, b2);
  if (bH) return atY(b1.y, a1, a2);
  const dax = sub(a2.x, a1.x);
  const day = sub(a2.y, a1.y);
  const dbx = sub(b2.x, b1.x);
  const dby = sub(b2.y, b1.y);
  const t = div(sub(mul(sub(b1.x, a1.x), dby), mul(sub(b1.y, a1.y), dbx)), sub(mul(dax, dby), mul(day, dbx)));
  return pt(add(a1.x, mul(t, dax)), add(a1.y, mul(t, day)));
}

/** Mirror image of p in the line through a and b. */
export function mirrorPoint(p: SP, a: SP, b: SP, tol: number): SP {
  const ux = b.x.v - a.x.v;
  const uy = b.y.v - a.y.v;
  const two = lit(2);
  if (Math.abs(ux) <= tol) return pt(sub(mul(two, a.x), p.x), p.y);
  if (Math.abs(uy) <= tol) return pt(p.x, sub(mul(two, a.y), p.y));
  const dx = sub(b.x, a.x);
  const dy = sub(b.y, a.y);
  const t = div(add(mul(sub(p.x, a.x), dx), mul(sub(p.y, a.y), dy)), add(mul(dx, dx), mul(dy, dy)));
  const fx = add(a.x, mul(t, dx));
  const fy = add(a.y, mul(t, dy));
  return pt(sub(mul(two, fx), p.x), sub(mul(two, fy), p.y));
}

/** p turned `deg` degrees counter-clockwise about c. Quarter turns are exact swaps. */
export function rotatePoint(p: SP, c: SP, deg: S): SP {
  const dx = sub(p.x, c.x);
  const dy = sub(p.y, c.y);
  if (NUM.test(deg.e)) {
    const q = ((Math.round(deg.v) % 360) + 360) % 360;
    if (Math.abs(deg.v - Math.round(deg.v)) < 1e-12 && q % 90 === 0) {
      if (q === 0) return p;
      if (q === 90) return pt(sub(c.x, dy), add(c.y, dx));
      if (q === 180) return pt(sub(c.x, dx), sub(c.y, dy));
      return pt(add(c.x, dy), sub(c.y, dx));
    }
  }
  const cs = fn("cos", deg);
  const sn = fn("sin", deg);
  return pt(add(c.x, sub(mul(dx, cs), mul(dy, sn))), add(c.y, add(mul(dx, sn), mul(dy, cs))));
}

/** Signed area (positive = counter-clockwise) of current values. */
export function areaOf(pts: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

const val = (p: SP) => ({ x: p.x.v, y: p.y.v });

/**
 * The outline `d` to one side: side +1 is left of the direction of travel
 * (outside of a clockwise loop, inside of a counter-clockwise one), −1 right.
 * Each edge moves along its own normal and consecutive edges are re-joined at
 * their crossing (mitred), so a band stays exactly `d` thick at any values.
 */
export function offsetPoints(pts: SP[], d: S, closed: boolean, side: 1 | -1, tol: number): SP[] {
  const n = pts.length;
  const edges = closed ? n : n - 1;
  const moved: [SP, SP][] = [];
  for (let i = 0; i < edges; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b.x.v - a.x.v;
    const dy = b.y.v - a.y.v;
    let nx: S;
    let ny: S;
    if (Math.abs(dy) <= tol) {
      nx = lit(0);
      ny = mul(lit(side * Math.sign(dx)), d);
    } else if (Math.abs(dx) <= tol) {
      nx = mul(lit(-side * Math.sign(dy)), d);
      ny = lit(0);
    } else {
      const len = fn("hypot", sub(b.x, a.x), sub(b.y, a.y));
      nx = div(mul(lit(-side), mul(d, sub(b.y, a.y))), len);
      ny = div(mul(lit(side), mul(d, sub(b.x, a.x))), len);
    }
    moved.push([translate(a, nx, ny), translate(b, nx, ny)]);
  }
  const out: SP[] = [];
  for (let i = 0; i < n; i++) {
    if (!closed && i === 0) {
      out.push(moved[0][0]);
      continue;
    }
    if (!closed && i === n - 1) {
      out.push(moved[edges - 1][1]);
      continue;
    }
    const prev = moved[(i - 1 + edges) % edges];
    const next = moved[i % edges];
    out.push(intersect(prev[0], prev[1], next[0], next[1], tol) ?? next[0]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Polygon booleans with provenance
// ---------------------------------------------------------------------------

export type BooleanOp = "union" | "difference" | "intersection";

interface Seg {
  p: SP;
  q: SP;
  set: 0 | 1;
  loop: number;
  splits: { t: number; at: SP }[];
}

function inside(loops: SP[][], x: number, y: number): boolean {
  let odd = false;
  for (const loop of loops) {
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const a = val(loop[i]);
      const b = val(loop[j]);
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) odd = !odd;
    }
  }
  return odd;
}

/**
 * `a op b` for regions bounded by closed loops (even-odd within each side, so
 * a loop inside another is a hole). Returns the result's loops, outer ones
 * counter-clockwise and holes clockwise. Every vertex is either a vertex of
 * `a` or `b` — its own expression — or the crossing of two of their edges,
 * written with `intersect`; so the result follows the values its sources
 * follow.
 */
export function booleanLoops(op: BooleanOp, a: SP[][], b: SP[][], tol: number): SP[][] {
  const segs: Seg[] = [];
  const add1 = (loops: SP[][], set: 0 | 1) =>
    loops.forEach((loop, li) => {
      for (let i = 0; i < loop.length; i++) {
        const p = loop[i];
        const q = loop[(i + 1) % loop.length];
        if (Math.hypot(q.x.v - p.x.v, q.y.v - p.y.v) > tol) segs.push({ p, q, set, loop: set * 100000 + li, splits: [] });
      }
    });
  add1(a, 0);
  add1(b, 1);

  const param = (s: Seg, x: number, y: number) => {
    const dx = s.q.x.v - s.p.x.v;
    const dy = s.q.y.v - s.p.y.v;
    return ((x - s.p.x.v) * dx + (y - s.p.y.v) * dy) / (dx * dx + dy * dy);
  };
  const distTo = (s: Seg, x: number, y: number) => {
    const t = Math.max(0, Math.min(1, param(s, x, y)));
    return Math.hypot(s.p.x.v + t * (s.q.x.v - s.p.x.v) - x, s.p.y.v + t * (s.q.y.v - s.p.y.v) - y);
  };
  const len = (s: Seg) => Math.hypot(s.q.x.v - s.p.x.v, s.q.y.v - s.p.y.v);
  // A vertex of one segment lying inside another splits it there (T-junctions,
  // shared edges); proper crossings split both.
  for (let i = 0; i < segs.length; i++) {
    for (let j = 0; j < segs.length; j++) {
      if (i === j || segs[i].loop === segs[j].loop) continue;
      const s = segs[i];
      const f = segs[j];
      for (const end of [f.p, f.q]) {
        const t = param(s, end.x.v, end.y.v);
        const ends = tol / len(s);
        if (t > ends && t < 1 - ends && distTo(s, end.x.v, end.y.v) <= tol) s.splits.push({ t, at: end });
      }
      if (j < i) continue;
      const hit = intersect(s.p, s.q, f.p, f.q, tol);
      if (!hit) continue;
      const ts = param(s, hit.x.v, hit.y.v);
      const tf = param(f, hit.x.v, hit.y.v);
      const es = tol / len(s);
      const ef = tol / len(f);
      if (ts > es && ts < 1 - es && tf > ef && tf < 1 - ef) {
        s.splits.push({ t: ts, at: hit });
        f.splits.push({ t: tf, at: hit });
      }
    }
  }

  const keepRegion = (x: number, y: number) => {
    const ia = inside(a, x, y);
    const ib = inside(b, x, y);
    return op === "union" ? ia || ib : op === "intersection" ? ia && ib : ia && !ib;
  };
  const pieces: [SP, SP][] = [];
  const seen = new Set<string>();
  const key = (p: SP) => `${Math.round(p.x.v / tol)},${Math.round(p.y.v / tol)}`;
  for (const s of segs) {
    const cuts = [{ t: 0, at: s.p }, ...s.splits.sort((u, w) => u.t - w.t), { t: 1, at: s.q }];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const p = cuts[k].at;
      const q = cuts[k + 1].at;
      const L = Math.hypot(q.x.v - p.x.v, q.y.v - p.y.v);
      if (L <= tol) continue;
      const mx = (p.x.v + q.x.v) / 2;
      const my = (p.y.v + q.y.v) / 2;
      const nx = (-(q.y.v - p.y.v) / L) * tol;
      const ny = ((q.x.v - p.x.v) / L) * tol;
      const left = keepRegion(mx + nx, my + ny);
      const right = keepRegion(mx - nx, my - ny);
      if (left === right) continue;
      const piece: [SP, SP] = left ? [p, q] : [q, p];
      const id = `${key(piece[0])}>${key(piece[1])}`;
      if (seen.has(id)) continue;
      seen.add(id);
      pieces.push(piece);
    }
  }

  // Chain into loops, interior on the left; at a vertex where two outlines
  // touch, take the sharpest left turn so each loop stays simple.
  const from = new Map<string, number[]>();
  pieces.forEach((pc, i) => from.set(key(pc[0]), [...(from.get(key(pc[0])) ?? []), i]));
  const used = new Set<number>();
  const loops: SP[][] = [];
  for (let start = 0; start < pieces.length; start++) {
    if (used.has(start)) continue;
    const loop: SP[] = [];
    let cur = start;
    for (let guard = 0; guard <= pieces.length; guard++) {
      used.add(cur);
      const [p, q] = pieces[cur];
      loop.push(p);
      const options = (from.get(key(q)) ?? []).filter((i) => !used.has(i) || i === start);
      if (!options.length) break;
      const hx = q.x.v - p.x.v;
      const hy = q.y.v - p.y.v;
      const turn = (i: number) => {
        const [, r] = pieces[i];
        const ox = r.x.v - q.x.v;
        const oy = r.y.v - q.y.v;
        return Math.atan2(hx * oy - hy * ox, hx * ox + hy * oy);
      };
      const next = options.sort((u, w) => turn(w) - turn(u))[0];
      if (next === start) break;
      cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
