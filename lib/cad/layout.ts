/**
 * Annotation layout: finding each label somewhere it can be read.
 *
 * A drawing can be geometrically perfect and still unreadable — a dimension
 * text sitting on a leader, a note over a hatch, two level callouts in the same
 * 3 mm of paper. On a board a draftsman fixes that by moving the note, never by
 * moving the wall, and never by shrinking the lettering: the sheet's text
 * height is a standard, not a free variable. This module does the same thing,
 * mechanically.
 *
 * It works on the DRAW LIST — the one set of primitives the canvas, SVG, DXF
 * and PDF all share — so what it judges is exactly what is plotted: real text
 * boxes from the real string and the real height, real dimension lines, real
 * arrowheads. Every candidate position is a rigid translation of what the
 * annotation already draws, so a move can change where a label sits and nothing
 * else about it.
 *
 * It knows nothing about bridges, or about which annotation is "important". It
 * is given placeables, obstacles and a gap, and it returns the placement of
 * each that costs least — collisions first, then nearness to where the author
 * put it, so an annotation that is already fine stays exactly where it is.
 */

import type { Point } from "@/lib/geometry/types";
import type { DrawPrim } from "./drawList";
import { textWidth } from "./drawList";

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** How much a thing in the way matters. Hatching is background; ink is not. */
export type ObstacleWeight = number;

export interface Obstacle {
  id: string;
  kind: string;
  ink: Ink;
  weight: ObstacleWeight;
  /**
   * Whether its lines crossing another's is a fault. True between leaders,
   * which should never cross; false for dimension and geometry lines, which
   * cross one another on every real drawing.
   */
  crossable?: boolean;
}

/** One place an annotation could go, and what the caller should record for it. */
export interface Placement<T = unknown> {
  ink: Ink;
  /** How far this is from where the author put it, mm. */
  distance: number;
  payload: T;
}

export interface Placeable<T = unknown> {
  id: string;
  kind: string;
  weight: ObstacleWeight;
  crossable?: boolean;
  /** Candidates, the first of which must be the placement it has now. */
  options: Placement<T>[];
}

export interface Clash {
  a: string;
  b: string;
  /** overlap: they share paper. close: less than the gap between them. crossing: their lines cross. */
  kind: "overlap" | "close" | "crossing";
  /** mm² of shared paper, or mm short of the gap, or 1 for a crossing. */
  amount: number;
  /**
   * Worth avoiding, but not a fault: a note written over hatching is ordinary
   * on a drawing (the hatch is background, and a plotter masks it behind the
   * words). The pass prefers a clear spot; it does not insist on one.
   */
  soft?: boolean;
}

export interface LayoutOptions {
  /** The clear space every annotation keeps around it, model mm. */
  gap: number;
  /** How many relaxation rounds to run (each one re-reads what the others did). */
  passes?: number;
  /**
   * How much a millimetre of movement costs against a millimetre of clash.
   * Small: a clash is always worth moving away from; among clear positions the
   * nearest to the author's wins.
   */
  distanceWeight?: number;
}

export interface LayoutResult<T = unknown> {
  /** The chosen option per placeable id (index into its options). */
  chosen: Map<string, { index: number; payload: T; distance: number }>;
  /** Ids whose placement changed. */
  moved: string[];
  /** What is still in the way after the pass. */
  clashes: Clash[];
  /** Total cost before and after, for reporting. */
  cost: { before: number; after: number };
}

// ---------------------------------------------------------------------------
// Boxes
// ---------------------------------------------------------------------------

const EMPTY: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

export const boxOf = (points: Point[]): Box =>
  points.reduce(
    (b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }),
    EMPTY
  );

export const translateBox = (b: Box, dx: number, dy: number): Box => ({ minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy });

export const boxArea = (b: Box) => Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);

const valid = (b: Box) => Number.isFinite(b.minX) && Number.isFinite(b.minY) && b.maxX >= b.minX && b.maxY >= b.minY;

/** Shared area of two boxes; 0 when they do not overlap. */
export function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Clear distance between two boxes: 0 when they touch or overlap. */
export function boxGap(a: Box, b: Box): number {
  const dx = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
  const dy = Math.max(0, Math.max(a.minY - b.maxY, b.minY - a.maxY));
  return Math.hypot(dx, dy);
}

/**
 * The box a text primitive actually inks.
 *
 * The draw list carries the string, its height and how it is anchored, which is
 * everything needed to say where the letters land — width from the longest
 * line, height from the line count, then the anchor's own offsets. A rotated
 * text is measured by its corners, so a note written along a batter is judged
 * by the paper it really covers rather than by an upright box that would be
 * both too wide and too short.
 */
export function textBox(p: Extract<DrawPrim, { k: "text" }>): Box {
  const lines = p.text.split("\n");
  const w = textWidth(p.text, p.height);
  const lineHeight = p.height * 1.35;
  const h = p.height + (lines.length - 1) * lineHeight;
  // Canvas text: y is the first baseline, and the draw list's y grows downward.
  const left = p.align === "center" ? -w / 2 : p.align === "right" ? -w : 0;
  const top = p.baseline === "top" ? 0 : p.baseline === "middle" ? -h / 2 : -h;
  const corners: Point[] = [
    { x: left, y: top },
    { x: left + w, y: top },
    { x: left + w, y: top + h },
    { x: left, y: top + h },
  ];
  const a = (-(p.rotation ?? 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return boxOf(corners.map((q) => ({ x: p.x + q.x * c - q.y * s, y: p.y + q.x * s + q.y * c })));
}

/**
 * What a list of primitives inks, split the way a draftsman judges a sheet.
 *
 * The distinction matters more than it looks. LINES may cross each other all
 * day — every dimension chain crosses the extension lines of the one beside it,
 * and a section line crosses whatever it cuts; that is drafting, not a fault.
 * WORDS may not be crossed by anything, and may not sit on other words. So
 * text is kept as boxes and everything else as segments, and the tests below
 * ask only the questions that have a real answer: is something written where
 * something else is drawn?
 */
export interface Ink {
  /** Boxes of the words. */
  texts: Box[];
  /** Flat [x1, y1, x2, y2, …] of everything drawn as a line. */
  segments: number[];
  /**
   * Everything it inks, in one box. Kept so the costly tests can be skipped
   * for the overwhelming majority of pairs, which are nowhere near each other:
   * a sheet has hundreds of things on it and each one has a handful of
   * neighbours.
   */
  bounds: Box;
}

export function inkOf(prims: DrawPrim[]): Ink {
  const texts: Box[] = [];
  const segments: number[] = [];
  const addRing = (points: Point[], closed: boolean) => {
    const n = closed ? points.length : points.length - 1;
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      segments.push(a.x, a.y, b.x, b.y);
    }
  };
  for (const p of prims) {
    switch (p.k) {
      case "text": {
        const b = textBox(p);
        if (valid(b)) texts.push(b);
        break;
      }
      case "line":
        segments.push(p.x1, p.y1, p.x2, p.y2);
        break;
      case "polyline":
        addRing(p.points, p.closed);
        break;
      case "fill":
        addRing(p.points, true);
        break;
      case "circle":
      case "arc": {
        // A circle is approximated by a polygon: near enough for deciding
        // whether a word sits on it, and it keeps one test for everything.
        const steps = 16;
        const from = p.k === "arc" ? (p.start * Math.PI) / 180 : 0;
        const to = p.k === "arc" ? (p.end * Math.PI) / 180 : 2 * Math.PI;
        const pts: Point[] = [];
        for (let i = 0; i <= steps; i++) {
          const a = from + ((to - from) * i) / steps;
          pts.push({ x: p.cx + p.r * Math.cos(a), y: p.cy + p.r * Math.sin(a) });
        }
        addRing(pts, false);
        break;
      }
      case "dots":
        break;
      case "segments":
        for (const v of p.segs) segments.push(v);
        break;
    }
  }
  const pts: Point[] = [];
  for (const b of texts) pts.push({ x: b.minX, y: b.minY }, { x: b.maxX, y: b.maxY });
  for (let i = 0; i + 1 < segments.length; i += 2) pts.push({ x: segments[i], y: segments[i + 1] });
  return { texts, segments, bounds: boxOf(pts) };
}

export const translateInk = (ink: Ink, dx: number, dy: number): Ink => ({
  texts: ink.texts.map((b) => translateBox(b, dx, dy)),
  segments: ink.segments.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)),
  bounds: translateBox(ink.bounds, dx, dy),
});

// ---------------------------------------------------------------------------
// Clashes
// ---------------------------------------------------------------------------

/** Do two segments cross? Proper crossing only — touching at an end does not count. */
function segmentsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const side = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  const d1 = side(ax, ay, bx, by, cx, cy);
  const d2 = side(ax, ay, bx, by, dx, dy);
  const d3 = side(cx, cy, dx, dy, ax, ay);
  const d4 = side(cx, cy, dx, dy, bx, by);
  return d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0 && d1 !== d2 && d3 !== d4;
}

function crossings(a: number[], b: number[]): number {
  let n = 0;
  for (let i = 0; i + 3 < a.length; i += 4) {
    for (let j = 0; j + 3 < b.length; j += 4) {
      if (segmentsCross(a[i], a[i + 1], a[i + 2], a[i + 3], b[j], b[j + 1], b[j + 2], b[j + 3])) n++;
    }
  }
  return n;
}

/** Distance from a point to a segment. */
function pointSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
  return Math.hypot(x1 + t * dx - px, y1 + t * dy - py);
}

/** Does a segment enter a box, and if not, how far outside does it stay? */
function segmentBox(x1: number, y1: number, x2: number, y2: number, b: Box): { inside: boolean; distance: number } {
  const inX = (x: number) => x >= b.minX && x <= b.maxX;
  const inY = (y: number) => y >= b.minY && y <= b.maxY;
  if ((inX(x1) && inY(y1)) || (inX(x2) && inY(y2))) return { inside: true, distance: 0 };
  const edges: [number, number, number, number][] = [
    [b.minX, b.minY, b.maxX, b.minY],
    [b.maxX, b.minY, b.maxX, b.maxY],
    [b.maxX, b.maxY, b.minX, b.maxY],
    [b.minX, b.maxY, b.minX, b.minY],
  ];
  let best = Infinity;
  for (const [ex1, ey1, ex2, ey2] of edges) {
    if (segmentsCross(x1, y1, x2, y2, ex1, ey1, ex2, ey2)) return { inside: true, distance: 0 };
    // Not crossing: how close does it come? Both ways round, because either
    // may hold the nearest pair of points.
    best = Math.min(
      best,
      pointSegment(ex1, ey1, x1, y1, x2, y2),
      pointSegment(ex2, ey2, x1, y1, x2, y2),
      pointSegment(x1, y1, ex1, ey1, ex2, ey2),
      pointSegment(x2, y2, ex1, ey1, ex2, ey2)
    );
  }
  return { inside: false, distance: best };
}

/**
 * What one placement costs against one obstacle.
 *
 * Only the questions a draftsman would ask:
 *   - are two pieces of TEXT on top of each other, or too close to read apart?
 *   - is something DRAWN through a piece of text?
 *   - do two LEADERS cross one another? (A leader crossing a dimension line,
 *     or any other pair of lines crossing, is ordinary drafting.)
 * Overlap is the worst; being nearer than the gap is the same fault, smaller,
 * because a label a hair's breadth from a line reads no better than one on it.
 */
function pairCost(a: Ink, b: Obstacle, gap: number, aCrossable = false): { cost: number; clash: Clash | null } {
  // Nowhere near each other: nothing to weigh.
  if (!valid(a.bounds) || !valid(b.ink.bounds) || boxGap(a.bounds, b.ink.bounds) > gap) return { cost: 0, clash: null };
  let area = 0;
  let shortfall = 0;
  let through = 0;
  for (const ta of a.texts) {
    for (const tb of b.ink.texts) {
      const ov = overlapArea(ta, tb);
      if (ov > 0) area += ov;
      else {
        const g = boxGap(ta, tb);
        if (g < gap) shortfall = Math.max(shortfall, gap - g);
      }
    }
    for (let i = 0; i + 3 < b.ink.segments.length; i += 4) {
      const r = segmentBox(b.ink.segments[i], b.ink.segments[i + 1], b.ink.segments[i + 2], b.ink.segments[i + 3], ta);
      if (r.inside) through++;
      else if (r.distance < gap) shortfall = Math.max(shortfall, gap - r.distance);
    }
  }
  // The other way round: this placement's own lines over the obstacle's words.
  for (const tb of b.ink.texts) {
    for (let i = 0; i + 3 < a.segments.length; i += 4) {
      const r = segmentBox(a.segments[i], a.segments[i + 1], a.segments[i + 2], a.segments[i + 3], tb);
      if (r.inside) through++;
      else if (r.distance < gap) shortfall = Math.max(shortfall, gap - r.distance);
    }
  }
  // "Leaders shall not cross one another" — and only one another: a leader over
  // a dimension line is everyday drafting, and moving a dimension three rows to
  // avoid one would be the worse drawing.
  const crossed = aCrossable && b.crossable ? crossings(a.segments, b.ink.segments) : 0;
  // Areas are mm²; dividing by the gap turns them into a length so overlap,
  // spacing and crossings can be weighed against one another.
  const cost = (area / Math.max(gap, 1) + shortfall + through * gap * 2 + crossed * gap) * b.weight;
  const soft = b.weight < 0.5 || undefined;
  const clash: Clash | null =
    area > 0
      ? { a: "", b: b.id, kind: "overlap", amount: area, soft }
      : through > 0
        ? { a: "", b: b.id, kind: "overlap", amount: through * gap * gap, soft }
        : crossed > 0
          ? { a: "", b: b.id, kind: "crossing", amount: crossed, soft }
          : shortfall > 0
            ? { a: "", b: b.id, kind: "close", amount: shortfall, soft }
            : null;
  return { cost, clash };
}

const asObstacle = (p: Placeable, opt: Placement): Obstacle => ({ id: p.id, kind: p.kind, ink: opt.ink, weight: p.weight, crossable: p.crossable });

/** Everything still in the way, with the current placement of each placeable. */
export function findClashes<T>(items: Placeable<T>[], obstacles: Obstacle[], gap: number, chosen?: Map<string, number>): Clash[] {
  const out: Clash[] = [];
  const at = (p: Placeable<T>) => p.options[chosen?.get(p.id) ?? 0];
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    const pa = at(a);
    for (const o of obstacles) {
      const r = pairCost(pa.ink, o, gap, a.crossable);
      if (r.clash) out.push({ ...r.clash, a: a.id });
    }
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      const r = pairCost(pa.ink, asObstacle(b, at(b)), gap, a.crossable);
      if (r.clash) out.push({ ...r.clash, a: a.id });
    }
  }
  return out.sort((x, y) => (x.kind === y.kind ? y.amount - x.amount : x.kind === "overlap" ? -1 : y.kind === "overlap" ? 1 : 0));
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

/**
 * Relaxation, not search: each annotation in turn takes the cheapest place it
 * can, then the next one reads the result, and the round repeats. A drawing
 * settles in two or three rounds because most annotations never move at all;
 * the ones that do are the ones in trouble, and they are handled worst-first so
 * a bad clash is not left standing while a 0.3 mm one is polished.
 *
 * It is deterministic — same drawing, same answer — which matters more here
 * than finding the theoretical optimum: a draftsman must be able to re-run the
 * pass and get their drawing back, not a different one.
 */
export function layoutAnnotations<T>(items: Placeable<T>[], obstacles: Obstacle[], options: LayoutOptions): LayoutResult<T> {
  const gap = options.gap;
  const passes = options.passes ?? 3;
  const wDistance = options.distanceWeight ?? 0.05;
  const chosen = new Map<string, number>(items.map((p) => [p.id, 0]));

  const costOf = (item: Placeable<T>, opt: Placement<T>): number => {
    let cost = opt.distance * wDistance;
    for (const o of obstacles) cost += pairCost(opt.ink, o, gap, item.crossable).cost;
    for (const other of items) {
      if (other.id === item.id) continue;
      cost += pairCost(opt.ink, asObstacle(other, other.options[chosen.get(other.id) ?? 0]), gap, item.crossable).cost * item.weight;
    }
    return cost;
  };

  const totalCost = () => items.reduce((sum, p) => sum + costOf(p, p.options[chosen.get(p.id) ?? 0]), 0);
  const before = totalCost();

  for (let pass = 0; pass < passes; pass++) {
    // Worst first: the annotation most in the way has the most to gain, and
    // moving it often frees the ones that were only crowded by it.
    const order = [...items].sort((a, b) => costOf(b, b.options[chosen.get(b.id) ?? 0]) - costOf(a, a.options[chosen.get(a.id) ?? 0]));
    let changed = false;
    for (const item of order) {
      const currentIndex = chosen.get(item.id) ?? 0;
      let bestIndex = currentIndex;
      let bestCost = costOf(item, item.options[currentIndex]);
      for (let i = 0; i < item.options.length; i++) {
        if (i === currentIndex) continue;
        const c = costOf(item, item.options[i]);
        // A move must be a real improvement, not a rounding-error one: a label
        // that jitters between two equal places on every pass is its own fault.
        if (c < bestCost - 1e-6) {
          bestCost = c;
          bestIndex = i;
        }
      }
      if (bestIndex !== currentIndex) {
        chosen.set(item.id, bestIndex);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const result: LayoutResult<T>["chosen"] = new Map();
  const moved: string[] = [];
  for (const item of items) {
    const i = chosen.get(item.id) ?? 0;
    const opt = item.options[i];
    result.set(item.id, { index: i, payload: opt.payload, distance: opt.distance });
    if (i !== 0) moved.push(item.id);
  }
  return { chosen: result, moved, clashes: findClashes(items, obstacles, gap, chosen), cost: { before, after: totalCost() } };
}
