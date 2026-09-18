/**
 * Paper primitives → PDF (vector, one page per sheet).
 *
 * Dependency-free PDF 1.4 in the same spirit as lib/io/pdfSheetExporter.ts
 * (§69: vector paths, never a raster, never chained through SVG). Paper is in
 * millimetres with Y down; PDF is in points with Y up, so the one transform is
 * applied here.
 */

import type { DrawPrim } from "./drawList";
import { textWidth } from "./drawList";
import { resolvePrimStyle, type SvgStyleOptions } from "./svgRender";
import type { Layer } from "./types";

const PT_PER_MM = 72 / 25.4;

/** WinAnsi codes for the few non-ASCII characters drawings use. */
const WIN_ANSI: Record<string, number> = {
  "×": 0xd7,
  "Ø": 0xd8,
  "ø": 0xf8,
  "°": 0xb0,
  "•": 0x95,
  "—": 0x97,
  "–": 0x96,
  "·": 0xb7,
  "±": 0xb1,
  "²": 0xb2,
  "³": 0xb3,
};

const REPLACE: Record<string, string> = { "℄": "CL", "−": "-", "…": "...", "≥": ">=", "≤": "<=", "→": "->" };

export function pdfString(s: string): string {
  let out = "";
  for (const ch of s) {
    const r = REPLACE[ch];
    if (r) {
      out += r;
      continue;
    }
    const code = ch.codePointAt(0)!;
    if (ch === "\\" || ch === "(" || ch === ")") out += "\\" + ch;
    else if (code >= 32 && code < 127) out += ch;
    else if (WIN_ANSI[ch] !== undefined) out += "\\" + WIN_ANSI[ch].toString(8).padStart(3, "0");
    else out += "?";
  }
  return out;
}

function rgb(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "0 0 0";
  const n = parseInt(m[1], 16);
  return `${(((n >> 16) & 255) / 255).toFixed(3)} ${(((n >> 8) & 255) / 255).toFixed(3)} ${((n & 255) / 255).toFixed(3)}`;
}

const f = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "0");

function pageOps(prims: DrawPrim[], layers: Layer[], pageHeightMm: number, o: Omit<SvgStyleOptions, "modelPerPaper">): string {
  const map = new Map(layers.map((l) => [l.id, l]));
  const X = (x: number) => x * PT_PER_MM;
  const Y = (y: number) => (pageHeightMm - y) * PT_PER_MM;
  const ops: string[] = ["1 J 1 j"];
  for (const p of prims) {
    const st = resolvePrimStyle(p, map, { ...o, modelPerPaper: 1 });
    if (!st.visible) continue;
    const col = rgb(st.color);
    const w = Math.max(st.width * PT_PER_MM, 0.1);
    const dash = st.dash ? `[${st.dash.split(" ").map((d) => f(Number(d) * PT_PER_MM)).join(" ")}] 0 d` : "[] 0 d";
    const stroke = `${col} RG ${f(w)} w ${dash}`;
    switch (p.k) {
      case "line":
        ops.push(`${stroke} ${f(X(p.x1))} ${f(Y(p.y1))} m ${f(X(p.x2))} ${f(Y(p.y2))} l S`);
        break;
      case "polyline": {
        if (p.points.length < 2) break;
        const d = p.points.map((q, i) => `${f(X(q.x))} ${f(Y(q.y))} ${i === 0 ? "m" : "l"}`).join(" ");
        ops.push(`${stroke} ${d} ${p.closed ? "h S" : "S"}`);
        break;
      }
      case "circle": {
        const cx = X(p.cx);
        const cy = Y(p.cy);
        const r = p.r * PT_PER_MM;
        const k = 0.5522847498 * r;
        ops.push(
          `${stroke} ${f(cx + r)} ${f(cy)} m ${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c ${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(cx - r)} ${f(cy)} c ${f(cx - r)} ${f(cy - k)} ${f(cx - k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} c ${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} c S`
        );
        break;
      }
      case "arc": {
        const n = 16;
        const pts: string[] = [];
        for (let i = 0; i <= n; i++) {
          const a = p.start + ((p.end - p.start) * i) / n;
          pts.push(`${f(X(p.cx + p.r * Math.cos(a)))} ${f(Y(p.cy + p.r * Math.sin(a)))} ${i === 0 ? "m" : "l"}`);
        }
        ops.push(`${stroke} ${pts.join(" ")} S`);
        break;
      }
      case "fill": {
        const rings = [p.points, ...(p.holes ?? [])];
        const d = rings.map((r) => r.map((q, i) => `${f(X(q.x))} ${f(Y(q.y))} ${i === 0 ? "m" : "l"}`).join(" ") + " h").join(" ");
        ops.push(`${col} rg ${d} f*`);
        break;
      }
      case "dots": {
        if (!p.points.length) break;
        const d = p.points.map((q) => `${f(X(q.x))} ${f(Y(q.y))} m ${f(X(q.x))} ${f(Y(q.y))} l`).join(" ");
        ops.push(`${col} RG ${f(Math.max(p.r * 2 * PT_PER_MM, 0.3))} w [] 0 d ${d} S`);
        break;
      }
      case "segments": {
        if (!p.segs.length) break;
        let d = "";
        for (let i = 0; i + 3 < p.segs.length; i += 4) d += `${f(X(p.segs[i]))} ${f(Y(p.segs[i + 1]))} m ${f(X(p.segs[i + 2]))} ${f(Y(p.segs[i + 3]))} l `;
        ops.push(`${stroke} ${d}S`);
        break;
      }
      case "text": {
        const size = p.height * PT_PER_MM;
        const lines = p.text.split("\n");
        const lh = p.height * 1.35;
        const base = p.baseline === "top" ? p.height : p.baseline === "middle" ? p.height * 0.35 - ((lines.length - 1) * lh) / 2 : -(lines.length - 1) * lh;
        const rad = ((p.rotation ?? 0) * Math.PI) / 180;
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        lines.forEach((line, i) => {
          const w = textWidth(line, p.height) * 0.92;
          const dx = p.align === "center" ? -w / 2 : p.align === "right" ? -w : 0;
          const dy = base + i * lh;
          // Offset in the text's own frame (paper, Y down), rotated about the anchor.
          const ox = p.x + dx * c + dy * s;
          const oy = p.y - dx * s + dy * c;
          ops.push(`BT ${col} rg /${p.bold ? "F2" : "F1"} ${f(size)} Tf ${f(c)} ${f(s)} ${f(-s)} ${f(c)} ${f(X(ox))} ${f(Y(oy))} Tm (${pdfString(line)}) Tj ET`);
        });
        break;
      }
    }
  }
  return ops.join("\n");
}

function byteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) n += s.charCodeAt(i) > 255 ? 2 : 1;
  return n;
}

export interface PdfPage {
  widthMm: number;
  heightMm: number;
  prims: DrawPrim[];
}

/** A multi-page vector PDF. Returns the file as bytes. */
export function pagesToPdf(pages: PdfPage[], layers: Layer[], opts: { monochrome?: boolean; title?: string } = {}): Uint8Array {
  const objects: string[] = [];
  const pageRefs: number[] = [];
  // 1 catalog, 2 pages, 3 F1, 4 F2, then per page: page + content.
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  for (const pg of pages) {
    const content = pageOps(pg.prims, layers, pg.heightMm, { background: "white", monochrome: opts.monochrome });
    const pageNo = objects.length + 1;
    pageRefs.push(pageNo);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pg.widthMm * PT_PER_MM)} ${f(pg.heightMm * PT_PER_MM)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageNo + 1} 0 R >>`
    );
    objects.push(`<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((r) => `${r} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;
  if (opts.title) objects.push(`<< /Title (${pdfString(opts.title)}) /Producer (2D Canvas UPCE) >>`);
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${opts.title ? ` /Info ${objects.length} 0 R` : ""} >>\nstartxref\n${xref}\n%%EOF\n`;
  // Latin-1 bytes: every char we emitted is < 256.
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 255;
  return bytes;
}
