/**
 * Small planar helpers the drafting layer needs: resolving where an annotation
 * is attached, tracing a closed boundary for a hatch, and clipping pattern
 * lines to it. Model-space tolerances come from the shared policy (§17).
 */

import type { Point, Shape } from "@/lib/geometry/types";
import { getShapeCenter, getPolygonPoints, getStarPoints, rotatePoint } from "@/lib/geometry/metrics";
import { getShapeSegments } from "@/lib/geometry/snapping";
import { DEFAULT_TOLERANCE_POLICY } from "@/lib/geometry/tolerance";
import type { AnchorRef, ShapeHandle } from "./types";

export type ShapeIndex = Map<string, Shape>;

export function indexShapes(shapes: Shape[]): ShapeIndex {
  const m = new Map<string, Shape>();
  for (const s of shapes) m.set(s.id, s);
  return m;
}

/** The vertices of a shape's outline, in drawing order (rotation applied). */
export function shapeVertices(shape: Shape): Point[] {
  const center = getShapeCenter(shape);
  const rot = shape.rotation || 0;
  let pts: Point[];
  switch (shape.type) {
    case "line":
    case "arrow":
      pts = [
        { x: shape.x1, y: shape.y1 },
        { x: shape.x2, y: shape.y2 },
      ];
      break;
    case "rectangle":
      pts = [
        { x: shape.x, y: shape.y },
        { x: shape.x + shape.width, y: shape.y },
        { x: shape.x + shape.width, y: shape.y + shape.height },
        { x: shape.x, y: shape.y + shape.height },
      ];
      break;
    case "polygon":
      pts = getPolygonPoints(shape.cx, shape.cy, shape.r, shape.sides);
      break;
    case "star":
      pts = getStarPoints(shape.cx, shape.cy, shape.innerR, shape.outerR, shape.points);
      break;
    case "circle":
      pts = circlePoints(shape.cx, shape.cy, shape.r, 48);
      break;
    case "ellipse": {
      pts = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        pts.push({ x: shape.cx + shape.rx * Math.cos(a), y: shape.cy + shape.ry * Math.sin(a) });
      }
      break;
    }
  }
  return rot === 0 ? pts : pts.map((p) => rotatePoint(p, center, rot));
}

export function circlePoints(cx: number, cy: number, r: number, n: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

/** Resolves an anchor against the drawing as it is now. */
export function resolveAnchor(ref: AnchorRef, shapes: ShapeIndex): Point | null {
  if (ref.kind === "point") return { x: ref.x, y: ref.y };
  const shape = shapes.get(ref.shapeId);
  if (!shape) return null;
  return shapeHandlePoint(shape, ref.handle);
}

export function shapeHandlePoint(shape: Shape, handle: ShapeHandle): Point | null {
  if (handle === "center") return getShapeCenter(shape);
  const verts = shapeVertices(shape);
  if (verts.length === 0) return null;
  if (handle === "start") return verts[0];
  if (handle === "end") return shape.type === "line" || shape.type === "arrow" ? verts[1] : verts[0];
  if (handle === "mid") {
    if (shape.type === "line" || shape.type === "arrow") {
      return { x: (verts[0].x + verts[1].x) / 2, y: (verts[0].y + verts[1].y) / 2 };
    }
    return getShapeCenter(shape);
  }
  const m = /^v(\d+)$/.exec(handle);
  if (m) {
    const i = Number(m[1]);
    return verts[i] ?? null;
  }
  return null;
}

/** The nearest handle of any shape to `p`, within `radius` — used to make new annotations associative. */
export function nearestHandle(
  shapes: Shape[],
  p: Point,
  radius: number
): { shapeId: string; handle: ShapeHandle; point: Point } | null {
  let best: { shapeId: string; handle: ShapeHandle; point: Point; d: number } | null = null;
  for (const s of shapes) {
    if (s.isVisible === false) continue;
    const verts = shapeVertices(s);
    const cands: { handle: ShapeHandle; point: Point }[] = [];
    if (s.type === "line" || s.type === "arrow") {
      cands.push({ handle: "start", point: verts[0] }, { handle: "end", point: verts[1] });
      cands.push({ handle: "mid", point: { x: (verts[0].x + verts[1].x) / 2, y: (verts[0].y + verts[1].y) / 2 } });
    } else if (s.type === "circle" || s.type === "ellipse") {
      cands.push({ handle: "center", point: getShapeCenter(s) });
    } else {
      verts.forEach((v, i) => cands.push({ handle: `v${i}` as ShapeHandle, point: v }));
      cands.push({ handle: "center", point: getShapeCenter(s) });
    }
    for (const c of cands) {
      const d = Math.hypot(c.point.x - p.x, c.point.y - p.y);
      if (d <= radius && (!best || d < best.d)) best = { shapeId: s.id, handle: c.handle, point: c.point, d };
    }
  }
  return best ? { shapeId: best.shapeId, handle: best.handle, point: best.point } : null;
}

// ---------------------------------------------------------------------------
// Polygons
// ---------------------------------------------------------------------------

export function signedArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
export function pointInRegion(p: Point, outer: Point[], holes: Point[][] = []): boolean {
  if (!pointInPolygon(p, outer)) return false;
  for (const h of holes) if (pointInPolygon(p, h)) return false;
  return true;
}

export function polygonBounds(poly: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Clips an infinite line (point `o`, direction `d`) against a region with holes
 * using the even-odd rule, returning the inside intervals as segment pairs.
 */
export function clipLineToRegion(o: Point, d: Point, rings: Point[][]): [Point, Point][] {
  const ts: number[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const den = d.x * ey - d.y * ex;
      if (Math.abs(den) < 1e-12) continue;
      const ax = a.x - o.x;
      const ay = a.y - o.y;
      const t = (ax * ey - ay * ex) / den;
      const u = (ax * d.y - ay * d.x) / den;
      // Half-open on the edge so a line through a vertex counts it once.
      if (u >= 0 && u < 1) ts.push(t);
    }
  }
  ts.sort((x, y) => x - y);
  const out: [Point, Point][] = [];
  for (let i = 0; i + 1 < ts.length; i += 2) {
    const t0 = ts[i];
    const t1 = ts[i + 1];
    if (t1 - t0 <= 0) continue;
    out.push([
      { x: o.x + d.x * t0, y: o.y + d.y * t0 },
      { x: o.x + d.x * t1, y: o.y + d.y * t1 },
    ]);
  }
  return out;
}

/** The parts of segment a→b that lie inside a region (even-odd rule). */
export function clipSegmentToRegion(a: Point, b: Point, rings: Point[][]): [Point, Point][] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return [];
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const out: [Point, Point][] = [];
  for (const [p, q] of clipLineToRegion(a, d, rings)) {
    const t0 = Math.max(0, (p.x - a.x) * d.x + (p.y - a.y) * d.y);
    const t1 = Math.min(len, (q.x - a.x) * d.x + (q.y - a.y) * d.y);
    if (t1 > t0) out.push([{ x: a.x + d.x * t0, y: a.y + d.y * t0 }, { x: a.x + d.x * t1, y: a.y + d.y * t1 }]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Boundary tracing
// ---------------------------------------------------------------------------

/**
 * A closed ring from a set of shapes.
 *
 * One closed shape (rectangle, polygon, circle) is its own outline. Loose lines
 * are chained end to end, welding endpoints within the shared weld tolerance;
 * the result is `null` when they do not close — an open boundary is exactly the
 * defect a hatch must refuse rather than leak across (blueprint §8).
 */
export function traceRing(shapes: Shape[], weld = DEFAULT_TOLERANCE_POLICY.weld_mm): Point[] | null {
  if (shapes.length === 0) return null;
  if (shapes.length === 1 && shapes[0].type !== "line" && shapes[0].type !== "arrow") {
    return shapeVertices(shapes[0]);
  }
  const segs = shapes.flatMap((s) => getShapeSegments(s));
  if (segs.length < 3) return null;
  const used = new Array(segs.length).fill(false);
  const ring: Point[] = [segs[0].p1, segs[0].p2];
  used[0] = true;
  const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= weld;
  for (let step = 1; step < segs.length; step++) {
    const tail = ring[ring.length - 1];
    let found = -1;
    let reversed = false;
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      if (near(segs[i].p1, tail)) {
        found = i;
        break;
      }
      if (near(segs[i].p2, tail)) {
        found = i;
        reversed = true;
        break;
      }
    }
    if (found < 0) return null;
    used[found] = true;
    ring.push(reversed ? segs[found].p1 : segs[found].p2);
  }
  if (!near(ring[0], ring[ring.length - 1])) return null;
  ring.pop();
  return ring;
}

/** Distance from a point to a segment. */
export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
