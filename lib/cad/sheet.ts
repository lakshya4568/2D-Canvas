/**
 * Sheets — paper space.
 *
 * A GAD is issued as a sheet, not as model space: a border, a title block in
 * the bottom-right corner, notes on the right, and one or more viewports that
 * show the model at a DECLARED, standard scale (IRCM Table 4.03 (A) items 1–7:
 * standard paper size, BIS SP-46 borders, title block with name of work,
 * drawing number, scale, signatures and alteration box).
 *
 * Paper coordinates are millimetres from the sheet's top-left corner, Y down,
 * the same orientation as the canvas, so model primitives map onto paper with
 * one scale and one translation per viewport. Composition produces the same
 * primitive vocabulary as the canvas, so the PDF and SVG writers are simple
 * translators.
 */

import type { Point } from "@/lib/geometry/types";
import type { DrawPrim } from "./drawList";
import { primsBounds, textWidth } from "./drawList";

export type PaperSize = "A0" | "A1" | "A2" | "A3";

/** Landscape, mm (ISO 216). */
export const PAPER_SIZES: Record<PaperSize, { width: number; height: number }> = {
  A0: { width: 1189, height: 841 },
  A1: { width: 841, height: 594 },
  A2: { width: 594, height: 420 },
  A3: { width: 420, height: 297 },
};

/** BIS SP-46: wider binding margin on the left. */
const MARGIN = { left: 20, other: 10 };

/** Scales an engineer expects to see on a drawing (denominators). */
export const STANDARD_SCALES = [5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 5000];

export interface SheetViewport {
  id: string;
  title: string;
  /** Model window, canvas mm. */
  window: { x: number; y: number; width: number; height: number };
  /** 1:scale. */
  scale: number;
  /** Top-left of the viewport on paper, mm. */
  paperX: number;
  paperY: number;
  locked: boolean;
}

export interface Sheet {
  id: string;
  name: string;
  size: PaperSize;
  viewports: SheetViewport[];
  /** Sheet-specific notes, appended after the project notes. */
  notes: string[];
}

export interface TitleBlockData {
  railway: string;
  division: string;
  projectName: string;
  drawingTitle: string;
  drawingNumber: string;
  revision: string;
  bridgeNumber: string;
  chainage: string;
  scaleText: string;
  date: string;
  status: string;
  approvals: { role: string; name: string; signed: boolean }[];
  sanctionReference: string;
  /** Codes and manuals the drawing is prepared to. */
  references: string[];
  /** Alteration box rows. */
  revisions: { rev: string; description: string; date: string }[];
}

export interface SheetLayout {
  border: { x: number; y: number; width: number; height: number };
  titleBlock: { x: number; y: number; width: number; height: number };
  notes: { x: number; y: number; width: number; height: number };
  /** Paper area available to viewports. */
  drawArea: { x: number; y: number; width: number; height: number };
}

export function sheetLayout(size: PaperSize): SheetLayout {
  const p = PAPER_SIZES[size];
  const border = { x: MARGIN.left, y: MARGIN.other, width: p.width - MARGIN.left - MARGIN.other, height: p.height - 2 * MARGIN.other };
  const tbW = Math.min(185, border.width * 0.3);
  const tbH = Math.min(120, border.height * 0.36);
  const titleBlock = { x: border.x + border.width - tbW, y: border.y + border.height - tbH, width: tbW, height: tbH };
  const notes = { x: titleBlock.x, y: border.y, width: tbW, height: border.height - tbH };
  const drawArea = { x: border.x + 5, y: border.y + 5, width: border.width - tbW - 10, height: border.height - 10 };
  return { border, titleBlock, notes, drawArea };
}

/** The largest standard scale (smallest denominator) at which `w × h` model mm fits `pw × ph` paper mm. */
/** Scales an annotation can be sized for, from full size up. */
export const ANNOTATION_SCALES = [1, 2, ...STANDARD_SCALES];

/** Text on a drawing this wide reads comfortably when it is about 1/50 of it. */
export const READABLE_TEXT_FRACTION = 1 / 50;
/** Below 1/150 of the drawing, text cannot be read when the drawing is seen whole. */
export const ILLEGIBLE_TEXT_FRACTION = 1 / 150;

/**
 * The standard annotation scale at which text of `textHeight` paper mm reads
 * well against a drawing of this size — the scale nearest (on a log scale) to
 * the one that makes text 1/50 of the drawing's larger side. A 400 mm plate
 * gets 1:5 (12.5 mm text), a 26 m bridge section 1:200.
 */
export function readableAnnotationScale(width: number, height: number, textHeight: number): number {
  const extent = Math.max(width, height, 1);
  const ideal = (extent * READABLE_TEXT_FRACTION) / Math.max(textHeight, 0.1);
  return ANNOTATION_SCALES.reduce((best, s) => (Math.abs(Math.log(s / ideal)) < Math.abs(Math.log(best / ideal)) ? s : best), ANNOTATION_SCALES[0]);
}

export function fitScale(w: number, h: number, pw: number, ph: number): number {
  const need = Math.max(w / Math.max(pw, 1), h / Math.max(ph, 1));
  return STANDARD_SCALES.find((s) => s >= need) ?? Math.ceil(need / 1000) * 1000;
}

/**
 * One viewport showing everything, at the largest standard scale that fits
 * the drawing area. The window is centred on the model.
 */
export function autoSheet(id: string, name: string, size: PaperSize, modelPrims: DrawPrim[], preferredScale?: number): Sheet {
  const layout = sheetLayout(size);
  const b = primsBounds(modelPrims) ?? { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  const title = 16;
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const fit = fitScale(w * 1.04, h * 1.04, layout.drawArea.width, layout.drawArea.height - title);
  // Text and arrows are sized for the annotation scale: plot at it whenever the drawing fits,
  // or a 2.5 mm note comes out larger (or smaller) than 2.5 mm on paper.
  const scale = preferredScale && preferredScale >= fit ? preferredScale : fit;
  const winW = layout.drawArea.width * scale;
  const winH = (layout.drawArea.height - title) * scale;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return {
    id,
    name,
    size,
    notes: [],
    viewports: [
      {
        id: `${id}-vp1`,
        title: "",
        window: { x: cx - winW / 2, y: cy - winH / 2, width: winW, height: winH },
        scale,
        paperX: layout.drawArea.x,
        paperY: layout.drawArea.y,
        locked: true,
      },
    ],
  };
}

const TITLE_LAYER = "BRG-TITLE";
const TEXT_LAYER = "BRG-TEXT";

function rectPrim(x: number, y: number, w: number, h: number, weight = 0.35): DrawPrim {
  return {
    k: "polyline",
    points: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    closed: true,
    layerId: TITLE_LAYER,
    weight,
  };
}

function text(x: number, y: number, s: string, height: number, opts: Partial<Extract<DrawPrim, { k: "text" }>> = {}): DrawPrim {
  return { k: "text", x, y, text: s, height, rotation: 0, align: "left", baseline: "middle", layerId: TEXT_LAYER, ...opts };
}

/** Clips a segment to a rectangle (Liang–Barsky). */
function clipSeg(a: Point, b: Point, r: { x: number; y: number; width: number; height: number }): [Point, Point] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const checks: [number, number][] = [
    [-dx, a.x - r.x],
    [dx, r.x + r.width - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.height - a.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return [
    { x: a.x + t0 * dx, y: a.y + t0 * dy },
    { x: a.x + t1 * dx, y: a.y + t1 * dy },
  ];
}

function inside(p: Point, r: { x: number; y: number; width: number; height: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/**
 * Model primitives → paper primitives for one viewport: scaled, translated and
 * clipped to the window. Lineweights stay in plotted mm (they are already
 * paper quantities).
 */
export function viewportPrims(vp: SheetViewport, model: DrawPrim[]): DrawPrim[] {
  const k = 1 / vp.scale;
  const W = vp.window;
  const T = (p: Point): Point => ({ x: vp.paperX + (p.x - W.x) * k, y: vp.paperY + (p.y - W.y) * k });
  const out: DrawPrim[] = [];
  for (const p of model) {
    switch (p.k) {
      case "line": {
        const c = clipSeg({ x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }, W);
        if (!c) break;
        const a = T(c[0]);
        const b = T(c[1]);
        out.push({ ...p, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        break;
      }
      case "polyline": {
        const n = p.closed ? p.points.length : p.points.length - 1;
        if (p.points.every((q) => inside(q, W))) {
          out.push({ ...p, points: p.points.map(T) });
          break;
        }
        for (let i = 0; i < n; i++) {
          const c = clipSeg(p.points[i], p.points[(i + 1) % p.points.length], W);
          if (!c) continue;
          const a = T(c[0]);
          const b = T(c[1]);
          out.push({ k: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y, layerId: p.layerId, color: p.color, weight: p.weight, dash: p.dash, sourceId: p.sourceId });
        }
        break;
      }
      case "circle":
      case "arc":
        if (inside({ x: p.cx, y: p.cy }, W)) {
          const c = T({ x: p.cx, y: p.cy });
          out.push({ ...p, cx: c.x, cy: c.y, r: p.r * k });
        }
        break;
      case "text":
        if (inside({ x: p.x, y: p.y }, W)) {
          const c = T({ x: p.x, y: p.y });
          out.push({ ...p, x: c.x, y: c.y, height: p.height * k });
        }
        break;
      case "fill":
        if (p.points.every((q) => inside(q, W))) out.push({ ...p, points: p.points.map(T), holes: p.holes?.map((h) => h.map(T)) });
        break;
      case "dots": {
        const pts = p.points.filter((q) => inside(q, W)).map(T);
        if (pts.length) out.push({ ...p, points: pts, r: p.r * k });
        break;
      }
      case "segments": {
        const segs: number[] = [];
        for (let i = 0; i + 3 < p.segs.length; i += 4) {
          const c = clipSeg({ x: p.segs[i], y: p.segs[i + 1] }, { x: p.segs[i + 2], y: p.segs[i + 3] }, W);
          if (!c) continue;
          const a = T(c[0]);
          const b = T(c[1]);
          segs.push(a.x, a.y, b.x, b.y);
        }
        if (segs.length) out.push({ ...p, segs });
        break;
      }
    }
  }
  if (vp.title) {
    const tw = textWidth(vp.title, 4);
    const x = vp.paperX + (W.width * k) / 2;
    const y = vp.paperY + W.height * k + 6;
    out.push(text(x, y, vp.title, 4, { align: "center", bold: true }));
    out.push({ k: "line", x1: x - tw / 2, y1: y + 3, x2: x + tw / 2, y2: y + 3, layerId: TITLE_LAYER, weight: 0.35 });
    out.push(text(x, y + 7, `SCALE 1:${vp.scale}`, 2.5, { align: "center" }));
  }
  return out;
}

/** Wraps a note to a paper width. */
function wrap(s: string, width: number, h: number): string[] {
  const max = Math.max(8, Math.floor(width / (h * 0.6)));
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Border, title block, notes and status banner. Everything outside the viewports. */
export function sheetFramePrims(sheet: Sheet, data: TitleBlockData, notes: string[]): DrawPrim[] {
  const L = sheetLayout(sheet.size);
  const p = PAPER_SIZES[sheet.size];
  const out: DrawPrim[] = [];
  // Trim line and border.
  out.push({ ...rectPrim(0, 0, p.width, p.height, 0.13), dash: "continuous" });
  out.push(rectPrim(L.border.x, L.border.y, L.border.width, L.border.height, 0.7));

  // Title block: rows from the bottom up.
  const tb = L.titleBlock;
  out.push(rectPrim(tb.x, tb.y, tb.width, tb.height, 0.5));
  const rows: { label: string; value: string; h: number; big?: boolean }[] = [
    { label: "RAILWAY / DIVISION", value: [data.railway, data.division].filter(Boolean).join(" / ") || "—", h: 8 },
    { label: "NAME OF WORK", value: data.projectName || "—", h: 14 },
    { label: "DRAWING", value: data.drawingTitle || "—", h: 14, big: true },
    { label: "BRIDGE No. / CHAINAGE", value: [data.bridgeNumber, data.chainage].filter(Boolean).join("  ·  ") || "—", h: 8 },
    { label: "SANCTION (PINK BOOK)", value: data.sanctionReference || "—", h: 8 },
  ];
  let y = tb.y;
  for (const r of rows) {
    out.push({ k: "line", x1: tb.x, y1: y + r.h, x2: tb.x + tb.width, y2: y + r.h, layerId: TITLE_LAYER, weight: 0.25 });
    out.push(text(tb.x + 2, y + 1.4, r.label, 1.8, { baseline: "top" }));
    // A short row holds one line of value under its label; a tall row two.
    const vh = r.big ? 3.5 : r.h > 10 ? 2.8 : 2.6;
    const lines = wrap(r.value, tb.width - 4, vh).slice(0, r.h > 10 ? 2 : 1);
    lines.forEach((l, i) => out.push(text(tb.x + 2, y + (r.h > 10 ? 5.2 : 4.1) + i * (vh * 1.3), l, vh, { baseline: "top", bold: r.big })));
    y += r.h;
  }
  // Drawing number / scale / revision / date strip.
  const strip = [
    { label: "DRAWING No.", value: data.drawingNumber || "—", w: 0.4 },
    { label: "SCALE", value: data.scaleText, w: 0.2 },
    { label: "REV", value: data.revision || "0", w: 0.12 },
    { label: "DATE", value: data.date, w: 0.28 },
  ];
  let x = tb.x;
  for (const s of strip) {
    const w = tb.width * s.w;
    out.push({ k: "line", x1: x, y1: y, x2: x, y2: y + 11, layerId: TITLE_LAYER, weight: 0.25 });
    out.push(text(x + 1.5, y + 2, s.label, 1.8, { baseline: "top" }));
    out.push(text(x + 1.5, y + 6, s.value, 2.8, { baseline: "top", bold: true }));
    x += w;
  }
  y += 11;
  out.push({ k: "line", x1: tb.x, y1: y, x2: tb.x + tb.width, y2: y, layerId: TITLE_LAYER, weight: 0.25 });
  // Signatures.
  const sigH = Math.max(12, tb.y + tb.height - y - 10);
  const n = Math.max(1, data.approvals.length);
  data.approvals.forEach((a, i) => {
    const sx = tb.x + (tb.width / n) * i;
    if (i > 0) out.push({ k: "line", x1: sx, y1: y, x2: sx, y2: y + sigH, layerId: TITLE_LAYER, weight: 0.25 });
    out.push(text(sx + 1.5, y + 2, a.role.toUpperCase(), 1.8, { baseline: "top" }));
    out.push(text(sx + 1.5, y + sigH - 3, a.name || "", 2.2, { baseline: "bottom" }));
    if (!a.signed) out.push(text(sx + 1.5, y + sigH / 2 + 1, "(unsigned)", 1.8, { baseline: "middle", color: "#9ca3af" }));
  });
  y += sigH;
  out.push({ k: "line", x1: tb.x, y1: y, x2: tb.x + tb.width, y2: y, layerId: TITLE_LAYER, weight: 0.25 });
  // Status banner — the drawing says what it is not.
  const statusColor = data.status === "APPROVED" ? "#15803d" : "#b91c1c";
  out.push(text(tb.x + tb.width / 2, (y + tb.y + tb.height) / 2, data.status, 3.5, { align: "center", bold: true, color: statusColor }));

  // Notes column, above the title block: notes, references, alteration box.
  const nb = L.notes;
  out.push(rectPrim(nb.x, nb.y, nb.width, nb.height, 0.35));
  let ny = nb.y + 4;
  out.push(text(nb.x + 3, ny, "NOTES", 3, { baseline: "top", bold: true }));
  ny += 6;
  const h = 2.4;
  const altH = 8 + Math.max(2, data.revisions.length) * 5;
  const refH = data.references.length ? 10 + data.references.length * 3.8 : 0;
  const limit = nb.y + nb.height - altH - refH - 4;
  notes.forEach((note, i) => {
    const lines = wrap(`${i + 1}. ${note}`, nb.width - 8, h);
    for (const l of lines) {
      if (ny + h > limit) return;
      out.push(text(nb.x + 3, ny, l, h, { baseline: "top" }));
      ny += h * 1.45;
    }
    ny += h * 0.5;
  });
  let ry = nb.y + nb.height - altH - refH;
  if (data.references.length) {
    out.push({ k: "line", x1: nb.x, y1: ry, x2: nb.x + nb.width, y2: ry, layerId: TITLE_LAYER, weight: 0.25 });
    out.push(text(nb.x + 3, ry + 2.5, "CODES AND MANUALS REFERRED", 2.2, { baseline: "top", bold: true }));
    ry += 7;
    for (const r of data.references) {
      out.push(text(nb.x + 3, ry, `• ${r}`.slice(0, Math.floor((nb.width - 6) / (2.2 * 0.6))), 2.2, { baseline: "top" }));
      ry += 3.8;
    }
    ry = nb.y + nb.height - altH;
  }
  out.push({ k: "line", x1: nb.x, y1: ry, x2: nb.x + nb.width, y2: ry, layerId: TITLE_LAYER, weight: 0.35 });
  out.push(text(nb.x + 3, ry + 2.5, "ALTERATIONS", 2.2, { baseline: "top", bold: true }));
  ry += 7;
  for (const r of data.revisions.slice(-6)) {
    out.push(text(nb.x + 3, ry, `${r.rev}`, 2.2, { baseline: "top" }));
    out.push(text(nb.x + 12, ry, r.description.slice(0, 48), 2.2, { baseline: "top" }));
    out.push(text(nb.x + nb.width - 3, ry, r.date, 2.2, { baseline: "top", align: "right" }));
    ry += 5;
  }
  return out;
}

/** Every primitive of a sheet, in paper mm. */
export function composeSheet(sheet: Sheet, model: DrawPrim[], data: TitleBlockData, notes: string[]): DrawPrim[] {
  return [...sheet.viewports.flatMap((vp) => viewportPrims(vp, model)), ...sheetFramePrims(sheet, data, notes)];
}

export function sheetScaleText(sheet: Sheet): string {
  const scales = [...new Set(sheet.viewports.map((v) => v.scale))];
  if (scales.length === 0) return "—";
  if (scales.length === 1) return `1:${scales[0]}`;
  return "AS SHOWN";
}
