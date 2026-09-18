/**
 * Draw list → SVG markup.
 *
 * Used for the SVG export and for sheet previews. The canvas uses React
 * elements instead (features/canvas/AnnotationLayer.tsx) but shares the same
 * primitives and the same layer styling rules, so the two cannot drift.
 */

import type { DrawPrim } from "./drawList";
import { dashPattern, INK } from "./layers";
import type { Layer } from "./types";

export interface SvgStyleOptions {
  /** Paper colour; ink (#ffffff layers) is drawn in the contrasting colour. */
  background: "white" | "dark";
  /** Model mm per paper mm, to turn plotted lineweights into model units. */
  modelPerPaper: number;
  /** Draw every layer in ink (monochrome plot). */
  monochrome?: boolean;
  /** Include layers that are set not to plot. */
  includeNonPlot?: boolean;
}

export interface ResolvedStyle {
  color: string;
  width: number;
  dash: string | undefined;
  visible: boolean;
}

export function resolvePrimStyle(p: DrawPrim, layers: Map<string, Layer>, o: SvgStyleOptions): ResolvedStyle {
  const layer = layers.get(p.layerId);
  const visible = layer ? layer.visible && !layer.frozen && (o.includeNonPlot || layer.plot) : true;
  const ink = o.background === "white" ? "#111827" : "#f1f5f9";
  let color = p.color ?? layer?.color ?? INK;
  if (color.toLowerCase() === INK || o.monochrome) color = ink;
  else if (o.background === "white") color = darken(color);
  const weight = p.weight ?? layer?.lineWeight ?? 0.25;
  const width = weight * o.modelPerPaper;
  const pattern = dashPattern(p.dash ?? layer?.lineType ?? "continuous");
  const dash = pattern ? pattern.map((v) => (v * o.modelPerPaper * 0.6).toFixed(2)).join(" ") : undefined;
  return { color, width, dash, visible };
}

/** Light screen colours are unreadable on white paper; pull them toward ink. */
function darken(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum < 0.55) return hex;
  const k = 0.55 / lum;
  const c = (v: number) => Math.round(v * k).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const n = (v: number) => (Number.isFinite(v) ? Number(v.toFixed(3)) : 0);

function pts(points: { x: number; y: number }[]): string {
  return points.map((p) => `${n(p.x)},${n(p.y)}`).join(" ");
}

export function primToSvg(p: DrawPrim, st: ResolvedStyle): string {
  if (!st.visible) return "";
  const stroke = `stroke="${st.color}" stroke-width="${n(st.width)}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""} fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  switch (p.k) {
    case "line":
      return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" ${stroke}/>`;
    case "polyline":
      return p.closed ? `<polygon points="${pts(p.points)}" ${stroke}/>` : `<polyline points="${pts(p.points)}" ${stroke}/>`;
    case "circle":
      return `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" ${stroke}/>`;
    case "arc": {
      const x0 = p.cx + p.r * Math.cos(p.start);
      const y0 = p.cy + p.r * Math.sin(p.start);
      const x1 = p.cx + p.r * Math.cos(p.end);
      const y1 = p.cy + p.r * Math.sin(p.end);
      const large = Math.abs(p.end - p.start) > Math.PI ? 1 : 0;
      return `<path d="M${n(x0)} ${n(y0)} A${n(p.r)} ${n(p.r)} 0 ${large} 1 ${n(x1)} ${n(y1)}" ${stroke}/>`;
    }
    case "fill": {
      const rings = [p.points, ...(p.holes ?? [])];
      const d = rings.map((r) => `M${r.map((q) => `${n(q.x)} ${n(q.y)}`).join(" L")} Z`).join(" ");
      return `<path d="${d}" fill="${st.color}" fill-rule="evenodd" stroke="none"/>`;
    }
    case "dots": {
      if (p.points.length === 0) return "";
      const d = p.points.map((q) => `M${n(q.x)} ${n(q.y)}h0`).join("");
      return `<path d="${d}" stroke="${st.color}" stroke-width="${n(p.r * 2)}" stroke-linecap="round" fill="none"/>`;
    }
    case "segments": {
      if (p.segs.length === 0) return "";
      let d = "";
      for (let i = 0; i + 3 < p.segs.length; i += 4) d += `M${n(p.segs[i])} ${n(p.segs[i + 1])}L${n(p.segs[i + 2])} ${n(p.segs[i + 3])}`;
      return `<path d="${d}" ${stroke}/>`;
    }
    case "text": {
      const anchor = p.align === "center" ? "middle" : p.align === "right" ? "end" : "start";
      const lines = p.text.split("\n");
      const lh = p.height * 1.35;
      const base = p.baseline === "top" ? p.height : p.baseline === "middle" ? p.height * 0.35 - ((lines.length - 1) * lh) / 2 : -(lines.length - 1) * lh;
      const rot = p.rotation ? ` transform="rotate(${n(-p.rotation)} ${n(p.x)} ${n(p.y)})"` : "";
      const tspans = lines
        .map((l, i) => `<tspan x="${n(p.x)}" y="${n(p.y + base + i * lh)}">${esc(l)}</tspan>`)
        .join("");
      return `<text font-family="Arial, Helvetica, sans-serif" font-size="${n(p.height)}" fill="${st.color}" text-anchor="${anchor}"${p.bold ? ' font-weight="bold"' : ""}${rot}>${tspans}</text>`;
    }
  }
}

export interface SvgDocumentOptions extends SvgStyleOptions {
  /** viewBox in model mm (canvas coordinates). */
  viewBox: { x: number; y: number; width: number; height: number };
  /** Physical size, e.g. "841mm". */
  width?: string;
  height?: string;
  title?: string;
}

export function drawListToSvg(prims: DrawPrim[], layers: Layer[], o: SvgDocumentOptions): string {
  const map = new Map(layers.map((l) => [l.id, l]));
  const byLayer = new Map<string, string[]>();
  for (const p of prims) {
    const s = primToSvg(p, resolvePrimStyle(p, map, o));
    if (!s) continue;
    const arr = byLayer.get(p.layerId) ?? [];
    arr.push(s);
    byLayer.set(p.layerId, arr);
  }
  const groups = [...byLayer.entries()]
    .map(([id, els]) => `<g id="layer-${esc(id)}" inkscape:groupmode="layer" inkscape:label="${esc(id)}">${els.join("")}</g>`)
    .join("\n");
  const vb = o.viewBox;
  const bg = o.background === "white" ? "#ffffff" : "#0b1220";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="${n(vb.x)} ${n(vb.y)} ${n(vb.width)} ${n(vb.height)}"${o.width ? ` width="${o.width}"` : ""}${o.height ? ` height="${o.height}"` : ""}>
${o.title ? `<title>${esc(o.title)}</title>` : ""}
<rect x="${n(vb.x)}" y="${n(vb.y)}" width="${n(vb.width)}" height="${n(vb.height)}" fill="${bg}"/>
${groups}
</svg>`;
}
