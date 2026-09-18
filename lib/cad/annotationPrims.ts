/**
 * Annotations and shapes → draw primitives.
 *
 * Dimension VALUES are always measured from the resolved anchor points, never
 * stored, so a dimension cannot show a number the geometry does not have
 * (blueprint §9). An override is allowed but is drawn with a trailing asterisk
 * and reported by the audit, the way a hand-edited dimension is flagged on a
 * checked drawing.
 */

import type { Point, Shape } from "@/lib/geometry/types";
import { getShapeSegments } from "@/lib/geometry/snapping";
import type { DrawPrim, PrimStyle } from "./drawList";
import { textWidth } from "./drawList";
import {
  circlePoints,
  resolveAnchor,
  shapeVertices,
  traceRing,
  type ShapeIndex,
} from "./geometry";
import { hatchPrims } from "./hatch";
import type {
  Annotation,
  DimensionAnnotation,
  DrawingSettings,
  HatchAnnotation,
  LeaderAnnotation,
  LevelAnnotation,
  MarkerAnnotation,
  TableAnnotation,
  TextAnnotation,
} from "./types";
import { levelAt } from "./types";

export interface PrimContext {
  shapes: ShapeIndex;
  settings: DrawingSettings;
}

const ARROW_PAPER_MM = 2.5;
const EXT_GAP_PAPER_MM = 0.8;
const EXT_OVERSHOOT_PAPER_MM = 1.5;

function style(a: Annotation, fallbackLayer: string): PrimStyle {
  return { layerId: a.layerId ?? fallbackLayer, sourceId: a.id };
}

function arrowHead(tip: Point, from: Point, size: number, st: PrimStyle): DrawPrim {
  const dx = from.x - tip.x;
  const dy = from.y - tip.y;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const w = size * 0.18;
  const back = { x: tip.x + ux * size, y: tip.y + uy * size };
  return {
    k: "fill",
    points: [tip, { x: back.x - uy * w, y: back.y + ux * w }, { x: back.x + uy * w, y: back.y - ux * w }],
    ...st,
  };
}

/** Reading angle for text along a direction: never upside down. */
function readingAngle(dx: number, dy: number): number {
  // Canvas y is down, so the paper angle is -atan2(dy, dx).
  let deg = (-Math.atan2(dy, dx) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg <= -90) deg += 180;
  return deg;
}

export function formatLength(value: number, precision: number): string {
  const v = Number(value.toFixed(precision));
  return precision > 0 ? v.toFixed(precision) : String(Math.round(v));
}

export interface DimensionMeasure {
  value: number;
  text: string;
  /** The override disagrees with what the geometry measures. */
  overridden: boolean;
}

/** What a dimension measures right now. `null` when an anchor has gone. */
export function measureDimension(d: DimensionAnnotation, ctx: PrimContext): DimensionMeasure | null {
  const p1 = resolveAnchor(d.p1, ctx.shapes);
  const p2 = resolveAnchor(d.p2, ctx.shapes);
  if (!p1 || !p2) return null;
  const precision = d.precision ?? ctx.settings.dimensionPrecision;
  let value: number;
  let prefix = d.prefix ?? "";
  switch (d.kind) {
    case "linear": {
      const axis = d.axis ?? (Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y) ? "x" : "y");
      value = axis === "x" ? Math.abs(p2.x - p1.x) : Math.abs(p2.y - p1.y);
      break;
    }
    case "aligned":
      value = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      break;
    case "radius":
      value = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      prefix = prefix || "R";
      break;
    case "diameter":
      value = 2 * Math.hypot(p2.x - p1.x, p2.y - p1.y);
      prefix = prefix || "Ø";
      break;
    case "angular": {
      const v = d.p3 ? resolveAnchor(d.p3, ctx.shapes) : null;
      if (!v) return null;
      const a1 = Math.atan2(p1.y - v.y, p1.x - v.x);
      const a2 = Math.atan2(p2.y - v.y, p2.x - v.x);
      let da = Math.abs(a2 - a1);
      if (da > Math.PI) da = 2 * Math.PI - da;
      value = (da * 180) / Math.PI;
      break;
    }
    case "ordinate":
      value = d.axis === "y" ? levelAt(p1.y, ctx.settings) : p1.x - p2.x;
      break;
  }
  const measured = `${prefix}${
    d.kind === "angular" ? `${value.toFixed(Math.max(precision, 1))}°` : formatLength(value, precision)
  }${d.suffix ?? ""}`;
  if (d.textOverride && d.textOverride.trim() && d.textOverride.trim() !== measured) {
    return { value, text: `${d.textOverride.trim()}*`, overridden: true };
  }
  return { value, text: measured, overridden: false };
}

function dimensionPrims(d: DimensionAnnotation, ctx: PrimContext): DrawPrim[] {
  const st = style(d, "BRG-DIM");
  const unit = ctx.settings.annotationScale;
  const h = (d.height ?? ctx.settings.textHeight) * unit;
  const arrow = ARROW_PAPER_MM * unit;
  const gap = EXT_GAP_PAPER_MM * unit;
  const over = EXT_OVERSHOOT_PAPER_MM * unit;
  const p1 = resolveAnchor(d.p1, ctx.shapes);
  const p2 = resolveAnchor(d.p2, ctx.shapes);
  const m = measureDimension(d, ctx);
  if (!p1 || !p2 || !m) return [];
  const out: DrawPrim[] = [];

  if (d.kind === "radius" || d.kind === "diameter") {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const start = d.kind === "diameter" ? { x: p1.x - dx, y: p1.y - dy } : p1;
    out.push({ k: "line", x1: start.x, y1: start.y, x2: p2.x, y2: p2.y, ...st });
    out.push(arrowHead(p2, start, arrow, st));
    if (d.kind === "diameter") out.push(arrowHead(start, p2, arrow, st));
    const mid = { x: (start.x + p2.x) / 2, y: (start.y + p2.y) / 2 };
    out.push({ k: "text", x: mid.x, y: mid.y - h * 0.4, text: m.text, height: h, rotation: readingAngle(dx, dy), align: "center", baseline: "bottom", ...st });
    return out;
  }

  if (d.kind === "angular") {
    const v = d.p3 ? resolveAnchor(d.p3, ctx.shapes) : null;
    if (!v) return [];
    const r = Math.abs(d.offset) || Math.min(Math.hypot(p1.x - v.x, p1.y - v.y), Math.hypot(p2.x - v.x, p2.y - v.y)) * 0.6;
    let a1 = Math.atan2(p1.y - v.y, p1.x - v.x);
    let a2 = Math.atan2(p2.y - v.y, p2.x - v.x);
    let span = a2 - a1;
    while (span > Math.PI) span -= 2 * Math.PI;
    while (span < -Math.PI) span += 2 * Math.PI;
    if (span < 0) {
      [a1, a2] = [a2, a1];
      span = -span;
    }
    const pts: Point[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = a1 + (span * i) / 24;
      pts.push({ x: v.x + r * Math.cos(a), y: v.y + r * Math.sin(a) });
    }
    out.push({ k: "polyline", points: pts, closed: false, ...st });
    out.push(arrowHead(pts[0], pts[1], arrow, st));
    out.push(arrowHead(pts[pts.length - 1], pts[pts.length - 2], arrow, st));
    const am = a1 + span / 2;
    const tp = { x: v.x + (r + h) * Math.cos(am), y: v.y + (r + h) * Math.sin(am) };
    out.push({ k: "text", x: tp.x, y: tp.y, text: m.text, height: h, rotation: 0, align: "center", baseline: "middle", ...st });
    return out;
  }

  if (d.kind === "ordinate") {
    const tip = { x: p1.x + d.offset, y: p1.y };
    out.push({ k: "line", x1: p1.x + Math.sign(d.offset || 1) * gap, y1: p1.y, x2: tip.x, y2: tip.y, ...st });
    out.push({ k: "text", x: tip.x + Math.sign(d.offset || 1) * h * 0.4, y: tip.y, text: m.text, height: h, rotation: 0, align: d.offset < 0 ? "right" : "left", baseline: "middle", ...st });
    return out;
  }

  // Linear and aligned: dimension line parallel to the measured direction.
  let dir: Point;
  let a: Point;
  let b: Point;
  if (d.kind === "linear") {
    const axis = d.axis ?? (Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y) ? "x" : "y");
    if (axis === "x") {
      const base = d.offset < 0 ? Math.min(p1.y, p2.y) : Math.max(p1.y, p2.y);
      const y = base + d.offset;
      a = { x: p1.x, y };
      b = { x: p2.x, y };
      dir = { x: 1, y: 0 };
    } else {
      const base = d.offset < 0 ? Math.min(p1.x, p2.x) : Math.max(p1.x, p2.x);
      const x = base + d.offset;
      a = { x, y: p1.y };
      b = { x, y: p2.y };
      dir = { x: 0, y: 1 };
    }
  } else {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const l = Math.hypot(dx, dy) || 1;
    const n = { x: -dy / l, y: dx / l };
    a = { x: p1.x + n.x * d.offset, y: p1.y + n.y * d.offset };
    b = { x: p2.x + n.x * d.offset, y: p2.y + n.y * d.offset };
    dir = { x: dx / l, y: dy / l };
  }

  // Extension lines: a small gap off the object, a small overshoot past the dimension line.
  for (const [p, q] of [
    [p1, a],
    [p2, b],
  ] as [Point, Point][]) {
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const el = Math.hypot(ex, ey);
    if (el < 1e-9) continue;
    const ux = ex / el;
    const uy = ey / el;
    out.push({ k: "line", x1: p.x + ux * Math.min(gap, el), y1: p.y + uy * Math.min(gap, el), x2: q.x + ux * over, y2: q.y + uy * over, ...st });
  }

  const len = Math.hypot(b.x - a.x, b.y - a.y);
  out.push({ k: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...st });
  if (len > arrow * 2.2) {
    out.push(arrowHead(a, b, arrow, st), arrowHead(b, a, arrow, st));
  } else {
    // Too tight for arrows inside: architectural ticks read better than colliding heads.
    for (const p of [a, b]) {
      const t = arrow * 0.5;
      out.push({ k: "line", x1: p.x - (dir.x + dir.y) * t, y1: p.y - (dir.y - dir.x) * t, x2: p.x + (dir.x + dir.y) * t, y2: p.y + (dir.y - dir.x) * t, ...st });
    }
  }

  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const rot = readingAngle(b.x - a.x, b.y - a.y);
  // Text sits on the side of the line facing up on the page.
  const tw = textWidth(m.text, h);
  const lift = h * 0.35;
  const rad = (-rot * Math.PI) / 180;
  const up = { x: Math.sin(rad), y: -Math.cos(rad) };
  const tp = len < tw + arrow * 2 ? { x: b.x + dir.x * (tw / 2 + arrow), y: b.y + dir.y * (tw / 2 + arrow) } : mid;
  out.push({
    k: "text",
    x: tp.x + up.x * lift,
    y: tp.y + up.y * lift,
    text: m.text,
    height: h,
    rotation: rot,
    align: "center",
    baseline: "bottom",
    ...st,
    color: m.overridden ? "#f59e0b" : undefined,
  });
  return out;
}

function textPrims(t: TextAnnotation, ctx: PrimContext): DrawPrim[] {
  const at = resolveAnchor(t.at, ctx.shapes);
  if (!at) return [];
  const unit = ctx.settings.annotationScale;
  const h = (t.height || ctx.settings.textHeight) * unit;
  let text = t.text;
  if (t.wrapWidth && t.wrapWidth > 0) {
    const maxChars = Math.max(4, Math.floor((t.wrapWidth * unit) / (h * 0.6)));
    text = t.text
      .split("\n")
      .map((para) => {
        const words = para.split(/\s+/);
        const lines: string[] = [];
        let cur = "";
        for (const w of words) {
          if ((cur + " " + w).trim().length > maxChars && cur) {
            lines.push(cur);
            cur = w;
          } else cur = (cur + " " + w).trim();
        }
        if (cur) lines.push(cur);
        return lines.join("\n");
      })
      .join("\n");
  }
  return [
    {
      k: "text",
      x: at.x,
      y: at.y,
      text,
      height: h,
      rotation: t.rotation ?? 0,
      align: t.align ?? "left",
      baseline: "top",
      bold: t.bold,
      ...style(t, "BRG-TEXT"),
    },
  ];
}

function leaderPrims(l: LeaderAnnotation, ctx: PrimContext): DrawPrim[] {
  const pts = l.points.map((p) => resolveAnchor(p, ctx.shapes)).filter((p): p is Point => p !== null);
  if (pts.length < 2) return [];
  const st = style(l, "BRG-LEADER");
  const unit = ctx.settings.annotationScale;
  const h = (l.height || ctx.settings.textHeight) * unit;
  const out: DrawPrim[] = [];
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const toRight = last.x >= prev.x;
  const landing = { x: last.x + (toRight ? 1 : -1) * h * 1.2, y: last.y };
  out.push({ k: "polyline", points: [...pts, landing], closed: false, ...st });
  out.push(arrowHead(pts[0], pts[1], ARROW_PAPER_MM * unit, st));
  out.push({
    k: "text",
    x: landing.x + (toRight ? 1 : -1) * h * 0.4,
    y: landing.y,
    text: l.text,
    height: h,
    rotation: 0,
    align: toRight ? "left" : "right",
    baseline: "middle",
    ...st,
  });
  return out;
}

export function formatLevel(rl: number): string {
  const s = rl.toFixed(3);
  return rl >= 0 ? `+${s}` : s;
}

function levelPrims(l: LevelAnnotation, ctx: PrimContext): DrawPrim[] {
  const at = resolveAnchor(l.at, ctx.shapes);
  if (!at) return [];
  const st = style(l, "BRG-LEVEL");
  const unit = ctx.settings.annotationScale;
  const h = (l.height ?? ctx.settings.textHeight) * unit;
  const s = h * 1.1;
  const rl = levelAt(at.y, ctx.settings);
  const dir = l.side === "left" ? -1 : 1;
  const label = `${l.label ? l.label + " " : ""}${formatLevel(rl)}`;
  const w = textWidth(label, h) + h;
  const out: DrawPrim[] = [];
  // Triangle standing on the level, tip down.
  out.push({ k: "fill", points: [at, { x: at.x - s * 0.6, y: at.y - s }, { x: at.x + s * 0.6, y: at.y - s }], ...st });
  out.push({ k: "line", x1: at.x, y1: at.y - s, x2: at.x + dir * w, y2: at.y - s, ...st });
  out.push({
    k: "text",
    x: at.x + dir * h * 0.5,
    y: at.y - s - h * 0.3,
    text: label,
    height: h,
    rotation: 0,
    align: dir > 0 ? "left" : "right",
    baseline: "bottom",
    ...st,
    color: l.declaredValue !== undefined && Math.abs(l.declaredValue - rl) > 0.0005 ? "#f59e0b" : undefined,
  });
  return out;
}

/** The rings a hatch fills, or null if its boundary no longer closes. */
export function hatchRegion(hh: HatchAnnotation, ctx: PrimContext): { outer: Point[]; holes: Point[][] } | null {
  if (hh.boundary.kind === "polygon") {
    return { outer: hh.boundary.outer, holes: hh.boundary.holes ?? [] };
  }
  const shapes = hh.boundary.shapeIds.map((id) => ctx.shapes.get(id)).filter((s): s is Shape => !!s);
  if (shapes.length !== hh.boundary.shapeIds.length) return null;
  const outer = traceRing(shapes);
  if (!outer) return null;
  const holes: Point[][] = [];
  for (const id of hh.boundary.holeShapeIds ?? []) {
    const s = ctx.shapes.get(id);
    if (!s) continue;
    const ring = traceRing([s]);
    if (ring) holes.push(ring);
  }
  return { outer, holes };
}

function hatchAnnotationPrims(hh: HatchAnnotation, ctx: PrimContext): DrawPrim[] {
  const region = hatchRegion(hh, ctx);
  if (!region) return [];
  return hatchPrims(
    region.outer,
    region.holes,
    hh.material,
    ctx.settings.annotationScale * (hh.scale ?? 1),
    style(hh, "BRG-HATCH"),
    hh.id,
    hh.angle ?? 0
  );
}

function markerPrims(mk: MarkerAnnotation, ctx: PrimContext): DrawPrim[] {
  const at = resolveAnchor(mk.at, ctx.shapes);
  if (!at) return [];
  const to = mk.to ? resolveAnchor(mk.to, ctx.shapes) : null;
  const st = style(mk, "BRG-TEXT");
  const unit = ctx.settings.annotationScale;
  const h = (mk.height ?? ctx.settings.textHeight * 1.4) * unit;
  const out: DrawPrim[] = [];
  switch (mk.kind) {
    case "north": {
      const r = h * 2;
      out.push({ k: "circle", cx: at.x, cy: at.y, r, ...st });
      out.push({ k: "fill", points: [{ x: at.x, y: at.y - r }, { x: at.x - r * 0.4, y: at.y + r * 0.6 }, { x: at.x, y: at.y + r * 0.25 }], ...st });
      out.push({ k: "polyline", points: [{ x: at.x, y: at.y - r }, { x: at.x + r * 0.4, y: at.y + r * 0.6 }, { x: at.x, y: at.y + r * 0.25 }], closed: false, ...st });
      out.push({ k: "text", x: at.x, y: at.y - r - h * 0.4, text: "N", height: h, rotation: 0, align: "center", baseline: "bottom", bold: true, ...st });
      break;
    }
    case "flow":
    case "kilometrage": {
      const end = to ?? { x: at.x + h * 8, y: at.y };
      out.push({ k: "line", x1: at.x, y1: at.y, x2: end.x, y2: end.y, ...st });
      out.push(arrowHead(end, at, h * 1.2, st));
      const text = mk.label ?? (mk.kind === "flow" ? "FLOW" : "KM");
      out.push({ k: "text", x: (at.x + end.x) / 2, y: (at.y + end.y) / 2 - h * 0.4, text, height: h * 0.8, rotation: readingAngle(end.x - at.x, end.y - at.y), align: "center", baseline: "bottom", ...st });
      break;
    }
    case "section":
    case "detail": {
      const r = h * 1.1;
      const label = mk.label ?? "A";
      const pts = to ? [at, to] : [at];
      if (to) out.push({ k: "line", x1: at.x, y1: at.y, x2: to.x, y2: to.y, ...st, dash: "phantom" });
      for (const p of pts) {
        out.push({ k: "circle", cx: p.x, cy: p.y, r, ...st });
        out.push({ k: "text", x: p.x, y: p.y, text: label, height: h * 0.9, rotation: 0, align: "center", baseline: "middle", bold: true, ...st });
      }
      break;
    }
    case "centreline": {
      out.push({ k: "text", x: at.x, y: at.y, text: mk.label ? `℄ ${mk.label}` : "℄", height: h, rotation: 0, align: "center", baseline: "bottom", ...st });
      break;
    }
  }
  return out;
}

function tablePrims(t: TableAnnotation, ctx: PrimContext): DrawPrim[] {
  const at = resolveAnchor(t.at, ctx.shapes);
  if (!at || t.rows.length === 0) return [];
  const st = style(t, "BRG-TEXT");
  const unit = ctx.settings.annotationScale;
  const h = (t.height ?? ctx.settings.textHeight) * unit;
  const rowH = h * 2;
  const cols = Math.max(...t.rows.map((r) => r.length));
  const widths = Array.from({ length: cols }, (_, c) =>
    t.columnWidths?.[c] !== undefined
      ? t.columnWidths[c] * unit
      : Math.max(...t.rows.map((r) => textWidth(r[c] ?? "", h))) + h * 1.2
  );
  const total = widths.reduce((s, w) => s + w, 0);
  const out: DrawPrim[] = [];
  let y = at.y;
  if (t.title) {
    out.push({ k: "text", x: at.x + total / 2, y: y + rowH * 0.5, text: t.title, height: h * 1.1, rotation: 0, align: "center", baseline: "middle", bold: true, ...st });
    out.push({ k: "polyline", points: [{ x: at.x, y }, { x: at.x + total, y }, { x: at.x + total, y: y + rowH }, { x: at.x, y: y + rowH }], closed: true, ...st });
    y += rowH;
  }
  for (const row of t.rows) {
    let x = at.x;
    for (let c = 0; c < cols; c++) {
      out.push({ k: "polyline", points: [{ x, y }, { x: x + widths[c], y }, { x: x + widths[c], y: y + rowH }, { x, y: y + rowH }], closed: true, ...st });
      if (row[c]) out.push({ k: "text", x: x + h * 0.6, y: y + rowH / 2, text: row[c], height: h, rotation: 0, align: "left", baseline: "middle", ...st });
      x += widths[c];
    }
    y += rowH;
  }
  return out;
}

function revcloudPrims(rc: Annotation & { type: "revcloud" }, ctx: PrimContext): DrawPrim[] {
  const st = style(rc, "BRG-REVISION");
  const unit = ctx.settings.annotationScale;
  const arcLen = 6 * unit;
  const pts: Point[] = [];
  const n = rc.points.length;
  for (let i = 0; i < n; i++) {
    const a = rc.points[i];
    const b = rc.points[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const bumps = Math.max(1, Math.round(len / arcLen));
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    for (let k = 0; k < bumps; k++) {
      const s0 = (k / bumps) * len;
      const s1 = ((k + 1) / bumps) * len;
      const r = (s1 - s0) / 2;
      const c = { x: a.x + ux * (s0 + r), y: a.y + uy * (s0 + r) };
      const base = Math.atan2(uy, ux);
      for (let j = 0; j <= 8; j++) {
        const ang = base + Math.PI + (Math.PI * j) / 8;
        pts.push({ x: c.x + r * Math.cos(ang), y: c.y + r * Math.sin(ang) });
      }
    }
  }
  const out: DrawPrim[] = [{ k: "polyline", points: pts, closed: true, ...st }];
  if (rc.label && rc.points[0]) {
    const h = ctx.settings.textHeight * unit;
    out.push({ k: "text", x: rc.points[0].x, y: rc.points[0].y - h, text: rc.label, height: h, rotation: 0, align: "left", baseline: "bottom", ...st });
  }
  return out;
}

export function annotationPrims(a: Annotation, ctx: PrimContext): DrawPrim[] {
  if (a.isVisible === false) return [];
  switch (a.type) {
    case "text":
      return textPrims(a, ctx);
    case "leader":
      return leaderPrims(a, ctx);
    case "dimension":
      return dimensionPrims(a, ctx);
    case "level":
      return levelPrims(a, ctx);
    case "hatch":
      return hatchAnnotationPrims(a, ctx);
    case "marker":
      return markerPrims(a, ctx);
    case "table":
      return tablePrims(a, ctx);
    case "revcloud":
      return revcloudPrims(a, ctx);
  }
}

/** A shape as primitives, for exporters that do not draw shapes natively. */
export function shapePrims(s: Shape & { layerId?: string }, fallbackLayer = "0"): DrawPrim[] {
  if (s.isVisible === false) return [];
  const st: PrimStyle = {
    layerId: s.layerId ?? fallbackLayer,
    sourceId: s.id,
    color: s.strokeColor,
  };
  switch (s.type) {
    case "line":
    case "arrow":
      return [{ k: "line", x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, ...st }];
    case "circle":
      return [{ k: "circle", cx: s.cx, cy: s.cy, r: s.r, ...st }];
    case "ellipse":
      return [{ k: "polyline", points: shapeVertices(s), closed: true, ...st }];
    default: {
      const segs = getShapeSegments(s);
      if (segs.length === 0) return [];
      return [{ k: "polyline", points: segs.map((g) => g.p1), closed: true, ...st }];
    }
  }
}

export { circlePoints };
