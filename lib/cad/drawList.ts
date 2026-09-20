/**
 * The draw list — one geometric vocabulary every output shares.
 *
 * The canvas, the SVG export, the DXF export and the PDF sheet all need to show
 * the same dimension, the same hatch and the same level marker. Computing that
 * geometry four times is four chances for them to disagree, so annotations and
 * shapes are turned into these primitives ONCE (`annotationPrims`,
 * `shapePrims`) and every renderer only translates primitives into its own
 * syntax.
 *
 * All coordinates are canvas millimetres (Y down). Text height is model mm,
 * already multiplied by the annotation scale.
 */

import type { Point } from "@/lib/geometry/types";

export interface PrimStyle {
  layerId: string;
  /** Overrides the layer colour (entity colour "by object"). */
  color?: string;
  /** Overrides the layer lineweight, mm. */
  weight?: number;
  /** Overrides the layer line type. */
  dash?: "continuous" | "hidden" | "center" | "phantom" | "dashdot" | "dotted";
  /** The entity this primitive belongs to, for selection and highlighting. */
  sourceId?: string;
}

export type DrawPrim =
  | ({ k: "line"; x1: number; y1: number; x2: number; y2: number } & PrimStyle)
  | ({ k: "polyline"; points: Point[]; closed: boolean } & PrimStyle)
  | ({ k: "circle"; cx: number; cy: number; r: number } & PrimStyle)
  | ({ k: "arc"; cx: number; cy: number; r: number; start: number; end: number } & PrimStyle)
  | ({
      k: "text";
      x: number;
      y: number;
      text: string;
      /** Model mm. */
      height: number;
      /** Degrees, counter-clockwise on paper (canvas: negative is up-reading). */
      rotation: number;
      align: "left" | "center" | "right";
      baseline: "bottom" | "middle" | "top";
      bold?: boolean;
    } & PrimStyle)
  /** Filled polygon: arrowheads, level triangles, solid hatch. */
  | ({ k: "fill"; points: Point[]; holes?: Point[][] } & PrimStyle)
  /** Many dots at once (stipple hatches). Radius in model mm. */
  | ({ k: "dots"; points: Point[]; r: number } & PrimStyle)
  /** Many unconnected segments at once (pattern hatches). */
  | ({ k: "segments"; segs: number[] } & PrimStyle);

/** Approximate advance width of a character for the sans-serif drafting font. */
export const CHAR_WIDTH_RATIO = 0.6;

export function textWidth(text: string, height: number): number {
  const longest = text.split("\n").reduce((m, l) => Math.max(m, l.length), 0);
  return longest * height * CHAR_WIDTH_RATIO;
}

/** A rectangle in draw-list coordinates. */
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const EMPTY: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

export const boxOf = (points: Point[]): Box =>
  points.reduce(
    (b, p) => ({ minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y), maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y) }),
    EMPTY
  );

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


/** Bounds of a primitive list, for fitting a viewport or a sheet. */
export function primsBounds(prims: DrawPrim[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const p of prims) {
    switch (p.k) {
      case "line":
        add(p.x1, p.y1);
        add(p.x2, p.y2);
        break;
      case "polyline":
      case "fill":
        for (const q of p.points) add(q.x, q.y);
        break;
      case "circle":
      case "arc":
        add(p.cx - p.r, p.cy - p.r);
        add(p.cx + p.r, p.cy + p.r);
        break;
      case "text": {
        // The real box the letters occupy — the same one the annotation layout
        // pass judges the sheet with, so a title is never cut off by a bound
        // that guessed its size a second way.
        const b = textBox(p);
        add(b.minX, b.minY);
        add(b.maxX, b.maxY);
        break;
      }
      case "dots":
        for (const q of p.points) add(q.x, q.y);
        break;
      case "segments":
        for (let i = 0; i + 1 < p.segs.length; i += 2) add(p.segs[i], p.segs[i + 1]);
        break;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}
