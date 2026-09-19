/**
 * Material hatching.
 *
 * A hatch is generated from its boundary on every render, never stored as
 * lines, so it follows the geometry it fills (blueprint §8: "hatch must be
 * associative by default"). Pattern spacing is set in PAPER millimetres and
 * multiplied by the annotation scale, so a concrete stipple reads the same on a
 * 1:50 detail as on a 1:200 GAD instead of being guessed per view.
 *
 * Patterns follow Indian drafting convention for sections: stipple with small
 * triangles for concrete, finer stipple for PCC levelling courses, grouped
 * diagonals for earth, brick courses for masonry, short dashes for water, dense
 * diagonals for steel.
 */

import type { Point } from "@/lib/geometry/types";
import type { DrawPrim, PrimStyle } from "./drawList";
import type { HatchMaterial } from "./types";
import { clipLineToRegion, clipSegmentToRegion, pointInRegion, polygonBounds } from "./geometry";

interface PatternSpec {
  /** Paper mm between pattern rows. */
  spacing: number;
  label: string;
}

export const HATCH_MATERIALS: Record<HatchMaterial, PatternSpec> = {
  concrete: { spacing: 2.2, label: "Concrete (stipple)" },
  rcc: { spacing: 2.2, label: "Reinforced concrete" },
  pcc: { spacing: 1.6, label: "PCC / levelling course" },
  earth: { spacing: 3, label: "Earth / soil" },
  backfill: { spacing: 3.5, label: "Backfill / granular" },
  masonry: { spacing: 2.5, label: "Stone masonry" },
  brick: { spacing: 2, label: "Brick masonry" },
  water: { spacing: 3, label: "Water" },
  steel: { spacing: 1, label: "Steel" },
  rock: { spacing: 3, label: "Rock" },
  sand: { spacing: 1.2, label: "Sand" },
  ballast: { spacing: 2.4, label: "Ballast" },
  boulder: { spacing: 1.6, label: "Boulder / dry rubble (honeycomb)" },
  gravel: { spacing: 2.2, label: "Gravel / granular filling" },
  pitching: { spacing: 1.4, label: "Stone pitching (ovals along the slope)" },
  granular: { spacing: 1.8, label: "Granular layer (vertical dashes)" },
  solid: { spacing: 1, label: "Solid fill" },
};

/** Keeps a pathological hatch (huge area, tiny scale) from freezing the canvas. */
const MAX_PATTERN_ITEMS = 12000;

/** Deterministic pseudo-random sequence seeded by the hatch id, so a stipple never shimmers between renders. */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

function hatchLines(
  outer: Point[],
  holes: Point[][],
  angleDeg: number,
  spacing: number,
  dash?: [number, number]
): number[] {
  const rings = [outer, ...holes];
  const b = polygonBounds(outer);
  const a = (angleDeg * Math.PI) / 180;
  const d = { x: Math.cos(a), y: -Math.sin(a) };
  const n = { x: -d.y, y: d.x };
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const half = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2;
  const count = Math.min(Math.ceil((2 * half) / spacing), MAX_PATTERN_ITEMS);
  const step = (2 * half) / Math.max(count, 1);
  const segs: number[] = [];
  for (let i = 0; i <= count; i++) {
    const off = -half + i * step;
    const o = { x: cx + n.x * off, y: cy + n.y * off };
    for (const [p, q] of clipLineToRegion(o, d, rings)) {
      if (!dash) {
        segs.push(p.x, p.y, q.x, q.y);
        continue;
      }
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const [on, off2] = dash;
      // Stagger alternate rows so the dashes read as a texture, not a grid.
      let t = (i % 2) * (on + off2) * 0.5;
      while (t < len) {
        const t1 = Math.min(len, t + on);
        segs.push(p.x + d.x * t, p.y + d.y * t, p.x + d.x * t1, p.y + d.y * t1);
        t += on + off2;
      }
      if (segs.length > MAX_PATTERN_ITEMS * 4) return segs;
    }
  }
  return segs;
}

function stipple(outer: Point[], holes: Point[][], spacing: number, seed: string): Point[] {
  const b = polygonBounds(outer);
  const cols = Math.ceil((b.maxX - b.minX) / spacing);
  const rows = Math.ceil((b.maxY - b.minY) / spacing);
  let step = spacing;
  if (cols * rows > MAX_PATTERN_ITEMS) step = spacing * Math.sqrt((cols * rows) / MAX_PATTERN_ITEMS);
  const r = rng(seed);
  const pts: Point[] = [];
  for (let y = b.minY; y <= b.maxY; y += step) {
    for (let x = b.minX; x <= b.maxX; x += step) {
      const p = { x: x + (r() - 0.5) * step * 0.9, y: y + (r() - 0.5) * step * 0.9 };
      if (pointInRegion(p, outer, holes)) pts.push(p);
    }
  }
  return pts;
}

/** Honeycomb cells clipped to the region — boulder / dry rubble fill. */
function honeycomb(outer: Point[], holes: Point[][], spacing: number): number[] {
  const rings = [outer, ...holes];
  const b = polygonBounds(outer);
  const w = spacing;
  const r = w / Math.sqrt(3);
  const rowH = r * 1.5;
  const segs: number[] = [];
  let row = 0;
  for (let y = b.minY - r; y <= b.maxY + r; y += rowH, row++) {
    const shift = row % 2 === 0 ? 0 : w / 2;
    for (let x = b.minX - w + shift; x <= b.maxX + w; x += w) {
      for (let k = 0; k < 6; k++) {
        const a0 = (Math.PI / 3) * k - Math.PI / 6;
        const a1 = a0 + Math.PI / 3;
        const p = { x: x + r * Math.cos(a0), y: y + r * Math.sin(a0) };
        const q = { x: x + r * Math.cos(a1), y: y + r * Math.sin(a1) };
        for (const [c, e] of clipSegmentToRegion(p, q, rings)) segs.push(c.x, c.y, e.x, e.y);
      }
      if (segs.length > MAX_PATTERN_ITEMS * 4) return segs;
    }
  }
  return segs;
}

/**
 * Stone pitching: staggered rows of ovals laid along `angleDeg` (the slope), each
 * kept only when it sits wholly inside the region.
 */
function pitchingOvals(outer: Point[], holes: Point[][], spacing: number, angleDeg: number): Point[][] {
  const b = polygonBounds(outer);
  const a = (angleDeg * Math.PI) / 180;
  // Canvas y is down: a paper angle turns the other way.
  const u = { x: Math.cos(a), y: -Math.sin(a) };
  const v = { x: -u.y, y: u.x };
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const half = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2;
  const rx = spacing * 0.9;
  const ry = spacing * 0.42;
  const stepU = rx * 2.3;
  const stepV = ry * 2.6;
  const out: Point[][] = [];
  let row = 0;
  for (let t = -half; t <= half; t += stepV, row++) {
    const shift = row % 2 === 0 ? 0 : stepU / 2;
    for (let s = -half + shift; s <= half; s += stepU) {
      const c = { x: cx + u.x * s + v.x * t, y: cy + u.y * s + v.y * t };
      const ring: Point[] = [];
      for (let k = 0; k < 14; k++) {
        const th = (k / 14) * Math.PI * 2;
        const lx = rx * Math.cos(th);
        const ly = ry * Math.sin(th);
        ring.push({ x: c.x + u.x * lx + v.x * ly, y: c.y + u.y * lx + v.y * ly });
      }
      if (ring.every((p) => pointInRegion(p, outer, holes))) out.push(ring);
      if (out.length > MAX_PATTERN_ITEMS / 14) return out;
    }
  }
  return out;
}

/**
 * The primitives that draw one hatch.
 *
 * @param unit model mm per paper mm (the annotation scale times the hatch's own scale)
 */
export function hatchPrims(
  outer: Point[],
  holes: Point[][],
  material: HatchMaterial,
  unit: number,
  style: PrimStyle,
  seed: string,
  angle = 0
): DrawPrim[] {
  if (outer.length < 3) return [];
  const spec = HATCH_MATERIALS[material] ?? HATCH_MATERIALS.concrete;
  const s = spec.spacing * unit;
  const out: DrawPrim[] = [];
  switch (material) {
    case "solid":
      out.push({ k: "fill", points: outer, holes, ...style });
      break;
    case "concrete":
    case "rcc":
    case "pcc":
    case "sand": {
      const dots = stipple(outer, holes, s, seed);
      out.push({ k: "dots", points: dots, r: 0.18 * unit, ...style });
      if (material === "concrete" || material === "rcc") {
        // Small aggregate triangles on a sparser grid.
        const tri = stipple(outer, holes, s * 3.2, seed + "#agg");
        const t = 0.55 * unit;
        const segs: number[] = [];
        const r = rng(seed + "#rot");
        for (const p of tri) {
          const a0 = r() * Math.PI * 2;
          const v = [0, 1, 2].map((k) => ({
            x: p.x + t * Math.cos(a0 + (k * 2 * Math.PI) / 3),
            y: p.y + t * Math.sin(a0 + (k * 2 * Math.PI) / 3),
          }));
          segs.push(v[0].x, v[0].y, v[1].x, v[1].y, v[1].x, v[1].y, v[2].x, v[2].y, v[2].x, v[2].y, v[0].x, v[0].y);
        }
        out.push({ k: "segments", segs, ...style });
      }
      if (material === "rcc") {
        out.push({ k: "segments", segs: hatchLines(outer, holes, 45 + angle, s * 4), ...style });
      }
      break;
    }
    case "earth":
      out.push({ k: "segments", segs: hatchLines(outer, holes, 45 + angle, s, [s * 1.2, s * 1.4]), ...style });
      break;
    case "backfill":
      out.push({ k: "segments", segs: hatchLines(outer, holes, 45 + angle, s, [s * 0.8, s * 0.8]), ...style });
      out.push({ k: "dots", points: stipple(outer, holes, s * 1.3, seed), r: 0.2 * unit, ...style });
      break;
    case "rock":
      out.push({ k: "segments", segs: hatchLines(outer, holes, 45 + angle, s), ...style });
      out.push({ k: "segments", segs: hatchLines(outer, holes, 135 + angle, s * 1.7), ...style });
      break;
    case "steel":
      out.push({ k: "segments", segs: hatchLines(outer, holes, 45 + angle, s), ...style });
      break;
    case "water":
      out.push({ k: "segments", segs: hatchLines(outer, holes, angle, s, [s * 1.5, s * 1.5]), ...style });
      break;
    case "ballast": {
      const pts = stipple(outer, holes, s, seed);
      for (const p of pts) out.push({ k: "circle", cx: p.x, cy: p.y, r: 0.35 * unit, ...style });
      break;
    }
    case "boulder":
      out.push({ k: "segments", segs: honeycomb(outer, holes, s), ...style });
      break;
    case "gravel": {
      // Pebbles of a few sizes with fine grit between them.
      const r = rng(seed + "#gravel");
      for (const p of stipple(outer, holes, s * 1.4, seed)) {
        const rad = (0.25 + r() * 0.3) * unit;
        if (pointInRegion({ x: p.x + rad, y: p.y }, outer, holes) && pointInRegion({ x: p.x - rad, y: p.y }, outer, holes)) {
          out.push({ k: "circle", cx: p.x, cy: p.y, r: rad, ...style });
        }
      }
      out.push({ k: "dots", points: stipple(outer, holes, s * 0.7, seed + "#grit"), r: 0.12 * unit, ...style });
      break;
    }
    case "pitching":
      for (const ring of pitchingOvals(outer, holes, s, angle)) out.push({ k: "polyline", points: ring, closed: true, ...style });
      break;
    case "granular":
      out.push({ k: "segments", segs: hatchLines(outer, holes, 90 + angle, s, [s * 1.6, s * 1.0]), ...style });
      break;
    case "masonry":
    case "brick": {
      out.push({ k: "segments", segs: hatchLines(outer, holes, angle, s), ...style });
      // Vertical joints, staggered course by course.
      const b = polygonBounds(outer);
      const joint = material === "brick" ? s * 2 : s * 3;
      const segs: number[] = [];
      let row = 0;
      for (let y = b.minY; y < b.maxY; y += s, row++) {
        const shift = row % 2 === 0 ? 0 : joint / 2;
        for (let x = b.minX + shift; x < b.maxX; x += joint) {
          const mid = { x, y: y + s / 2 };
          if (pointInRegion(mid, outer, holes)) segs.push(x, y, x, Math.min(y + s, b.maxY));
        }
        if (segs.length > MAX_PATTERN_ITEMS * 4) break;
      }
      out.push({ k: "segments", segs, ...style });
      break;
    }
  }
  return out;
}
