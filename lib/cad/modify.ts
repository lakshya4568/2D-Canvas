/**
 * Modify operations — the AutoCAD verbs a draftsman uses every minute:
 * OFFSET, TRIM, EXTEND, BREAK, JOIN, EXPLODE, MIRROR, ARRAY, ROTATE, SCALE,
 * FILLET (to a sharp corner) and COPY.
 *
 * Pure functions over canvas shapes (mm, Y down). They create or replace
 * geometry; they never touch component-generated shapes (those regenerate from
 * their values — editing them by hand would be undone and would lie about the
 * design), and SCALE refuses to run on anything that carries a structural
 * role unless asked explicitly (blueprint §5 guardrail: scaling engineering
 * geometry is a redesign, not an edit).
 */

import type { CircleShape, LineShape, Point, RectangleShape, Shape } from "@/lib/geometry/types";
import { getShapeCenter } from "@/lib/geometry/metrics";
import { getShapeSegments } from "@/lib/geometry/snapping";
import { DEFAULT_TOLERANCE_POLICY } from "@/lib/geometry/tolerance";
import { shapeVertices, signedArea } from "./geometry";

export class ModifyError extends Error {}

let seq = 0;
export function newShapeId(prefix = "shape"): string {
  seq = (seq + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function assertEditable(shapes: Shape[]) {
  const locked = shapes.find((s) => s.componentInstanceId);
  if (locked) throw new ModifyError("That belongs to a component. Change its values in the Run or Bridge panel instead of editing its lines.");
}

// ---------------------------------------------------------------------------
// Point transforms: move, copy, mirror, rotate, scale, arrays
// ---------------------------------------------------------------------------

export type PointMap = (p: Point) => Point;

/** Applies a point map to a shape, keeping its type where the map allows. */
export function transformShape(s: Shape, f: PointMap, reflect = false): Shape {
  switch (s.type) {
    case "line":
    case "arrow": {
      const a = f({ x: s.x1, y: s.y1 });
      const b = f({ x: s.x2, y: s.y2 });
      return { ...s, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    case "circle": {
      const c = f({ x: s.cx, y: s.cy });
      const e = f({ x: s.cx + s.r, y: s.cy });
      return { ...s, cx: c.x, cy: c.y, r: Math.hypot(e.x - c.x, e.y - c.y) };
    }
    case "ellipse":
    case "polygon":
    case "star": {
      const c = f({ x: s.cx, y: s.cy });
      const ref = f({ x: s.cx + 1, y: s.cy });
      const k = Math.hypot(ref.x - c.x, ref.y - c.y);
      const ang = (Math.atan2(ref.y - c.y, ref.x - c.x) * 180) / Math.PI;
      const base = { ...s, cx: c.x, cy: c.y, rotation: ((s.rotation ?? 0) * (reflect ? -1 : 1) + ang) % 360 };
      if (s.type === "ellipse") return { ...base, rx: s.rx * k, ry: s.ry * k } as Shape;
      if (s.type === "polygon") return { ...base, r: s.r * k } as Shape;
      return { ...base, innerR: s.innerR * k, outerR: s.outerR * k } as Shape;
    }
    case "rectangle": {
      const verts = shapeVertices(s).map(f);
      const e1 = { x: verts[1].x - verts[0].x, y: verts[1].y - verts[0].y };
      const e3 = { x: verts[3].x - verts[0].x, y: verts[3].y - verts[0].y };
      const width = Math.hypot(e1.x, e1.y);
      const height = Math.hypot(e3.x, e3.y);
      const cx = (verts[0].x + verts[2].x) / 2;
      const cy = (verts[0].y + verts[2].y) / 2;
      const cross = e1.x * e3.y - e1.y * e3.x;
      const rot = cross > 0 ? Math.atan2(e1.y, e1.x) : Math.atan2(-e1.y, -e1.x);
      let deg = (rot * 180) / Math.PI;
      if (Math.abs(deg) < 1e-9 || Math.abs(Math.abs(deg) - 180) < 1e-9) deg = 0;
      return { ...s, x: cx - width / 2, y: cy - height / 2, width, height, rotation: deg };
    }
  }
}

function copyWithIds(shapes: Shape[], f: PointMap, reflect: boolean, tag: string): Shape[] {
  // Copies keep their grouping as a NEW group, so a copied polyline is still one object.
  const groupMap = new Map<string, string>();
  return shapes.map((s) => {
    const t = transformShape(s, f, reflect);
    let groupId = s.groupId;
    if (groupId) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, newShapeId("grp"));
      groupId = groupMap.get(groupId);
    }
    return { ...t, id: newShapeId(tag), groupId, groupPath: groupId ? [groupId] : undefined, name: s.name ? `${s.name}′` : undefined, source: "user" };
  });
}

export function translate(dx: number, dy: number): PointMap {
  return (p) => ({ x: p.x + dx, y: p.y + dy });
}

export function mirrorMap(a: Point, b: Point): PointMap {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) throw new ModifyError("The mirror line needs two different points.");
  return (p) => {
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    const fx = a.x + t * dx;
    const fy = a.y + t * dy;
    return { x: 2 * fx - p.x, y: 2 * fy - p.y };
  };
}

export function rotateMap(c: Point, deg: number): PointMap {
  // Canvas y runs down, so a positive (counter-clockwise on paper) angle is negative on screen.
  const a = (-deg * Math.PI) / 180;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  return (p) => ({ x: c.x + (p.x - c.x) * cs - (p.y - c.y) * sn, y: c.y + (p.x - c.x) * sn + (p.y - c.y) * cs });
}

export function scaleMap(c: Point, k: number): PointMap {
  return (p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k });
}

export function copyShapes(shapes: Shape[], dx: number, dy: number): Shape[] {
  assertEditable(shapes);
  return copyWithIds(shapes, translate(dx, dy), false, "copy");
}

export function mirrorShapes(shapes: Shape[], a: Point, b: Point): Shape[] {
  assertEditable(shapes);
  return copyWithIds(shapes, mirrorMap(a, b), true, "mirror");
}

export function rotateShapes(shapes: Shape[], c: Point, deg: number): Shape[] {
  assertEditable(shapes);
  const f = rotateMap(c, deg);
  return shapes.map((s) => {
    if (s.type === "line" || s.type === "arrow" || s.type === "rectangle") return transformShape(s, f);
    const cc = f(getShapeCenter(s));
    return { ...transformShape(s, f), cx: cc.x, cy: cc.y, rotation: ((s.rotation ?? 0) - deg) % 360 } as Shape;
  });
}

/** SCALE — refuses structural geometry unless `allowStructural` (it would be a silent redesign). */
export function scaleShapes(shapes: Shape[], c: Point, k: number, allowStructural = false): Shape[] {
  assertEditable(shapes);
  if (!(k > 0)) throw new ModifyError("The scale factor must be positive.");
  if (!allowStructural && shapes.some((s) => s.semanticRole && s.semanticRole !== "annotation")) {
    throw new ModifyError("Scaling changes every size at once — a redesign, not an edit. Change the named values instead, or confirm to scale anyway.");
  }
  return shapes.map((s) => transformShape(s, scaleMap(c, k)));
}

export function arrayRectangular(shapes: Shape[], rows: number, cols: number, dx: number, dy: number): Shape[] {
  assertEditable(shapes);
  if (rows < 1 || cols < 1 || !Number.isInteger(rows) || !Number.isInteger(cols)) throw new ModifyError("Rows and columns must be whole numbers of at least 1.");
  if (rows * cols > 2000) throw new ModifyError(`${rows * cols} copies is too many for one array.`);
  const out: Shape[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (r || c) out.push(...copyWithIds(shapes, translate(c * dx, r * dy), false, "arr"));
  return out;
}

export function arrayPolar(shapes: Shape[], centre: Point, count: number, totalDeg = 360): Shape[] {
  assertEditable(shapes);
  if (count < 2 || !Number.isInteger(count)) throw new ModifyError("A polar array needs at least 2 items.");
  const step = Math.abs(totalDeg - 360) < 1e-9 ? 360 / count : totalDeg / (count - 1);
  const out: Shape[] = [];
  for (let i = 1; i < count; i++) {
    const f = rotateMap(centre, step * i);
    out.push(...copyWithIds(shapes, f, false, "parr"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// OFFSET
// ---------------------------------------------------------------------------

function sideOfLine(a: Point, b: Point, p: Point): number {
  return Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
}

/** Orders a group of lines into a chain; closed when the ends meet. */
export function chainGroup(lines: LineShape[], weld = DEFAULT_TOLERANCE_POLICY.weld_mm): { points: Point[]; closed: boolean } | null {
  if (lines.length === 0) return null;
  const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= weld;
  const segs = lines.map((l) => ({ a: { x: l.x1, y: l.y1 }, b: { x: l.x2, y: l.y2 } }));
  const used = new Array(segs.length).fill(false);
  // Start from an end that no other segment touches, if the chain is open.
  let start = 0;
  for (let i = 0; i < segs.length; i++) {
    const touches = segs.some((s, j) => j !== i && (near(s.a, segs[i].a) || near(s.b, segs[i].a)));
    if (!touches) {
      start = i;
      break;
    }
  }
  const pts: Point[] = [segs[start].a, segs[start].b];
  used[start] = true;
  for (let k = 1; k < segs.length; k++) {
    const tail = pts[pts.length - 1];
    const i = segs.findIndex((s, j) => !used[j] && (near(s.a, tail) || near(s.b, tail)));
    if (i < 0) return null;
    used[i] = true;
    pts.push(near(segs[i].a, tail) ? segs[i].b : segs[i].a);
  }
  const closed = pts.length > 3 && near(pts[0], pts[pts.length - 1]);
  if (closed) pts.pop();
  return { points: pts, closed };
}

/**
 * OFFSET `target` by `distance` towards `side`. Lines give a parallel line,
 * circles and rectangles a concentric copy, a grouped polyline a mitred
 * polyline — the parallel copy that makes wall and slab thicknesses.
 */
export function offsetShape(all: Shape[], target: Shape, distance: number, side: Point): Shape[] {
  assertEditable([target]);
  if (!(distance > 0)) throw new ModifyError("Offset distance must be positive.");
  if (target.groupId && target.type === "line") {
    const members = all.filter((s): s is LineShape => s.type === "line" && s.groupId === target.groupId);
    const chain = chainGroup(members);
    if (chain && members.length > 1) {
      const pts = chain.points;
      let d = distance;
      if (chain.closed) {
        // Positive offset grows the loop; pick by whether `side` is inside.
        const inside = pointInPoly(side, pts);
        const ccw = signedArea(pts) > 0;
        d = (inside ? -1 : 1) * distance * (ccw ? -1 : 1);
      } else {
        const i = nearestSegment(pts, side);
        d = sideOfLine(pts[i], pts[i + 1], side) >= 0 ? distance : -distance;
      }
      const off = offsetPoly(pts, d, chain.closed);
      const gid = newShapeId("grp");
      const n = chain.closed ? off.length : off.length - 1;
      const out: Shape[] = [];
      for (let k = 0; k < n; k++) {
        const a = off[k];
        const b = off[(k + 1) % off.length];
        out.push({ ...(members[0] as LineShape), id: newShapeId("off"), x1: a.x, y1: a.y, x2: b.x, y2: b.y, groupId: gid, groupPath: [gid], name: undefined, source: "user" });
      }
      return out;
    }
  }
  switch (target.type) {
    case "line":
    case "arrow": {
      const a = { x: target.x1, y: target.y1 };
      const b = { x: target.x2, y: target.y2 };
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L === 0) throw new ModifyError("Cannot offset a zero-length line.");
      const s = sideOfLine(a, b, side) || 1;
      const nx = (-(b.y - a.y) / L) * distance * s;
      const ny = ((b.x - a.x) / L) * distance * s;
      return [{ ...target, id: newShapeId("off"), x1: a.x + nx, y1: a.y + ny, x2: b.x + nx, y2: b.y + ny, groupId: undefined, groupPath: undefined, name: undefined, source: "user" }];
    }
    case "circle": {
      const inside = Math.hypot(side.x - target.cx, side.y - target.cy) < target.r;
      const r = target.r + (inside ? -distance : distance);
      if (r <= 0) throw new ModifyError("The offset would shrink the circle to nothing.");
      return [{ ...(target as CircleShape), id: newShapeId("off"), r, name: undefined, source: "user" }];
    }
    case "rectangle": {
      const t = target as RectangleShape;
      const inside = side.x > t.x && side.x < t.x + t.width && side.y > t.y && side.y < t.y + t.height;
      const d = inside ? -distance : distance;
      const w = t.width + 2 * d;
      const h = t.height + 2 * d;
      if (w <= 0 || h <= 0) throw new ModifyError("The offset would turn the rectangle inside out.");
      return [{ ...t, id: newShapeId("off"), x: t.x - d, y: t.y - d, width: w, height: h, name: undefined, source: "user" }];
    }
    default: {
      const pts = shapeVertices(target);
      const inside = pointInPoly(side, pts);
      const ccw = signedArea(pts) > 0;
      const off = offsetPoly(pts, (inside ? -1 : 1) * distance * (ccw ? -1 : 1), true);
      const gid = newShapeId("grp");
      return off.map((a, k) => {
        const b = off[(k + 1) % off.length];
        return { id: newShapeId("off"), type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y, groupId: gid, groupPath: [gid], layerId: target.layerId, source: "user" } as LineShape;
      });
    }
  }
}

function pointInPoly(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function nearestSegment(pts: Point[], p: Point): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = segDist(p, pts[i], pts[i + 1]);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function segDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function lineIntersect(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((a1.x - b1.x) * (b1.y - b2.y) - (a1.y - b1.y) * (b1.x - b2.x)) / d;
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };
}

/** Offsets a polyline to the left of travel (canvas) by d, mitred at corners. */
export function offsetPoly(pts: Point[], d: number, closed: boolean): Point[] {
  const n = pts.length;
  const count = closed ? n : n - 1;
  const edges: { a: Point; b: Point }[] = [];
  for (let i = 0; i < count; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (-(b.y - a.y) / L) * d;
    const ny = ((b.x - a.x) / L) * d;
    edges.push({ a: { x: a.x + nx, y: a.y + ny }, b: { x: b.x + nx, y: b.y + ny } });
  }
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = closed ? edges[(i - 1 + count) % count] : edges[i - 1];
    const next = closed ? edges[i % count] : edges[i];
    if (!prev) out.push(next.a);
    else if (!next) out.push(prev.b);
    else out.push(lineIntersect(prev.a, prev.b, next.a, next.b) ?? next.a);
  }
  return out;
}

// ---------------------------------------------------------------------------
// TRIM, EXTEND, BREAK, FILLET
// ---------------------------------------------------------------------------

/** Parameters t ∈ (0,1) where the line meets any other shape. */
export function cutParameters(all: Shape[], line: LineShape): number[] {
  const a = { x: line.x1, y: line.y1 };
  const b = { x: line.x2, y: line.y2 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  const ts: number[] = [];
  for (const s of all) {
    if (s.id === line.id || s.isVisible === false) continue;
    if (s.type === "circle") {
      // Line–circle intersections.
      const fx = a.x - s.cx;
      const fy = a.y - s.cy;
      const A = L2;
      const B = 2 * (fx * dx + fy * dy);
      const C = fx * fx + fy * fy - s.r * s.r;
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const r = Math.sqrt(disc);
        for (const t of [(-B - r) / (2 * A), (-B + r) / (2 * A)]) if (t > 1e-9 && t < 1 - 1e-9) ts.push(t);
      }
      continue;
    }
    for (const seg of getShapeSegments(s)) {
      const ex = seg.p2.x - seg.p1.x;
      const ey = seg.p2.y - seg.p1.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const qx = seg.p1.x - a.x;
      const qy = seg.p1.y - a.y;
      const t = (qx * ey - qy * ex) / den;
      const u = (qx * dy - qy * dx) / den;
      if (u >= -1e-9 && u <= 1 + 1e-9 && t > 1e-9 && t < 1 - 1e-9) ts.push(t);
    }
  }
  return [...new Set(ts.map((t) => Number(t.toFixed(12))))].sort((x, y) => x - y);
}

function paramOf(line: LineShape, p: Point): number {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  return ((p.x - line.x1) * dx + (p.y - line.y1) * dy) / (dx * dx + dy * dy || 1);
}

function at(line: LineShape, t: number): Point {
  return { x: line.x1 + (line.x2 - line.x1) * t, y: line.y1 + (line.y2 - line.y1) * t };
}

/**
 * TRIM the part of `line` around `pick` between its neighbouring
 * intersections. With no cutting edges the whole line goes (AutoCAD quick
 * mode). Returns the replacement pieces (0, 1 or 2 lines).
 */
export function trimLine(all: Shape[], line: LineShape, pick: Point): LineShape[] {
  assertEditable([line]);
  const ts = cutParameters(all, line);
  const tp = Math.max(0, Math.min(1, paramOf(line, pick)));
  let lo = 0;
  let hi = 1;
  for (const t of ts) {
    if (t <= tp) lo = t;
    else {
      hi = t;
      break;
    }
  }
  const out: LineShape[] = [];
  if (lo > 0) {
    const p = at(line, lo);
    out.push({ ...line, id: newShapeId("trim"), x2: p.x, y2: p.y });
  }
  if (hi < 1) {
    const p = at(line, hi);
    out.push({ ...line, id: newShapeId("trim"), x1: p.x, y1: p.y });
  }
  if (out.length === 1) out[0] = { ...out[0], id: line.id };
  return out;
}

/** EXTEND the end of `line` nearer `pick` to the first shape it meets. */
export function extendLine(all: Shape[], line: LineShape, pick: Point): LineShape {
  assertEditable([line]);
  const fromEnd = Math.hypot(pick.x - line.x2, pick.y - line.y2) < Math.hypot(pick.x - line.x1, pick.y - line.y1);
  const far = 1e7;
  const probe: LineShape = fromEnd
    ? { ...line, x2: line.x1 + (line.x2 - line.x1) * far, y2: line.y1 + (line.y2 - line.y1) * far }
    : { ...line, x1: line.x2 + (line.x1 - line.x2) * far, y1: line.y2 + (line.y1 - line.y2) * far };
  const ts = cutParameters(all, probe);
  // In the probe's own parameter, the original segment occupies [0, 1/far] (or [1-1/far, 1]).
  if (fromEnd) {
    const t = ts.find((x) => x > 1 / far + 1e-12);
    if (t === undefined) throw new ModifyError("Nothing to extend to in that direction.");
    const p = at(probe, t);
    return { ...line, x2: p.x, y2: p.y };
  }
  const cand = ts.filter((x) => x < 1 - 1 / far - 1e-12);
  if (cand.length === 0) throw new ModifyError("Nothing to extend to in that direction.");
  const p = at(probe, cand[cand.length - 1]);
  return { ...line, x1: p.x, y1: p.y };
}

/** BREAK a line at a point into two. */
export function breakLine(line: LineShape, p: Point): [LineShape, LineShape] {
  assertEditable([line]);
  const t = Math.max(0, Math.min(1, paramOf(line, p)));
  if (t <= 1e-6 || t >= 1 - 1e-6) throw new ModifyError("Pick a point inside the line, not at its end.");
  const q = at(line, t);
  return [
    { ...line, x2: q.x, y2: q.y },
    { ...line, id: newShapeId("brk"), x1: q.x, y1: q.y, name: line.name ? `${line.name}b` : undefined },
  ];
}

/** FILLET with radius 0: extend or trim two lines to meet at their intersection, keeping the picked sides. */
export function filletCorner(l1: LineShape, pick1: Point, l2: LineShape, pick2: Point): [LineShape, LineShape] {
  assertEditable([l1, l2]);
  const x = lineIntersect({ x: l1.x1, y: l1.y1 }, { x: l1.x2, y: l1.y2 }, { x: l2.x1, y: l2.y1 }, { x: l2.x2, y: l2.y2 });
  if (!x) throw new ModifyError("The lines are parallel — they never meet.");
  const keep = (l: LineShape, pick: Point): LineShape => {
    const tx = paramOf(l, x);
    const tp = paramOf(l, pick);
    // Keep the end on the picked side of the intersection; move the other end to it.
    return tp < tx ? { ...l, x2: x.x, y2: x.y } : { ...l, x1: x.x, y1: x.y };
  };
  return [keep(l1, pick1), keep(l2, pick2)];
}

// ---------------------------------------------------------------------------
// JOIN / EXPLODE
// ---------------------------------------------------------------------------

/** JOIN connected lines into one polyline object (a shared group). */
export function joinLines(lines: LineShape[]): { groupId: string; closed: boolean } {
  assertEditable(lines);
  if (lines.length < 2) throw new ModifyError("Select at least two lines to join.");
  const chain = chainGroup(lines);
  if (!chain) throw new ModifyError("Those lines do not connect end to end.");
  return { groupId: newShapeId("pl"), closed: chain.closed };
}

/** EXPLODE a rectangle or polygon into lines, or a polyline group into free lines. */
export function explodeShape(s: Shape): Shape[] {
  assertEditable([s]);
  if (s.type === "line" || s.type === "arrow") return [{ ...s, groupId: undefined, groupPath: undefined, groupName: undefined }];
  if (s.type === "circle" || s.type === "ellipse") throw new ModifyError("A circle is already a single primitive.");
  const pts = shapeVertices(s);
  return pts.map((a, k) => {
    const b = pts[(k + 1) % pts.length];
    return { id: newShapeId("exp"), type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y, layerId: s.layerId, strokeColor: s.strokeColor, name: s.name ? `${s.name}.e${k + 1}` : undefined, source: "user" } as LineShape;
  });
}
