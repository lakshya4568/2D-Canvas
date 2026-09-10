/**
 * PDF drawing-sheet export, read directly from the canonical model.
 * UPCE-MASTER-1.0 §69.
 *
 * "A dedicated drawing-sheet pipeline: geometry + dimensions + text + title block
 *  + scale + layers -> PDF, at A1/A2/A3 with formal borders, scale bars, and a
 *  project metadata table."
 *
 * A minimal, dependency-free PDF 1.4 writer emitting vector paths — never a
 * raster, and never chained through SVG (§69 rule). ReportLab / matplotlib is
 * the optional server-side path; PyMuPDF is deliberately NOT used (AGPL-3.0,
 * §73/§84).
 */

import { ParametricSketch } from "../parametric/schemaTypes";

export type SheetSize = "A1" | "A2" | "A3" | "A4";

/** Sheet dimensions in PDF points (1 pt = 1/72 in), landscape. */
export const SHEET_SIZES: Record<SheetSize, { width: number; height: number; margin: number }> = {
  A1: { width: 2384, height: 1684, margin: 56 },
  A2: { width: 1684, height: 1191, margin: 42 },
  A3: { width: 1191, height: 842, margin: 28 },
  A4: { width: 842, height: 595, margin: 20 },
};

export interface TitleBlockFields {
  projectName: string;
  drawingTitle: string;
  drawingNumber?: string;
  revision?: string;
  scale?: string;
  date?: string;
  drawnBy?: string;
  checkedBy?: string;
  /** §26 — compliance status carried into the sheet, not hidden. */
  complianceStatus?: string;
  standardsProfile?: string;
}

export interface PdfSheetOptions {
  size?: SheetSize;
  /** Drawing scale denominator; 50 means 1:50. Omit to fit automatically. */
  scaleDenominator?: number;
  titleBlock: TitleBlockFields;
  /** Extra metadata rows rendered beneath the title block. */
  metadata?: Record<string, string>;
  includeConstruction?: boolean;
  includeScaleBar?: boolean;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function computeBounds(sketch: ParametricSketch): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of Object.values(sketch.primitives.points ?? {})) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  for (const c of Object.values(sketch.primitives.circles ?? {})) {
    const centre = sketch.primitives.points?.[c.centerPointId];
    if (!centre) continue;
    minX = Math.min(minX, centre.x - c.radius);
    minY = Math.min(minY, centre.y - c.radius);
    maxX = Math.max(maxX, centre.x + c.radius);
    maxY = Math.max(maxY, centre.y + c.radius);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

/** Escapes a string for a PDF literal-string operand. */
function pdfText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const MM_PER_POINT = 25.4 / 72;

/**
 * Renders the sketch onto a formal drawing sheet and returns the PDF bytes.
 *
 * The model is in millimetres (§17); the sheet is in points. The transform is
 * an explicit, reported scale — never an implicit "fit", so a drawing issued at
 * 1:50 says 1:50 and measures 1:50.
 */
export function exportPdfSheet(
  sketch: ParametricSketch,
  options: PdfSheetOptions
): Uint8Array {
  const size = SHEET_SIZES[options.size ?? "A3"];
  const margin = size.margin;
  const titleBlockWidth = Math.min(360, size.width * 0.28);
  const titleBlockHeight = Math.min(150, size.height * 0.2);

  const bounds = computeBounds(sketch);
  const modelW = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const modelH = Math.max(bounds.maxY - bounds.minY, 1e-6);

  // Drawing frame, leaving room for the title block in the bottom-right.
  const frame = {
    x: margin,
    y: margin,
    width: size.width - 2 * margin,
    height: size.height - 2 * margin,
  };
  const drawArea = {
    x: frame.x + 12,
    y: frame.y + titleBlockHeight + 24,
    width: frame.width - 24,
    height: frame.height - titleBlockHeight - 36,
  };

  let scalePtPerMm: number;
  let scaleLabel: string;
  if (options.scaleDenominator && options.scaleDenominator > 0) {
    scalePtPerMm = 1 / (MM_PER_POINT * options.scaleDenominator);
    scaleLabel = `1:${options.scaleDenominator}`;
  } else {
    scalePtPerMm = Math.min(drawArea.width / modelW, drawArea.height / modelH) * 0.92;
    const denom = 1 / (scalePtPerMm * MM_PER_POINT);
    scaleLabel = `1:${denom >= 10 ? Math.round(denom) : denom.toFixed(1)}`;
  }

  const offsetX =
    drawArea.x + (drawArea.width - modelW * scalePtPerMm) / 2 - bounds.minX * scalePtPerMm;
  const offsetY =
    drawArea.y + (drawArea.height - modelH * scalePtPerMm) / 2 - bounds.minY * scalePtPerMm;

  const X = (mx: number) => offsetX + mx * scalePtPerMm;
  const Y = (my: number) => offsetY + my * scalePtPerMm;

  const ops: string[] = [];

  // ---- Sheet border (double rule, drafting convention) ----
  ops.push("0 0 0 RG", "1.6 w");
  ops.push(`${frame.x} ${frame.y} ${frame.width} ${frame.height} re S`);
  ops.push("0.6 w");
  ops.push(
    `${frame.x + 5} ${frame.y + 5} ${frame.width - 10} ${frame.height - 10} re S`
  );

  // ---- Geometry ----
  ops.push("0.9 w", "0 0 0 RG");
  const points = sketch.primitives.points ?? {};

  for (const line of Object.values(sketch.primitives.lines ?? {})) {
    if (line.isConstruction === true && options.includeConstruction !== true) continue;
    const a = points[line.startPointId];
    const b = points[line.endPointId];
    if (!a || !b) continue;
    if (line.isConstruction) ops.push("q 0.5 w [4 3] 0 d 0.7 0.1 0.1 RG");
    ops.push(`${X(a.x).toFixed(3)} ${Y(a.y).toFixed(3)} m ${X(b.x).toFixed(3)} ${Y(b.y).toFixed(3)} l S`);
    if (line.isConstruction) ops.push("Q");
  }

  for (const poly of Object.values(sketch.primitives.polylines ?? {})) {
    if (poly.isConstruction === true && options.includeConstruction !== true) continue;
    const verts = poly.vertices.map((v) => points[v]).filter(Boolean);
    if (verts.length < 2) continue;
    ops.push(`${X(verts[0].x).toFixed(3)} ${Y(verts[0].y).toFixed(3)} m`);
    for (let i = 1; i < verts.length; i++) {
      ops.push(`${X(verts[i].x).toFixed(3)} ${Y(verts[i].y).toFixed(3)} l`);
    }
    ops.push(poly.closed ? "h S" : "S");
  }

  for (const circle of Object.values(sketch.primitives.circles ?? {})) {
    if (circle.isConstruction === true && options.includeConstruction !== true) continue;
    const c = points[circle.centerPointId];
    if (!c) continue;
    ops.push(...bezierCircle(X(c.x), Y(c.y), circle.radius * scalePtPerMm));
  }

  for (const arc of Object.values(sketch.primitives.arcs ?? {})) {
    if (arc.isConstruction === true && options.includeConstruction !== true) continue;
    const c = points[arc.centerPointId];
    if (!c) continue;
    ops.push(
      ...bezierArc(
        X(c.x),
        Y(c.y),
        arc.radius * scalePtPerMm,
        arc.startAngle,
        arc.endAngle
      )
    );
  }

  // ---- Scale bar ----
  if (options.includeScaleBar !== false) {
    const barModelMm = niceScaleBarLength(modelW);
    const barPt = barModelMm * scalePtPerMm;
    const bx = frame.x + 16;
    const by = frame.y + 16;
    ops.push("q 0.8 w 0 0 0 RG");
    for (let i = 0; i < 4; i++) {
      const seg = barPt / 4;
      if (i % 2 === 0) ops.push("0 0 0 rg");
      else ops.push("1 1 1 rg");
      ops.push(`${bx + i * seg} ${by} ${seg} 6 re B`);
    }
    ops.push("Q");
    ops.push(
      textOp(
        bx,
        by + 10,
        7,
        `0${" ".repeat(6)}${barModelMm} mm      SCALE ${scaleLabel}`
      )
    );
  }

  // ---- Title block ----
  const tbx = frame.x + frame.width - titleBlockWidth - 8;
  const tby = frame.y + 8;
  ops.push("1 w 0 0 0 RG");
  ops.push(`${tbx} ${tby} ${titleBlockWidth} ${titleBlockHeight} re S`);

  const tb = options.titleBlock;
  const rows: [string, string][] = [
    ["PROJECT", tb.projectName],
    ["TITLE", tb.drawingTitle],
    ["DRAWING No.", tb.drawingNumber ?? "-"],
    ["REV", tb.revision ?? "-"],
    ["SCALE", tb.scale ?? scaleLabel],
    ["DATE", tb.date ?? new Date().toISOString().slice(0, 10)],
    ["DRAWN", tb.drawnBy ?? "-"],
    ["CHECKED", tb.checkedBy ?? "-"],
  ];
  if (tb.standardsProfile) rows.push(["STANDARD", tb.standardsProfile]);
  if (tb.complianceStatus) rows.push(["COMPLIANCE", tb.complianceStatus]);

  const rowHeight = titleBlockHeight / Math.max(rows.length, 1);
  rows.forEach(([label, value], i) => {
    const ry = tby + titleBlockHeight - (i + 1) * rowHeight;
    ops.push("0.4 w");
    ops.push(`${tbx} ${ry} m ${tbx + titleBlockWidth} ${ry} l S`);
    ops.push(textOp(tbx + 5, ry + rowHeight * 0.32, 6, label));
    ops.push(textOp(tbx + 82, ry + rowHeight * 0.32, 7, value.slice(0, 44)));
  });

  // ---- Metadata table ----
  if (options.metadata) {
    let mrow = 0;
    for (const [k, v] of Object.entries(options.metadata)) {
      ops.push(
        textOp(frame.x + 16, frame.y + titleBlockHeight + 4 - mrow * 9, 6, `${k}: ${v}`.slice(0, 110))
      );
      mrow += 1;
      if (mrow > 6) break;
    }
  }

  return assemblePdf(size.width, size.height, ops.join("\n"));
}

function textOp(x: number, y: number, size: number, text: string): string {
  return `BT /F1 ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfText(text)}) Tj ET`;
}

/** Four-arc Bézier approximation of a full circle (max radial error ~0.02 %). */
function bezierCircle(cx: number, cy: number, r: number): string[] {
  const k = 0.5522847498307936 * r;
  return [
    `${(cx + r).toFixed(3)} ${cy.toFixed(3)} m`,
    `${(cx + r).toFixed(3)} ${(cy + k).toFixed(3)} ${(cx + k).toFixed(3)} ${(cy + r).toFixed(3)} ${cx.toFixed(3)} ${(cy + r).toFixed(3)} c`,
    `${(cx - k).toFixed(3)} ${(cy + r).toFixed(3)} ${(cx - r).toFixed(3)} ${(cy + k).toFixed(3)} ${(cx - r).toFixed(3)} ${cy.toFixed(3)} c`,
    `${(cx - r).toFixed(3)} ${(cy - k).toFixed(3)} ${(cx - k).toFixed(3)} ${(cy - r).toFixed(3)} ${cx.toFixed(3)} ${(cy - r).toFixed(3)} c`,
    `${(cx + k).toFixed(3)} ${(cy - r).toFixed(3)} ${(cx + r).toFixed(3)} ${(cy - k).toFixed(3)} ${(cx + r).toFixed(3)} ${cy.toFixed(3)} c`,
    "S",
  ];
}

/** Bézier arc, split so no segment spans more than 90°. */
function bezierArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string[] {
  let sweep = endAngle - startAngle;
  while (sweep <= 0) sweep += 2 * Math.PI;
  const segments = Math.max(1, Math.ceil(sweep / (Math.PI / 2)));
  const step = sweep / segments;

  const ops: string[] = [];
  let a0 = startAngle;
  ops.push(`${(cx + r * Math.cos(a0)).toFixed(3)} ${(cy + r * Math.sin(a0)).toFixed(3)} m`);

  for (let i = 0; i < segments; i++) {
    const a1 = a0 + step;
    const k = (4 / 3) * Math.tan(step / 4) * r;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const c1x = x0 - k * Math.sin(a0);
    const c1y = y0 + k * Math.cos(a0);
    const c2x = x1 + k * Math.sin(a1);
    const c2y = y1 - k * Math.cos(a1);
    ops.push(
      `${c1x.toFixed(3)} ${c1y.toFixed(3)} ${c2x.toFixed(3)} ${c2y.toFixed(3)} ${x1.toFixed(3)} ${y1.toFixed(3)} c`
    );
    a0 = a1;
  }
  ops.push("S");
  return ops;
}

/** Rounds a scale-bar length to 1, 2, or 5 times a power of ten. */
function niceScaleBarLength(modelWidth: number): number {
  const target = modelWidth / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(target, 1))));
  for (const m of [1, 2, 5, 10]) {
    if (mag * m >= target) return mag * m;
  }
  return mag * 10;
}

/** Assembles a minimal, valid PDF 1.4 file with a correct xref table. */
function assemblePdf(width: number, height: number, content: string): Uint8Array {
  const objects: string[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`
  );
  objects.push(`<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((body, i) => {
    offsets.push(byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
